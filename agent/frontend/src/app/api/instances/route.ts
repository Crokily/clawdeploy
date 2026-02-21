import type { Instance } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth, isAuthErrorResponse } from "@/lib/auth";
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
    const instance = await prisma.$transaction(async (tx) => {
      const created = await tx.instance.create({
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

      await tx.task.create({
        data: {
          type: "instance_create",
          params: {
            name: parsed.data.name,
            channel: parsed.data.channel,
            botToken: parsed.data.botToken,
            aiProvider: parsed.data.aiProvider,
            apiKey: parsed.data.apiKey,
          },
          userId,
          instanceId: created.id,
          status: "pending",
        },
      });

      return created;
    });

    return NextResponse.json(
      { instance: redactInstanceSecrets(instance) },
      { status: 202 },
    );
  } catch (error: unknown) {
    logger.error({ err: error, userId }, "Failed to create instance");
    return internalServerError();
  }
}
