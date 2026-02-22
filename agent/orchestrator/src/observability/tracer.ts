import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { Langfuse } from "langfuse";
import { logger } from "../lib/logger.js";

const TRACE_DIR = "/var/log/pideploy/traces";

export interface AgentSpan {
  spanId: string;
  parentSpanId?: string;
  type: "generation" | "tool_execution" | "compaction" | "retry";
  name: string;
  startedAt: number;
  endedAt?: number;
  attributes: Record<string, any>;
}

export interface AgentTrace {
  traceId: string;
  sessionId: string;
  userId?: string;
  taskType?: string;
  startedAt: number;
  endedAt?: number;
  spans: AgentSpan[];
  totalCost: number;
  totalTokens: { input: number; output: number; cacheRead: number };
  success: boolean;
  error?: string;
}

// Helper to generate short IDs
function spanId(): string {
  return `span_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

// The tracer subscribes to an event callback pattern
// Since agentLoop yields events as an async iterator, we provide a processEvent function
export interface Tracer {
  processEvent(event: any): void;
  getTrace(): AgentTrace;
  finalize(): AgentTrace;
  save(): Promise<string>; // returns file path
}

export function createTracer(opts: {
  sessionId?: string;
  userId?: string;
  taskType?: string;
}): Tracer {
  const trace: AgentTrace = {
    traceId: `trace_${randomUUID().replace(/-/g, "")}`,
    sessionId: opts.sessionId ?? `session_${Date.now()}`,
    userId: opts.userId,
    taskType: opts.taskType,
    startedAt: Date.now(),
    spans: [],
    totalCost: 0,
    totalTokens: { input: 0, output: 0, cacheRead: 0 },
    success: true,
  };

  let currentTurnSpanId: string | undefined;
  const toolStartTimes = new Map<string, { spanId: string; startedAt: number }>();
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const lfEnabled = Boolean(publicKey && secretKey);
  let langfuse: Langfuse | null = null;
  let lfTrace: any = null;
  const lfGenerationsByTurnSpanId = new Map<string, any>();
  const lfToolSpansByToolCallId = new Map<string, any>();

  if (lfEnabled) {
    try {
      langfuse = new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL || "http://localhost:3500",
      });
    } catch (err) {
      logger.warn({ err }, "LangFuse client init failed (non-fatal)");
    }
  }

  if (lfEnabled && langfuse) {
    try {
      lfTrace = langfuse.trace({
        id: trace.traceId,
        name: opts.taskType || "unknown",
        userId: opts.userId,
        sessionId: trace.sessionId,
        metadata: { taskType: opts.taskType },
      });
    } catch (err) {
      logger.warn({ err }, "LangFuse trace creation failed (non-fatal)");
    }
  }

  function processEvent(event: any): void {
    switch (event.type) {
      case "turn_start": {
        currentTurnSpanId = spanId();
        trace.spans.push({
          spanId: currentTurnSpanId,
          type: "generation",
          name: "agent_turn",
          startedAt: Date.now(),
          attributes: {},
        });
        if (currentTurnSpanId) {
          try {
            const lfGeneration = lfTrace?.generation({
              name: "agent_turn",
              startTime: new Date(),
            });
            if (lfGeneration) {
              lfGenerationsByTurnSpanId.set(currentTurnSpanId, lfGeneration);
            }
          } catch (err) {
            logger.warn({ err }, "LangFuse generation creation failed (non-fatal)");
          }
        }
        break;
      }
      case "turn_end": {
        const turnSpan = trace.spans.find((s) => s.spanId === currentTurnSpanId);
        if (turnSpan) {
          turnSpan.endedAt = Date.now();
        }
        break;
      }
      case "message_end": {
        if (event.message?.role === "assistant") {
          const msg = event.message;
          const usage = msg.usage;
          if (usage) {
            trace.totalCost += usage.cost?.total ?? 0;
            trace.totalTokens.input += usage.input ?? 0;
            trace.totalTokens.output += usage.output ?? 0;
            trace.totalTokens.cacheRead += usage.cacheRead ?? 0;
          }
          const turnSpan = trace.spans.find((s) => s.spanId === currentTurnSpanId);
          if (turnSpan) {
            turnSpan.attributes = {
              ...turnSpan.attributes,
              model: msg.model,
              provider: msg.provider,
              stopReason: msg.stopReason,
              inputTokens: usage?.input,
              outputTokens: usage?.output,
              cacheReadTokens: usage?.cacheRead,
              cost: usage?.cost?.total,
              errorMessage: (msg as any).errorMessage,
            };
          }

          if (msg.stopReason === "error") {
            trace.success = false;
            trace.error = (msg as any).errorMessage ?? "Assistant generation failed";
          }

          if (currentTurnSpanId) {
            try {
              const lfGeneration = lfGenerationsByTurnSpanId.get(currentTurnSpanId);
              lfGeneration?.end({
                model: msg.model,
                usage: {
                  input: usage?.input,
                  output: usage?.output,
                  total: (usage?.input || 0) + (usage?.output || 0),
                },
                output: (msg as any).content,
                metadata: { provider: msg.provider, stopReason: msg.stopReason },
              });
            } catch (err) {
              logger.warn({ err }, "LangFuse generation end failed (non-fatal)");
            }
          }
        }
        break;
      }
      case "tool_execution_start": {
        const sid = spanId();
        const startedAt = Date.now();
        toolStartTimes.set(event.toolCallId, { spanId: sid, startedAt });
        trace.spans.push({
          spanId: sid,
          parentSpanId: currentTurnSpanId,
          type: "tool_execution",
          name: event.toolName,
          startedAt,
          attributes: { args: event.args },
        });
        try {
          const lfSpan = lfTrace?.span({
            name: event.toolName,
            startTime: new Date(),
            input: event.args,
          });
          if (lfSpan && event.toolCallId) {
            lfToolSpansByToolCallId.set(event.toolCallId, lfSpan);
          }
        } catch (err) {
          logger.warn({ err }, "LangFuse tool span creation failed (non-fatal)");
        }
        break;
      }
      case "tool_execution_end": {
        const startInfo = toolStartTimes.get(event.toolCallId);
        if (startInfo) {
          const now = Date.now();
          const span = trace.spans.find((s) => s.spanId === startInfo.spanId);
          if (span) {
            span.endedAt = now;
            span.attributes.durationMs = now - startInfo.startedAt;
            span.attributes.isError = event.isError;
            if (event.isError) {
              trace.success = false;
            }
          }
          toolStartTimes.delete(event.toolCallId);
        }
        try {
          const lfSpan = lfToolSpansByToolCallId.get(event.toolCallId);
          lfSpan?.end({
            endTime: new Date(),
            output: event.result,
            level: event.isError ? "ERROR" : "DEFAULT",
            statusMessage: event.isError ? "Tool execution failed" : undefined,
          });
        } catch (err) {
          logger.warn({ err }, "LangFuse tool span end failed (non-fatal)");
        } finally {
          if (event.toolCallId) {
            lfToolSpansByToolCallId.delete(event.toolCallId);
          }
        }
        break;
      }
      case "auto_retry_start": {
        trace.spans.push({
          spanId: `span_retry_${event.attempt ?? Date.now()}`,
          type: "retry",
          name: `retry_attempt_${event.attempt ?? "unknown"}`,
          startedAt: Date.now(),
          attributes: {
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            errorMessage: event.errorMessage,
          },
        });
        break;
      }
      case "auto_compaction_start": {
        trace.spans.push({
          spanId: spanId(),
          type: "compaction",
          name: "auto_compaction",
          startedAt: Date.now(),
          attributes: {},
        });
        break;
      }
      case "agent_end": {
        trace.endedAt = Date.now();
        break;
      }
    }
  }

  return {
    processEvent,
    getTrace: () => trace,
    finalize: () => {
      trace.endedAt = trace.endedAt ?? Date.now();
      try {
        lfTrace?.update({
          output: { success: trace.success, error: trace.error },
          metadata: { totalCost: trace.totalCost, totalTokens: trace.totalTokens },
          tags: [trace.taskType || "unknown", trace.success ? "success" : "failure"],
        });
      } catch (err) {
        logger.warn({ err }, "LangFuse trace update failed (non-fatal)");
      }
      return trace;
    },
    save: async () => {
      trace.endedAt = trace.endedAt ?? Date.now();
      await mkdir(TRACE_DIR, { recursive: true });
      const filename = `${trace.traceId}.json`;
      const filepath = `${TRACE_DIR}/${filename}`;
      await writeFile(filepath, JSON.stringify(trace, null, 2));
      logger.info({ traceId: trace.traceId, filepath }, "Trace saved");
      if (langfuse) {
        try {
          await langfuse.flushAsync();
        } catch (err) {
          logger.warn({ err }, "LangFuse flush failed (non-fatal)");
        }
      }
      return filepath;
    },
  };
}
