#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/agent/frontend"
LANGFUSE_URL="http://localhost:3500"
FRONTEND_URL="http://localhost:3100"
LANGFUSE_PK="pk-lf-pideploy"
LANGFUSE_SK="sk-lf-pideploy"
SCREENSHOT_PATH="/tmp/e2e-langfuse-traces.png"
TASK_TIMEOUT=120
POLL_INTERVAL=3

fail() { echo "ERROR: $*" >&2; exit 1; }

require_http_200() {
  local name="$1" url="$2" code
  code="$(curl -sf -o /dev/null -w '%{http_code}' "$url")"
  [[ "$code" == "200" ]] || fail "$name check failed: expected 200, got $code ($url)"
  echo "$name OK ($code)"
}

prisma_node() {
  local code="$1"
  shift || true
  (
    cd "$FRONTEND_DIR"
    set -a
    . ./.env.local
    set +a
    node -e "$code" "$@"
  )
}

echo "Checking prerequisites..."
require_http_200 "LangFuse" "$LANGFUSE_URL"
[[ "$(systemctl is-active pideploy-orchestrator.service)" == "active" ]] || fail "pideploy-orchestrator.service is not active"
echo "Orchestrator OK (active)"
require_http_200 "Frontend" "$FRONTEND_URL/api/health"

echo "Creating test task via Prisma..."
CREATE_OUT="$(
  prisma_node '
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    (async () => {
      const instance = await prisma.instance.findFirst({
        where: { status: "running" },
        orderBy: { updatedAt: "desc" },
      });
      if (!instance) throw new Error("No running instance found");
      const task = await prisma.task.create({
        data: {
          type: "instance_start",
          status: "pending",
          userId: instance.userId,
          instanceId: instance.id,
          params: { instanceId: instance.id },
        },
      });
      console.log(`taskId=${task.id}`);
      console.log(`instanceId=${instance.id}`);
    })().catch((e) => { console.error(e.message || e); process.exit(1); })
      .finally(() => prisma.$disconnect());
  '
)"
echo "$CREATE_OUT"
TASK_ID="$(printf '%s\n' "$CREATE_OUT" | sed -n 's/^taskId=//p' | head -n1)"
[[ -n "$TASK_ID" ]] || fail "Failed to parse taskId from Prisma output"

echo "Polling task status (timeout ${TASK_TIMEOUT}s)..."
deadline=$((SECONDS + TASK_TIMEOUT))
TASK_STATUS=""
TRACE_ID=""
TASK_ERROR=""
while (( SECONDS < deadline )); do
  STATUS_OUT="$(
    prisma_node '
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      (async () => {
        const task = await prisma.task.findUnique({
          where: { id: process.argv[1] },
          select: { status: true, traceId: true, error: true },
        });
        if (!task) throw new Error("Task not found");
        console.log(`status=${task.status || ""}`);
        console.log(`traceId=${task.traceId || ""}`);
        console.log(`error=${(task.error || "").replace(/\n/g, " ")}`);
      })().catch((e) => { console.error(e.message || e); process.exit(1); })
        .finally(() => prisma.$disconnect());
    ' "$TASK_ID"
  )"
  TASK_STATUS="$(printf '%s\n' "$STATUS_OUT" | sed -n 's/^status=//p' | head -n1)"
  TRACE_ID="$(printf '%s\n' "$STATUS_OUT" | sed -n 's/^traceId=//p' | head -n1)"
  TASK_ERROR="$(printf '%s\n' "$STATUS_OUT" | sed -n 's/^error=//p' | head -n1)"
  echo "Task $TASK_ID status: $TASK_STATUS"
  [[ "$TASK_STATUS" == "completed" || "$TASK_STATUS" == "failed" ]] && break
  sleep "$POLL_INTERVAL"
done
[[ "$TASK_STATUS" == "completed" || "$TASK_STATUS" == "failed" ]] || fail "Timed out waiting for task $TASK_ID after ${TASK_TIMEOUT}s"
[[ -n "$TRACE_ID" ]] || fail "Task $TASK_ID finished without traceId (status=$TASK_STATUS error=$TASK_ERROR)"

echo "Verifying LangFuse trace $TRACE_ID..."
TRACE_JSON="$(curl -sf -u "${LANGFUSE_PK}:${LANGFUSE_SK}" "$LANGFUSE_URL/api/public/traces/$TRACE_ID")"
LF_CHECK="$(
  printf '%s' "$TRACE_JSON" | node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(0, "utf8");
    const parsed = JSON.parse(raw);
    const body = parsed.data ?? parsed;
    const observations = Array.isArray(body.observations)
      ? body.observations
      : Array.isArray(parsed.observations) ? parsed.observations : [];
    if (!observations.length) throw new Error("No observations found");
    const types = new Set(observations.map((o) => o && o.type).filter(Boolean));
    if (!types.has("GENERATION")) throw new Error("Missing GENERATION observation");
    if (!types.has("SPAN")) throw new Error("Missing SPAN observation");
    console.log(`observations=${observations.length}`);
  '
)"
OBS_COUNT="$(printf '%s\n' "$LF_CHECK" | sed -n 's/^observations=//p' | head -n1)"
[[ -n "$OBS_COUNT" ]] || fail "Failed to parse observation count"

echo "Capturing LangFuse traces screenshot..."
agent-browser open "$LANGFUSE_URL/project/pideploy-orchestrator/traces" >/dev/null
sleep 3 >/dev/null
agent-browser screenshot "$SCREENSHOT_PATH" >/dev/null
[[ -s "$SCREENSHOT_PATH" ]] || fail "Screenshot not created: $SCREENSHOT_PATH"

echo "Summary:"
echo "task_status=$TASK_STATUS"
echo "traceId=$TRACE_ID"
echo "observations=$OBS_COUNT"
echo "screenshot=$SCREENSHOT_PATH"

exit 0
