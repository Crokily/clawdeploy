import { z } from "zod";

export const instanceStatusSchema = z.enum([
  "pending",
  "creating",
  "running",
  "stopped",
  "error",
  "updating",
  "deleted",
]);

export const instanceIdSchema = z.string().trim().min(1, "Invalid instance id");

export const createInstanceSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    channel: z.enum(["telegram", "discord", ""]).optional().default(""),
    botToken: z.string().optional(),
    apiKey: z.string().optional(),
    aiProvider: z.enum(["anthropic", "openai", "gemini", "openrouter", ""]).optional().default(""),
    region: z.string().optional(),
    instanceType: z.string().optional(),
  })
  .strict()
  .refine(
    (data) => {
      // If channel is selected, botToken is required
      const ch = data.channel as string;
      if (ch && ch.length > 0 && !data.botToken) {
        return false;
      }
      return true;
    },
    { message: "Bot token is required when a channel is selected", path: ["botToken"] },
  )
  .refine(
    (data) => {
      // If AI provider is selected, apiKey is required
      const prov = data.aiProvider as string;
      if (prov && prov.length > 0 && !data.apiKey) {
        return false;
      }
      return true;
    },
    { message: "API key is required when an AI provider is selected", path: ["apiKey"] },
  );

export const updateInstanceSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100).optional(),
    status: instanceStatusSchema.optional(),
    botToken: z.string().optional(),
    apiKey: z.string().optional(),
    config: z.any().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;
export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>;
