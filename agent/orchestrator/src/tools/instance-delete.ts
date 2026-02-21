import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../lib/prisma.js";
import { removeContainer } from "../lib/docker.js";
import { removeInstanceStorage } from "../lib/instance-config.js";
import { updateNginxPortMap } from "../lib/nginx.js";
import { logger } from "../lib/logger.js";

function isContainerNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("no such container");
}

const parameters = Type.Object({
  instanceId: Type.String({ description: "Instance ID to delete" }),
  userId: Type.String({ description: "Owner user ID" }),
});

export const instanceDeleteTool = {
  name: "instance_delete",
  label: "Delete Instance",
  description:
    "Delete an existing instance for the owning user by removing container, storage, DB record, and syncing Nginx.",
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
      select: { id: true, userId: true, containerId: true },
    });

    if (!instance) {
      throw new Error("Instance not found");
    }

    if (instance.userId !== params.userId) {
      throw new Error("Instance not owned by user");
    }

    if (instance.containerId) {
      try {
        await removeContainer(instance.containerId);
      } catch (error) {
        if (isContainerNotFoundError(error)) {
          logger.warn(
            { instanceId: instance.id, containerId: instance.containerId, err: error },
            "Container already missing during delete; continuing cleanup",
          );
        } else {
          throw error;
        }
      }
    }

    await removeInstanceStorage(instance.id);
    await prisma.instance.delete({ where: { id: instance.id } });

    try {
      await updateNginxPortMap();
    } catch (nginxErr) {
      logger.warn({ err: nginxErr }, "Nginx sync failed (non-fatal)");
    }

    const result = { success: true, instanceId: instance.id };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      details: result,
    };
  },
};
