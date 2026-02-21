import { Type, type Static } from "@sinclair/typebox";
import { writeFile, mkdir } from "fs/promises";
import { logger } from "../lib/logger.js";

const REPORT_DIR = "/var/log/pideploy/reports";
const parameters = Type.Object({
  success: Type.Boolean({ description: "Whether the task succeeded" }),
  action: Type.String({
    description:
      "What action was performed (e.g., instance_create, heartbeat_check)",
  }),
  data: Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
      description: "Structured result data",
    }),
  ),
  errors: Type.Optional(
    Type.Array(Type.String(), { description: "Error messages if any" }),
  ),
});

export const reportResultTool = {
  name: "report_result",
  label: "Report Result",
  description:
    "MUST call when any task completes (success or failure). Reports structured result for the orchestrator to process.",
  parameters,
  execute: async (
    toolCallId: string,
    params: Static<typeof parameters>,
    signal?: AbortSignal,
    onUpdate?: (partialResult: any) => void,
  ) => {
    const report = {
      ...params,
      timestamp: new Date().toISOString(),
    };

    logger.info({ report }, "Task result reported");

    // Persist to file
    try {
      await mkdir(REPORT_DIR, { recursive: true });
      const filename = `report_${Date.now()}.json`;
      await writeFile(`${REPORT_DIR}/${filename}`, JSON.stringify(report, null, 2));
    } catch (err) {
      logger.warn({ err }, "Failed to persist report (non-fatal)");
    }

    return {
      content: [{ type: "text" as const, text: "Result recorded." }],
      details: report,
    };
  },
};
