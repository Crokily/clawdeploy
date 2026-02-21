import { Type } from "@sinclair/typebox";
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

export const instanceCreateTool = {
  name: "instance_create",
  description:
    "Create a new OpenClaw instance: creates DB record, storage, config, Docker container, and updates Nginx. Returns instance details.",
  parameters: Type.Object({
    name: Type.String({ description: "Instance display name" }),
    userId: Type.String({ description: "Owner user ID" }),
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
  }),
  execute: async (args: {
    name: string;
    userId: string;
    channel?: string;
    botToken?: string;
    aiProvider?: string;
    apiKey?: string;
  }) => {
    if (!args.userId || !args.userId.startsWith("user_")) {
      throw new Error("Invalid userId - must be a valid Clerk user ID");
    }

    logger.info({ userId: args.userId, name: args.name }, "Creating instance");

    const instance = await prisma.instance.create({
      data: {
        name: args.name,
        channel: args.channel || "",
        botToken: args.botToken,
        apiKey: args.apiKey,
        aiProvider: args.aiProvider || null,
        userId: args.userId,
        status: "creating",
      },
    });

    try {
      await createInstanceStorage(instance.id);

      const gatewayToken = generateGatewayToken();
      const configParams = {
        instanceId: instance.id,
        gatewayToken,
        channel: args.channel as "telegram" | "discord" | "" | undefined,
        botToken: args.botToken,
        aiProvider: args.aiProvider,
        apiKey: args.apiKey,
      };

      const openclawConfig = generateOpenClawConfig(configParams);
      const envContent = generateEnvFile(configParams);
      await writeInstanceConfig(instance.id, openclawConfig, envContent);

      const envVars: Record<string, string> = {};
      if (args.apiKey && args.aiProvider) {
        const providerEnvMap: Record<string, string> = {
          anthropic: "ANTHROPIC_API_KEY",
          openai: "OPENAI_API_KEY",
          gemini: "GEMINI_API_KEY",
          openrouter: "OPENROUTER_API_KEY",
        };
        const envVar = providerEnvMap[args.aiProvider.toLowerCase()];
        if (envVar) {
          envVars[envVar] = args.apiKey;
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
