import type { AgentTrace } from "./tracer.js";

export interface EvalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface EvalResult {
  traceId: string;
  score: number;
  passed: boolean;
  checks: EvalCheck[];
}

export interface EvalCase {
  name: string;
  prompt: string;
  expectedTools: string[];
  maxCost: number;
  maxTurns: number;
  validator?: (trace: AgentTrace) => boolean;
}

// Standard eval dataset for piDeploy
export const evalDataset: EvalCase[] = [
  {
    name: "create_success",
    prompt: "Create a new instance named test-eval for user user_eval123",
    expectedTools: ["instance_create", "report_result"],
    maxCost: 0.1,
    maxTurns: 10,
  },
  {
    name: "create_failure_recovery",
    prompt: "Create instance named bad-test for user user_eval123 with invalid aiProvider 'nonexistent'",
    expectedTools: ["instance_create", "report_result"],
    maxCost: 0.15,
    maxTurns: 10,
    validator: (trace) => trace.spans.some((s) => s.name === "report_result"),
  },
  {
    name: "heartbeat_normal",
    prompt: "Perform health check cycle on all instances.",
    expectedTools: ["bash", "report_result"],
    maxCost: 0.05,
    maxTurns: 10,
  },
  {
    name: "heartbeat_recovery",
    prompt: "Perform health check. Instance cltest123 container has exited.",
    expectedTools: ["bash", "instance_start", "report_result"],
    maxCost: 0.1,
    maxTurns: 10,
  },
  {
    name: "delete_flow",
    prompt: "Delete instance cltest456 owned by user user_eval123",
    expectedTools: ["instance_delete", "report_result"],
    maxCost: 0.1,
    maxTurns: 8,
  },
];

export function evaluateAgentRun(trace: AgentTrace, expectedTools?: string[]): EvalResult {
  const checks: EvalCheck[] = [];

  // Check 1: Completion
  checks.push({
    name: "completion",
    passed: trace.success,
    detail: trace.success ? "Agent completed" : `Agent failed: ${trace.error ?? "unknown"}`,
  });

  // Check 2: Expected tools called
  if (expectedTools) {
    const calledTools = new Set(trace.spans.filter((s) => s.type === "tool_execution").map((s) => s.name));
    const missing = expectedTools.filter((t) => !calledTools.has(t));
    checks.push({
      name: "expected_tools",
      passed: missing.length === 0,
      detail: missing.length === 0 ? "All expected tools called" : `Missing: ${missing.join(", ")}`,
    });
  }

  // Check 3: Cost reasonable
  checks.push({
    name: "cost_reasonable",
    passed: trace.totalCost < 0.5,
    detail: `Cost: $${trace.totalCost.toFixed(4)}`,
  });

  // Check 4: No stuck loops
  const toolNames = trace.spans.filter((s) => s.type === "tool_execution").map((s) => s.name);
  const hasLoop = toolNames.some((name, i) => i >= 2 && toolNames[i - 1] === name && toolNames[i - 2] === name);
  checks.push({
    name: "no_loops",
    passed: !hasLoop,
    detail: hasLoop ? "Detected tool call loop" : "No loops detected",
  });

  const passed = checks.every((c) => c.passed);
  const score = checks.filter((c) => c.passed).length / checks.length;

  return { traceId: trace.traceId, score, passed, checks };
}
