# PRD: piDeploy Agent Orchestrator

## Introduction

将 ClawDeploy 的实例生命周期管理（Docker 容器创建/启停/删除/更新、状态同步、Nginx 路由、自愈恢复）从硬编码 API route 逻辑重构为 Pi Agent 驱动的自治 Orchestrator 服务。保留原版 Next.js 前端和 UI，仅将"执行层"替换为 agent loop。

## Goals

1. **自愈能力**：容器 crash 后自动检测并重启，无需人工干预
2. **状态一致性**：每 60s 自动巡检，保证 DB 与 Docker 状态一致
3. **可靠更新**：instance update 具备自动回滚能力
4. **Nginx 自愈**：port map 不一致时自动修复并验证
5. **全栈可观测**：structured tracing、cost monitoring、error classification、eval dataset
6. **成本可控**：开发阶段使用免费开源模型，硬性 cost cap
7. **安全**：所有变更操作在 tool execute() 中硬编码验证，bash 限制只读诊断

## Non-Goals

- 不重写前端 UI（仅修改 API route 为异步提交）
- 不更换数据库（继续使用 Neon PostgreSQL + Prisma）
- 不引入新的消息队列中间件（使用 DB-based task queue）
- 不修改 OpenClaw Docker 镜像或 terminal-server

## Technical Considerations

- **SDK 层级**：使用 Layer 2 `agentLoop()` (pi-agent-core)，最大控制权
- **Auth 共享**：Orchestrator 通过 `AuthStorage.create()` 读取 `~/.pi/agent/auth.json`
- **模型**：开发阶段统一 `minimax-m2.5-free [opencode]`，fallback `glm-5-free [opencode]` → `gemini-3-flash [google-antigravity]`
- **Monorepo**：项目重命名 clawdeploy → piDeploy，original/ + agent/ 并行
- **可观测性前置**：observability 模块在 tools 之前实现，确保每个 tool 开发即可被追踪调试

## Success Metrics

- [ ] Orchestrator 能通过 task queue 接收并执行 create/start/stop/delete/update 操作
- [ ] Heartbeat 每 60s 巡检，crashed 容器 2 分钟内自动恢复
- [ ] 每次 agent run 生成完整 trace JSON（含 spans、cost、performance）
- [ ] E2E browser test 验证完整创建→运行→停止→删除流程
- [ ] 所有 quality checks 通过（typecheck、lint、build）

---

## User Stories

### US-001: Monorepo Setup — Rename and Restructure

**Description:** 将 clawdeploy 重命名为 piDeploy，创建 monorepo 结构，original/ 放原版代码，agent/ 放新版代码。

**Acceptance Criteria:**
- 项目目录从 `/home/ubuntu/clawdeploy` 移动/重命名为 `/home/ubuntu/piDeploy`
- `piDeploy/original/` 包含原版全部代码（从原来的根目录复制）
- `piDeploy/agent/frontend/` 从 original/frontend 复制
- `piDeploy/agent/orchestrator/` 目录已创建（空）
- `piDeploy/README.md` 更新说明新架构
- `.git` 保留，git remote 可稍后更新
- `/data/clawdeploy/` 数据目录不动（symlink 或配置指向）

### US-002: Orchestrator Project Scaffolding

**Description:** 在 agent/orchestrator/ 下初始化 TypeScript Node.js 项目，安装核心依赖。

**Acceptance Criteria:**
- `agent/orchestrator/package.json` 创建，包含依赖：`@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@sinclair/typebox`, `dockerode`, `@types/dockerode`, `pino`
- `agent/orchestrator/tsconfig.json` 配置 ESM + strict + Node22
- `agent/orchestrator/src/index.ts` 创建，包含基础启动代码
- `agent/orchestrator/src/config.ts` 创建，包含模型配置（minimax-m2.5-free 优先 + fallback 链）和 AuthStorage 初始化
- Prisma client 从 `agent/frontend/` 共享（通过 relative path 或 workspace）
- `npx tsc --noEmit` 在 orchestrator 目录通过
- `npm install` 成功

### US-003: Observability Foundation

**Description:** 实现可观测性核心模块：structured tracer、cost monitor、error classifier、performance tracker、debug transcript capture。这是所有后续开发的基础设施。

**Acceptance Criteria:**
- `agent/orchestrator/src/observability/tracer.ts` — AgentTrace + AgentSpan 结构，createTracer() 函数
- `agent/orchestrator/src/observability/cost-monitor.ts` — per-request budget enforcement + per-tool cost attribution
- `agent/orchestrator/src/observability/error-classifier.ts` — AgentErrorClass 分类（llm_api_error, tool_execution_error, agent_stuck 等）
- `agent/orchestrator/src/observability/performance.ts` — PerformanceMetrics 跟踪（TTFT, tool duration, turn count）
- `agent/orchestrator/src/observability/transcript.ts` — debug transcript capture + save to JSON
- `agent/orchestrator/src/observability/index.ts` — 统一导出
- 所有模块遵循 pi-agent-app-dev skill observability.md 的 Pattern 1-4
- `npx tsc --noEmit` 通过

### US-004: Core Lifecycle Tools — create, start, stop

**Description:** 实现 instance_create、instance_start、instance_stop 三个 custom tools，包含硬编码安全检查。

**Acceptance Criteria:**
- `agent/orchestrator/src/tools/instance-create.ts` — 完整编排：DB create → storage → config → docker create → DB update → nginx sync
- `agent/orchestrator/src/tools/instance-start.ts` — docker start → DB status update → nginx sync
- `agent/orchestrator/src/tools/instance-stop.ts` — docker stop → DB status update → nginx sync
- 所有 tools 使用 `Type.Object()` 定义参数 schema
- 所有 tools 在 execute() 中硬编码 userId 归属验证
- 错误时 throw Error（不是返回错误文本）
- 从 `agent/frontend/src/lib/` 复用现有 docker.ts、instance-config.ts、nginx.ts 逻辑
- `npx tsc --noEmit` 通过

### US-005: Destructive & Complex Tools — delete, update

**Description:** 实现 instance_delete 和 instance_update tools。delete 包含清理逻辑，update 包含回滚能力。

**Acceptance Criteria:**
- `agent/orchestrator/src/tools/instance-delete.ts` — docker remove → storage cleanup → DB delete → nginx sync
- `agent/orchestrator/src/tools/instance-update.ts` — stop → remove container → rebuild image (if needed) → recreate → start；失败时用旧容器回滚
- instance_update 使用文件锁（/tmp/pideploy-rebuild.lock）防并发 rebuild
- instance_delete 检查 instance 存在性和归属
- Tools 集成 observability tracer（onUpdate streaming progress）
- `npx tsc --noEmit` 通过

### US-006: Infrastructure Tools — nginx_sync, report_result

**Description:** 实现 nginx_sync（全局 port map 同步+验证）和 report_result（structured output）工具。

**Acceptance Criteria:**
- `agent/orchestrator/src/tools/nginx-sync.ts` — 查询所有 running instances → 写 port map → nginx reload → curl 验证可达性
- `agent/orchestrator/src/tools/report-result.ts` — 接收 { success, action, data?, errors? } → 写入 trace log → 返回确认
- `agent/orchestrator/src/tools/index.ts` — 统一导出所有 tools 数组
- nginx_sync reload 后验证 `nginx -t` 通过
- `npx tsc --noEmit` 通过

### US-007: Agent Loop + System Prompt + Bash Gate

**Description:** 实现核心 agent loop，包含 system prompt、bash tool（带 permission gate）、模型 fallback 策略。

**Acceptance Criteria:**
- `agent/orchestrator/src/agent-loop.ts` — 封装 agentLoop()，接入所有 custom tools + bash
- `agent/orchestrator/src/prompt.ts` — system prompt 定义 agent 角色、规则、安全边界
- `agent/orchestrator/src/bash-gate.ts` — bash permission gate：block rm -rf, docker rm -f, mkfs, dd if= 等危险命令
- 模型 fallback：minimax-m2.5-free → glm-5-free → gemini-3-flash，在 config.ts 中配置
- agent loop 集成 observability（每次 run 生成完整 trace）
- AbortController + 5 分钟超时
- `npx tsc --noEmit` 通过

### US-008: DB Task Queue + API Route Adaptation

**Description:** 实现基于 Prisma 的 task queue，修改 frontend API routes 从直接执行改为提交任务。

**Acceptance Criteria:**
- `agent/frontend/prisma/schema.prisma` 新增 Task model（id, type, params JSON, status, instanceId, userId, result JSON, createdAt, updatedAt）
- `prisma db push` 成功
- `agent/orchestrator/src/task-queue.ts` — pollTasks() 轮询待处理任务 → 调用 agent loop → 更新任务状态
- `agent/frontend/src/app/api/instances/route.ts` (POST) 修改为：创建 DB record（status: creating）+ 写入 task → 返回 202
- `agent/frontend/src/app/api/instances/[id]/start/route.ts` 修改为提交 task
- `agent/frontend/src/app/api/instances/[id]/stop/route.ts` 修改为提交 task
- `agent/frontend/src/app/api/instances/[id]/route.ts` (DELETE) 修改为提交 task
- 前端 typecheck 通过：`cd agent/frontend && npx tsc --noEmit`
- Orchestrator typecheck 通过

### US-009: Heartbeat Autonomous Loop

**Description:** 实现 60s 间隔的自治巡检循环：检查所有实例健康、自动恢复 crashed 容器、自动修复 Nginx。

**Acceptance Criteria:**
- `agent/orchestrator/src/heartbeat.ts` — heartbeatLoop() 每 60s 执行一轮巡检
- 使用 Haiku 级别模型（minimax-m2.5-free）降低成本
- 巡检内容：docker inspect 所有 running instances → 检查 gateway health → DB 状态同步
- Crashed 容器自动 restart（通过 instance_start tool）
- 连续 3 次恢复失败 → 标记 error 停止重试
- Nginx port map 不一致 → 自动 nginx_sync
- 每轮巡检生成 trace 日志
- heartbeat cost cap: $0.05/轮
- `npx tsc --noEmit` 通过

### US-010: Production Alerting + Eval Dataset

**Description:** 实现 alert rules 和 eval dataset，用于持续质量监控。

**Acceptance Criteria:**
- `agent/orchestrator/src/observability/alerting.ts` — AlertRule 定义：high_cost, high_turn_count, tool_error_rate, slow_execution
- `agent/orchestrator/src/observability/eval.ts` — EvalCase 数据结构 + evaluateAgentRun() 函数
- 评估检查：completion、expected_tools、cost_reasonable、no_loops
- Eval dataset 包含至少 5 个测试用例（create success、create failure recovery、heartbeat normal、heartbeat recovery、delete flow）
- Alert action 写入日志文件 `/var/log/pideploy/alerts.jsonl`
- `npx tsc --noEmit` 通过

### US-011: Orchestrator Integration Test

**Description:** 编写集成测试验证 orchestrator 各模块协同工作。

**Acceptance Criteria:**
- `agent/orchestrator/src/index.ts` 完善为可启动服务（task queue consumer + heartbeat loop）
- 启动命令 `npx tsx src/index.ts` 正常运行不报错
- 手动向 Task 表插入一条 type=instance_create 任务 → orchestrator 处理并完成
- Trace JSON 文件正确生成在 `/var/log/pideploy/traces/`
- Console 输出结构化日志
- Process graceful shutdown (SIGTERM)
- `npx tsc --noEmit` 通过
- Orchestrator build 通过

### US-012: E2E Browser Test — Full Lifecycle

**Description:** 使用 agent-browser 验证完整的实例创建→运行→状态检查→停止→删除流程。

**Acceptance Criteria:**
- agent/frontend 和 agent/orchestrator 同时运行
- agent-browser 打开 dashboard 页面，验证页面加载正常
- 通过 API 创建一个测试实例（curl POST）
- agent-browser 验证 dashboard 显示新实例
- 等待实例状态变为 running（轮询 API）
- agent-browser 验证实例详情页显示 Dashboard URL
- 通过 API 停止实例
- agent-browser 验证状态变为 stopped
- 通过 API 删除实例
- agent-browser 验证实例从列表消失
- 测试脚本 `agent/scripts/e2e-test.sh` 可重复执行
