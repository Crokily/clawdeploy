import { Type, type Static } from "@sinclair/typebox";
import { execFile } from "child_process";
import { open, unlink } from "fs/promises";
import { promisify } from "util";
import { prisma } from "../lib/prisma.js";
import {
  createContainer,
  getContainerStatus,
  removeContainer,
  startContainer,
  stopContainer,
} from "../lib/docker.js";
import { updateNginxPortMap } from "../lib/nginx.js";
import { logger } from "../lib/logger.js";

const execFileAsync = promisify(execFile);
const LOCK_FILE = "/tmp/pideploy-rebuild.lock";

function isContainerNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("no such container");
}

function buildEnvVars(
  aiProvider?: string | null,
  apiKey?: string | null,
): Record<string, string> | undefined {
  if (!aiProvider || !apiKey) {
    return undefined;
  }

  const providerEnvMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };

  const envVar = providerEnvMap[aiProvider.toLowerCase()];
  if (!envVar) {
    return undefined;
  }

  return { [envVar]: apiKey };
}

async function acquireLock(): Promise<boolean> {
  try {
    const fd = await open(LOCK_FILE, "wx");
    await fd.close();
    return true;
  } catch {
    return false;
  }
}

async function releaseLock(): Promise<void> {
  try {
    await unlink(LOCK_FILE);
  } catch {
    // Ignore lock release errors
  }
}

async function rebuildImage(): Promise<void> {
  await execFileAsync("git", ["pull", "--ff-only"], {
    cwd: "/opt/openclaw-src",
    timeout: 30_000,
  });

  await execFileAsync(
    "docker",
    ["build", "-t", "openclaw:local", "-f", "Dockerfile", "."],
    {
      cwd: "/opt/openclaw-src",
      timeout: 600_000,
    },
  );
}

const parameters = Type.Object({
  instanceId: Type.String({ description: "Instance ID to update" }),
  userId: Type.String({ description: "Owner user ID" }),
});

export const instanceUpdateTool = {
  name: "instance_update",
  label: "Update Instance",
  description:
    "Update an instance for the owning user by recreating the container against the latest image and syncing Nginx.",
  parameters,
  execute: async (
    toolCallId: string,
    params: Static<typeof parameters>,
    signal?: AbortSignal,
    onUpdate?: (partialResult: any) => void,
  ) => {
    if (!params.userId || !params.userId.startsWith("user_")) {
      throw new Error("Invalid userId - must be a valid Clerk user ID");
    }

    const instance = await prisma.instance.findUnique({
      where: { id: params.instanceId },
    });

    if (!instance) {
      throw new Error("Instance not found");
    }

    if (instance.userId !== params.userId) {
      throw new Error("Instance not owned by user");
    }

    if (!instance.containerId) {
      throw new Error("Instance has no container");
    }

    if (!instance.gatewayToken) {
      throw new Error("Instance has no gateway token");
    }

    const oldContainerId = instance.containerId;
    const previousPort = instance.port;
    const envVars = buildEnvVars(instance.aiProvider, instance.apiKey);
    let replacementContainerId: string | null = null;

    logger.info(
      { instanceId: instance.id, userId: params.userId },
      "Starting instance update",
    );

    await prisma.instance.update({
      where: { id: instance.id },
      data: { status: "updating" },
    });

    try {
      logger.info(
        { instanceId: instance.id, containerId: oldContainerId },
        "Stopping current container",
      );
      try {
        await stopContainer(oldContainerId);
      } catch (error) {
        if (isContainerNotFoundError(error)) {
          logger.warn(
            { instanceId: instance.id, containerId: oldContainerId, err: error },
            "Current container not found during stop; continuing",
          );
        } else {
          throw error;
        }
      }

      logger.info(
        { instanceId: instance.id, containerId: oldContainerId },
        "Removing current container",
      );
      try {
        await removeContainer(oldContainerId);
      } catch (error) {
        if (isContainerNotFoundError(error)) {
          logger.warn(
            { instanceId: instance.id, containerId: oldContainerId, err: error },
            "Current container not found during remove; continuing",
          );
        } else {
          throw error;
        }
      }

      const lockAcquired = await acquireLock();
      if (lockAcquired) {
        logger.info({ instanceId: instance.id }, "Rebuild lock acquired");
        try {
          logger.info({ instanceId: instance.id }, "Pulling latest OpenClaw source");
          await rebuildImage();
          logger.info({ instanceId: instance.id }, "OpenClaw image rebuild complete");
        } finally {
          await releaseLock();
          logger.info({ instanceId: instance.id }, "Rebuild lock released");
        }
      } else {
        logger.info(
          { instanceId: instance.id },
          "Rebuild lock is held by another update; skipping image rebuild",
        );
      }

      logger.info({ instanceId: instance.id }, "Creating replacement container");
      const { containerId, port } = await createContainer({
        instanceId: instance.id,
        gatewayToken: instance.gatewayToken,
        envVars,
      });
      replacementContainerId = containerId;

      logger.info(
        { instanceId: instance.id, containerId },
        "Ensuring replacement container is running",
      );
      const status = await getContainerStatus(containerId);
      if (status !== "running") {
        await startContainer(containerId);
      }

      const updated = await prisma.instance.update({
        where: { id: instance.id },
        data: {
          containerId,
          port,
          status: "running",
        },
        select: {
          id: true,
          status: true,
          port: true,
          gatewayToken: true,
        },
      });

      try {
        await updateNginxPortMap();
      } catch (nginxErr) {
        logger.warn({ err: nginxErr }, "Nginx sync failed (non-fatal)");
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated) }],
        details: updated,
      };
    } catch (error) {
      logger.error(
        { err: error, instanceId: instance.id },
        "Instance update failed; attempting rollback",
      );

      if (replacementContainerId) {
        try {
          await removeContainer(replacementContainerId);
        } catch (cleanupErr) {
          logger.warn(
            {
              err: cleanupErr,
              instanceId: instance.id,
              containerId: replacementContainerId,
            },
            "Failed to remove replacement container during rollback cleanup",
          );
        }
      }

      try {
        logger.info(
          { instanceId: instance.id, containerId: oldContainerId },
          "Attempting to restore old container",
        );
        await startContainer(oldContainerId);

        await prisma.instance.update({
          where: { id: instance.id },
          data: {
            containerId: oldContainerId,
            port: previousPort,
            status: "running",
          },
        });

        try {
          await updateNginxPortMap();
        } catch (nginxErr) {
          logger.warn({ err: nginxErr }, "Nginx sync failed (non-fatal)");
        }
      } catch (rollbackError) {
        logger.error(
          { err: rollbackError, instanceId: instance.id },
          "Rollback failed; marking instance as error",
        );
        await prisma.instance.update({
          where: { id: instance.id },
          data: { status: "error" },
        });
      }

      throw error;
    }
  },
};
