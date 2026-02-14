import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { requireAuth, isAuthErrorResponse } from "@/lib/auth";
import { createContainer, stopContainer, removeContainer } from "@/lib/docker";
import { instanceIdSchema } from "@/lib/instance-schema";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ErrorResponse = {
  error: string;
};

type UpdateResponse = {
  success: true;
  message: string;
};

// Simple lock to prevent concurrent rebuilds
let isRebuilding = false;

async function rebuildImage(): Promise<void> {
  if (isRebuilding) {
    // Wait for current rebuild to finish
    while (isRebuilding) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return;
  }

  isRebuilding = true;
  try {
    logger.info("Starting OpenClaw image rebuild...");

    // Pull latest source
    execSync("cd /opt/openclaw-src && sudo git pull --ff-only", {
      timeout: 30_000,
    });

    // Rebuild image
    execSync(
      "cd /opt/openclaw-src && docker build -t openclaw:local -f Dockerfile .",
      { timeout: 600_000 }, // 10 min timeout
    );

    logger.info("OpenClaw image rebuild complete");
  } finally {
    isRebuilding = false;
  }
}

export async function POST(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse<UpdateResponse | ErrorResponse>> {
  const authResult = await requireAuth();
  if (isAuthErrorResponse(authResult)) {
    return authResult;
  }

  const userId = authResult;
  const rateLimitResult = checkRateLimit(userId);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  const { id } = await params;
  const parsed = instanceIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid instance ID" }, { status: 400 });
  }

  try {
    // Find the instance
    const instance = await prisma.instance.findFirst({
      where: { id: parsed.data, userId },
    });

    if (!instance) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    // Set status to updating
    await prisma.instance.update({
      where: { id: instance.id },
      data: { status: "updating" },
    });

    try {
      // 1. Stop and remove old container
      if (instance.containerId) {
        try {
          await stopContainer(instance.containerId);
        } catch {
          // May already be stopped
        }
        try {
          await removeContainer(instance.containerId);
        } catch {
          // May already be removed
        }
      }

      // 2. Rebuild image (shared, with lock)
      await rebuildImage();

      // 3. Recreate container with same config
      const envVars: Record<string, string> = {};
      if (instance.apiKey && instance.aiProvider) {
        const providerEnvMap: Record<string, string> = {
          anthropic: "ANTHROPIC_API_KEY",
          openai: "OPENAI_API_KEY",
          gemini: "GEMINI_API_KEY",
          openrouter: "OPENROUTER_API_KEY",
        };
        const envVar = providerEnvMap[instance.aiProvider];
        if (envVar) {
          envVars[envVar] = instance.apiKey;
        }
      }

      const { containerId, port } = await createContainer({
        instanceId: instance.id,
        gatewayToken: instance.gatewayToken || "",
        envVars,
      });

      // 4. Update DB
      await prisma.instance.update({
        where: { id: instance.id },
        data: {
          containerId,
          port,
          status: "running",
        },
      });

      // 5. Update Nginx
      try {
        const { updateNginxPortMap } = await import("@/lib/nginx");
        await updateNginxPortMap();
      } catch {
        // Non-critical
      }

      return NextResponse.json({
        success: true,
        message: "Instance updated successfully",
      });
    } catch (updateError: unknown) {
      logger.error(
        { err: updateError, instanceId: instance.id },
        "Failed to update instance",
      );

      await prisma.instance.update({
        where: { id: instance.id },
        data: { status: "error" },
      });

      return NextResponse.json(
        {
          error:
            updateError instanceof Error
              ? updateError.message
              : "Update failed",
        },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    logger.error({ err: error, instanceId: id }, "Failed to process update");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
