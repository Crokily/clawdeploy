import { Type, type Static } from "@sinclair/typebox";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../lib/logger.js";

const execAsync = promisify(exec);

// Dangerous command patterns — BLOCK these
const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  /docker\s+rm\s+-f/,
  /docker\s+system\s+prune/,
  /mkfs/,
  /dd\s+if=/,
  /chmod\s+777\s+\//,
  /wget.*\|\s*sh/,
  /curl.*\|\s*sh/,
  /:\(\)\{\s*:\|:&\s*\};:/,
];

const parameters = Type.Object({
  command: Type.String({ description: "Bash command to execute" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default 30)" })),
});

export const bashTool = {
  name: "bash",
  label: "Bash",
  description:
    "Execute a bash command. Use for diagnostics: docker inspect, docker logs, curl health checks, nginx -t. Do NOT use for destructive operations — use dedicated tools instead.",
  parameters,
  execute: async (
    toolCallId: string,
    params: Static<typeof parameters>,
    signal?: AbortSignal,
    onUpdate?: (partialResult: any) => void,
  ) => {
    const { command, timeout } = params;

    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        throw new Error(`Blocked dangerous command: ${command.slice(0, 80)}`);
      }
    }

    logger.info({ command: command.slice(0, 200) }, "Executing bash command");

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: (timeout ?? 30) * 1000,
        maxBuffer: 1024 * 1024,
        cwd: "/home/ubuntu",
      });

      const output = [stdout, stderr].filter(Boolean).join("\n").slice(0, 10000);
      return {
        content: [{ type: "text" as const, text: output || "(no output)" }],
        details: { exitCode: 0 },
      };
    } catch (err: any) {
      const output = [err.stdout, err.stderr].filter(Boolean).join("\n").slice(0, 5000);
      return {
        content: [{ type: "text" as const, text: `Exit code: ${err.code ?? 1}\n${output}` }],
        details: { exitCode: err.code ?? 1 },
      };
    }
  },
};
