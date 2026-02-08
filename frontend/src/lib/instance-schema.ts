import { z } from "zod";

export const instanceStatusSchema = z.enum([
  "pending",
  "running",
  "stopped",
  "error",
]);

export const instanceIdSchema = z.string().trim().min(1, "Invalid instance id");

export const createInstanceSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    region: z.string().trim().min(1, "Region is required"),
    instanceType: z.string().trim().min(1, "Instance type is required"),
  })
  .strict();

export const updateInstanceSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100).optional(),
    status: instanceStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;
export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>;
