import type { Instance } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth, isAuthErrorResponse } from "@/lib/auth";
import { createContainer } from "@/lib/docker";
import {
  generateGatewayToken,
  generateOpenClawConfig,
  generateEnvFile,
  createInstanceStorage,
  writeInstanceConfig,
  removeInstanceStorage,
} from "@/lib/instance-config";
import { createInstanceSchema } from "@/lib/instance-schema";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type ErrorResponse = {
  error: string;
  details?: unknown;
  retryAfter?: number;
};

type ListInstancesResponse = {
  instances: Instance[];
};

type SingleInstanceResponse = {
  instance: Instance;
};

function invalidInput(details: unknown): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: "Invalid input", details }, { status: 400 });
}

function internalServerError(): NextResponse<ErrorResponse> {
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

function tooManyRequests(retryAfter: number): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { error: "Too many requests", retryAfter },
    { status: 429 },
  );
}

function redactInstanceSecrets(instance: Instance): Instance {
  return {
    ...instance,
    botToken: null,
    apiKey: null,
    gatewayToken: null,
  };
}

export async function GET(): Promise<
  NextResponse<ListInstancesResponse | ErrorResponse>
> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;

  try {
    const instances = await prisma.instance.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      instances: instances.map((instance) => redactInstanceSecrets(instance)),
    });
  } catch (error: unknown) {
    logger.error({ err: error, userId }, "Failed to fetch instances");
    return internalServerError();
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse<SingleInstanceResponse | ErrorResponse>> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;
  const rateLimitResult = checkRateLimit(userId);
  if (!rateLimitResult.allowed) {
    return tooManyRequests(rateLimitResult.retryAfter ?? 1);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error: unknown) {
    logger.error({ err: error, userId }, "Invalid JSON for instance creation");
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = createInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error.issues);
  }

  try {
    // 1. Create DB record
    const instance = await prisma.instance.create({
      data: {
        name: parsed.data.name,
        channel: parsed.data.channel || "",
        botToken: parsed.data.botToken,
        apiKey: parsed.data.apiKey,
        aiProvider: parsed.data.aiProvider || null,
        region: parsed.data.region,
        instanceType: parsed.data.instanceType,
        userId,
        status: "creating",
      },
    });

    let finalInstance = instance;

    try {
      // 2. Create persistent storage
      await createInstanceStorage(instance.id);

      // 3. Generate config
      const gatewayToken = generateGatewayToken();
      const configParams = {
        instanceId: instance.id,
        gatewayToken,
        channel: parsed.data.channel as "telegram" | "discord" | "" | undefined,
        botToken: parsed.data.botToken,
        aiProvider: parsed.data.aiProvider,
        apiKey: parsed.data.apiKey,
      };

      const openclawConfig = generateOpenClawConfig(configParams);
      const envContent = generateEnvFile(configParams);
      await writeInstanceConfig(instance.id, openclawConfig, envContent);

      // 4. Create Docker container
      const envVars: Record<string, string> = {};
      if (parsed.data.apiKey && parsed.data.aiProvider) {
        const providerEnvMap: Record<string, string> = {
          anthropic: "ANTHROPIC_API_KEY",
          openai: "OPENAI_API_KEY",
          gemini: "GEMINI_API_KEY",
          openrouter: "OPENROUTER_API_KEY",
        };
        const envVar = providerEnvMap[parsed.data.aiProvider];
        if (envVar) {
          envVars[envVar] = parsed.data.apiKey;
        }
      }

      const { containerId, port } = await createContainer({
        instanceId: instance.id,
        gatewayToken,
        envVars,
      });

      // 5. Update DB with container details
      finalInstance = await prisma.instance.update({
        where: { id: instance.id },
        data: {
          containerId,
          port,
          gatewayToken,
          status: "running",
        },
      });

      // 6. Update Nginx port map (fire and forget)
      try {
        const { updateNginxPortMap } = await import("@/lib/nginx");
        await updateNginxPortMap();
      } catch (nginxError) {
        logger.warn({ err: nginxError }, "Failed to update Nginx port map");
      }
    } catch (dockerError: unknown) {
      logger.error(
        { err: dockerError, userId, instanceId: instance.id },
        "Failed to create OpenClaw instance",
      );

      // Cleanup storage on failure
      try {
        await removeInstanceStorage(instance.id);
      } catch {
        // Ignore cleanup errors
      }

      finalInstance = await prisma.instance.update({
        where: { id: instance.id },
        data: {
          status: "error",
        },
      });
    }

    return NextResponse.json({ instance: redactInstanceSecrets(finalInstance) }, { status: 201 });
  } catch (error: unknown) {
    logger.error({ err: error, userId }, "Failed to create instance");
    return internalServerError();
  }
}
