import { writeFile, mkdir, appendFile } from "fs/promises";
import { logger } from "../lib/logger.js";
import type { AgentTrace } from "./tracer.js";

const ALERT_FILE = "/var/log/pideploy/alerts.jsonl";

interface AlertRule {
  name: string;
  condition: (trace: AgentTrace) => boolean;
  severity: "warning" | "critical";
  message: (trace: AgentTrace) => string;
}

const alertRules: AlertRule[] = [
  {
    name: "high_cost",
    condition: (t) => t.totalCost > 0.5,
    severity: "critical",
    message: (t) => `Trace ${t.traceId} cost $${t.totalCost.toFixed(3)} (limit $0.50)`,
  },
  {
    name: "high_turn_count",
    condition: (t) => t.spans.filter((s) => s.type === "generation").length > 15,
    severity: "warning",
    message: (t) =>
      `Trace ${t.traceId} used ${t.spans.filter((s) => s.type === "generation").length} turns - possible loop`,
  },
  {
    name: "tool_error_rate",
    condition: (t) => {
      const tools = t.spans.filter((s) => s.type === "tool_execution");
      const errors = tools.filter((s) => s.attributes.isError);
      return tools.length > 0 && errors.length / tools.length > 0.3;
    },
    severity: "warning",
    message: (t) => {
      const tools = t.spans.filter((s) => s.type === "tool_execution");
      const errors = tools.filter((s) => s.attributes.isError);
      return `Trace ${t.traceId} had ${errors.length}/${tools.length} tool errors (>30%)`;
    },
  },
  {
    name: "slow_execution",
    condition: (t) => (t.endedAt ?? Date.now()) - t.startedAt > 120_000,
    severity: "warning",
    message: (t) => `Trace ${t.traceId} took ${((t.endedAt ?? Date.now()) - t.startedAt) / 1000}s (>2min)`,
  },
];

export async function evaluateAlerts(trace: AgentTrace): Promise<void> {
  for (const rule of alertRules) {
    if (rule.condition(trace)) {
      const alert = {
        timestamp: new Date().toISOString(),
        traceId: trace.traceId,
        rule: rule.name,
        severity: rule.severity,
        message: rule.message(trace),
      };

      logger.warn({ alert }, `Alert triggered: ${rule.name}`);

      try {
        await mkdir("/var/log/pideploy", { recursive: true });
        await appendFile(ALERT_FILE, JSON.stringify(alert) + "\n");
      } catch (err) {
        logger.error({ err }, "Failed to persist alert");
      }
    }
  }
}
