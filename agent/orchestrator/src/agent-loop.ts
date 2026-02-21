import {
  agentLoop,
  type AgentContext,
  type AgentLoopConfig,
  type AgentMessage,
  type AgentTool,
} from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import { getConfiguredModel, LOOP_LIMITS, COST_LIMITS } from "./config.js";
import { TASK_PROMPT, HEARTBEAT_PROMPT } from "./prompt.js";
import { allTools } from "./tools/index.js";
import { bashTool } from "./tools/bash.js";
import { createTracer } from "./observability/tracer.js";
import { createCostMonitor } from "./observability/cost-monitor.js";
import { createPerformanceTracker } from "./observability/performance.js";
import { createTranscriptCapture } from "./observability/transcript.js";
import { evaluateAlerts } from "./observability/alerting.js";
import { logger } from "./lib/logger.js";

interface TaskInput {
  type: string;
  params: Record<string, any>;
  userId: string;
  instanceId?: string;
}

interface ExecutionResult {
  success: boolean;
  traceId: string;
  cost: number;
  turns: number;
  reportData?: any;
  error?: string;
}

function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages.filter((message): message is Message => {
    if (!message || typeof message !== "object" || !("role" in message)) {
      return false;
    }

    const role = (message as { role?: unknown }).role;
    return role === "user" || role === "assistant" || role === "toolResult";
  });
}

export async function executeTask(task: TaskInput): Promise<ExecutionResult> {
  const model = getConfiguredModel();
  const tracer = createTracer({
    userId: task.userId,
    taskType: task.type,
  });
  const costMonitor = createCostMonitor({
    maxCost: COST_LIMITS.maxCostPerTask,
  });
  const perfTracker = createPerformanceTracker();
  const transcript = createTranscriptCapture();

  const allAgentTools: AgentTool[] = [...allTools, bashTool] as AgentTool[];

  const context: AgentContext = {
    systemPrompt: TASK_PROMPT,
    messages: [],
    tools: allAgentTools,
  };

  const config: AgentLoopConfig = {
    model,
    convertToLlm,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOP_LIMITS.taskTimeoutMs);

  const userMessage: Message = {
    role: "user",
    content: `Execute task: ${task.type}\nUser: ${task.userId}\nParameters: ${JSON.stringify(task.params)}`,
    timestamp: Date.now(),
  };

  let reportData: any = null;
  let turnCount = 0;

  try {
    for await (const event of agentLoop([userMessage], context, config, controller.signal)) {
      tracer.processEvent(event);
      costMonitor.processEvent(event);
      perfTracker.processEvent(event);
      transcript.processEvent(event);

      if (event.type === "turn_start") {
        turnCount++;
        if (turnCount > LOOP_LIMITS.maxTurnsPerTask) {
          controller.abort();
          break;
        }
      }

      if (event.type === "tool_execution_end" && event.toolName === "report_result" && !event.isError) {
        reportData = event.result;
      }

      if (costMonitor.isExceeded()) {
        controller.abort();
        break;
      }
    }
  } catch (err: any) {
    if (err.name !== "AbortError") {
      logger.error({ err, taskType: task.type }, "Agent loop error");
    }
  } finally {
    clearTimeout(timeout);
  }

  const trace = tracer.finalize();
  await tracer.save();
  await transcript.save(trace.traceId);

  const metrics = perfTracker.getMetrics();
  logger.info(
    {
      traceId: trace.traceId,
      taskType: task.type,
      success: trace.success,
      cost: trace.totalCost,
      turns: turnCount,
      durationMs: metrics.totalDurationMs,
    },
    "Task execution completed",
  );

  await evaluateAlerts(trace);

  return {
    success: trace.success,
    traceId: trace.traceId,
    cost: trace.totalCost,
    turns: turnCount,
    reportData,
    error: trace.error,
  };
}

export async function executeHeartbeat(): Promise<ExecutionResult> {
  const model = getConfiguredModel();
  const tracer = createTracer({ taskType: "heartbeat" });
  const costMonitor = createCostMonitor({
    maxCost: COST_LIMITS.maxCostPerHeartbeat,
  });
  const perfTracker = createPerformanceTracker();

  const allAgentTools: AgentTool[] = [...allTools, bashTool] as AgentTool[];

  const context: AgentContext = {
    systemPrompt: HEARTBEAT_PROMPT,
    messages: [],
    tools: allAgentTools,
  };

  const config: AgentLoopConfig = {
    model,
    convertToLlm,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOP_LIMITS.taskTimeoutMs);

  const userMessage: Message = {
    role: "user",
    content: "Perform health check cycle on all instances.",
    timestamp: Date.now(),
  };

  let reportData: any = null;
  let turnCount = 0;

  try {
    for await (const event of agentLoop([userMessage], context, config, controller.signal)) {
      tracer.processEvent(event);
      costMonitor.processEvent(event);
      perfTracker.processEvent(event);

      if (event.type === "turn_start") {
        turnCount++;
        if (turnCount > LOOP_LIMITS.maxTurnsPerHeartbeat) {
          controller.abort();
          break;
        }
      }

      if (event.type === "tool_execution_end" && event.toolName === "report_result" && !event.isError) {
        reportData = event.result;
      }

      if (costMonitor.isExceeded()) {
        controller.abort();
        break;
      }
    }
  } catch (err: any) {
    if (err.name !== "AbortError") {
      logger.error({ err }, "Heartbeat loop error");
    }
  } finally {
    clearTimeout(timeout);
  }

  const trace = tracer.finalize();
  await tracer.save();
  await evaluateAlerts(trace);

  return {
    success: trace.success,
    traceId: trace.traceId,
    cost: trace.totalCost,
    turns: turnCount,
    reportData,
    error: trace.error,
  };
}
