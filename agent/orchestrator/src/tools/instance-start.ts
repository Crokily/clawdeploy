import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../lib/prisma.js";
import { startContainer } from "../lib/docker.js";
import { updateNginxPortMap } from "../lib/nginx.js";
import { logger } from "../lib/logger.js";

const parameters = Type.Object({
  instanceId: Type.String({ description: "Instance ID to start" }),
  userId: Type.String({ description: "Owner user ID" }),
});

export const instanceStartTool = {
  name: "instance_start",
  label: "Start Instance",
  description:
    "Start an existing instance container for the owning user, mark status as running, and sync Nginx.",
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

    const instance = await prisma.instance.findFirst({
      where: {
        id: params.instanceId,
        userId: params.userId,
      },
    });

    if (!instance) {
      throw new Error("Instance not found");
    }

    if (!instance.containerId) {
      throw new Error("Instance has no container");
    }

    await startContainer(instance.containerId);

    const result = await prisma.instance.updateMany({
      where: {
        id: params.instanceId,
        userId: params.userId,
      },
      data: {
        status: "running",
      },
    });

    if (result.count === 0) {
      throw new Error("Instance not found");
    }

    const updated = await prisma.instance.findFirst({
      where: {
        id: params.instanceId,
        userId: params.userId,
      },
      select: {
        id: true,
        status: true,
        port: true,
        gatewayToken: true,
      },
    });

    if (!updated) {
      throw new Error("Instance not found");
    }

    try {
      await updateNginxPortMap();
    } catch (nginxErr) {
      logger.warn({ err: nginxErr }, "Nginx sync failed (non-fatal)");
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(updated) }],
      details: updated,
    };
  },
};
