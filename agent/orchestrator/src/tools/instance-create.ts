import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../lib/prisma.js";
import { createContainer } from "../lib/docker.js";
import {
  generateGatewayToken,
  generateOpenClawConfig,
  generateEnvFile,
  createInstanceStorage,
  writeInstanceConfig,
  removeInstanceStorage,
} from "../lib/instance-config.js";
import { updateNginxPortMap } from "../lib/nginx.js";
import { logger } from "../lib/logger.js";

const parameters = Type.Object({
  name: Type.String({ description: "Instance display name" }),
  userId: Type.String({ description: "Owner user ID" }),
  instanceId: Type.Optional(
    Type.String({ description: "Existing placeholder instance ID to reuse" }),
  ),
  channel: Type.Optional(
    Type.String({ description: "Channel type: telegram, discord, or empty" }),
  ),
  botToken: Type.Optional(
    Type.String({ description: "Bot token for the channel" }),
  ),
  aiProvider: Type.Optional(
    Type.String({ description: "AI provider: anthropic, openai, gemini, openrouter" }),
  ),
  apiKey: Type.Optional(
    Type.String({ description: "API key for the AI provider" }),
  ),
});

export const instanceCreateTool = {
  name: "instance_create",
  label: "Create Instance",
  description:
    "Create a new OpenClaw instance: creates DB record, storage, config, Docker container, and updates Nginx. Returns instance details.",
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

    logger.info(
      { userId: params.userId, instanceId: params.instanceId, name: params.name },
      "Creating instance",
    );

    const instance = params.instanceId
      ? await (async () => {
          const existing = await prisma.instance.findUnique({
            where: { id: params.instanceId },
          });

          if (!existing) {
            throw new Error(`Instance not found: ${params.instanceId}`);
          }

          if (existing.userId !== params.userId) {
            throw new Error("Instance ownership mismatch");
          }

          return prisma.instance.update({
            where: { id: existing.id },
            data: {
              name: params.name,
              channel: params.channel || "",
              botToken: params.botToken,
              apiKey: params.apiKey,
              aiProvider: params.aiProvider || null,
              status: "creating",
            },
          });
        })()
      : await (async () => {
          const reusable = await prisma.instance.findFirst({
            where: {
              userId: params.userId,
              name: params.name,
              status: "creating",
              containerId: null,
              port: null,
            },
            orderBy: { createdAt: "asc" },
          });

          if (reusable) {
            return prisma.instance.update({
              where: { id: reusable.id },
              data: {
                name: params.name,
                channel: params.channel || "",
                botToken: params.botToken,
                apiKey: params.apiKey,
                aiProvider: params.aiProvider || null,
                status: "creating",
              },
            });
          }

          return prisma.instance.create({
            data: {
              name: params.name,
              channel: params.channel || "",
              botToken: params.botToken,
              apiKey: params.apiKey,
              aiProvider: params.aiProvider || null,
              userId: params.userId,
              status: "creating",
            },
          });
        })();

    try {
      await createInstanceStorage(instance.id);

      const gatewayToken = generateGatewayToken();
      const configParams = {
        instanceId: instance.id,
        gatewayToken,
        channel: params.channel as "telegram" | "discord" | "" | undefined,
        botToken: params.botToken,
        aiProvider: params.aiProvider,
        apiKey: params.apiKey,
      };

      const openclawConfig = generateOpenClawConfig(configParams);
      const envContent = generateEnvFile(configParams);
      await writeInstanceConfig(instance.id, openclawConfig, envContent);

      const envVars: Record<string, string> = {};
      if (params.apiKey && params.aiProvider) {
        const providerEnvMap: Record<string, string> = {
          anthropic: "ANTHROPIC_API_KEY",
          openai: "OPENAI_API_KEY",
          gemini: "GEMINI_API_KEY",
          openrouter: "OPENROUTER_API_KEY",
        };
        const envVar = providerEnvMap[params.aiProvider.toLowerCase()];
        if (envVar) {
          envVars[envVar] = params.apiKey;
        }
      }

      const { containerId, port } = await createContainer({
        instanceId: instance.id,
        gatewayToken,
        envVars,
      });

      const updated = await prisma.instance.update({
        where: { id: instance.id },
        data: { containerId, port, gatewayToken, status: "running" },
      });

      try {
        await updateNginxPortMap();
      } catch (nginxErr) {
        logger.warn({ err: nginxErr }, "Nginx sync failed (non-fatal)");
      }

      const result = {
        instanceId: updated.id,
        port: updated.port,
        gatewayToken: updated.gatewayToken,
        status: "running",
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        details: result,
      };
    } catch (err) {
      try {
        await removeInstanceStorage(instance.id);
      } catch {
        // Ignore cleanup errors
      }

      await prisma.instance.update({
        where: { id: instance.id },
        data: { status: "error" },
      });

      throw err;
    }
  },
};
