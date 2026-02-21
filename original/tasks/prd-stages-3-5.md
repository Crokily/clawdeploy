# PRD: ClawDeploy Stages 3–5 — Docker Integration, Frontend Wiring & Production Polish

## 1. Introduction / Overview

ClawDeploy is an OpenClaw one-click deployment SaaS platform. Users deploy personal OpenClaw bot instances through a simple web dashboard without needing to know Docker, servers, or DevOps.

**Stages 0–2 are complete**: the Next.js 16 frontend has a landing page, a static dashboard, Clerk authentication, Prisma ORM with Neon PostgreSQL, and CRUD API routes for instances. However, the system is currently a "skeleton" — no Docker containers are created, the dashboard shows hardcoded data, and several schema fields from the original plan are missing.

**Stages 3–5** bring the platform to life:

- **Stage 3 (Docker)**: Install Docker Engine, build a container management service, and expose start/stop/logs APIs. Containers use `nginx:alpine` as a stand-in until the real OpenClaw image is available.
- **Stage 4 (Integration)**: Wire the frontend to real data — dynamic dashboard, instance creation form, detail pages, and action buttons that control live containers.
- **Stage 5 (Polish)**: Loading states, error boundaries, rate limiting, sensitive data handling, health checks, and documentation.

---

## 2. Goals

- **G-1**: Users can create an OpenClaw instance through a web form that spins up a real Docker container.
- **G-2**: Users can start, stop, and delete instances with one click from the dashboard.
- **G-3**: Users can view real-time status and logs for each instance.
- **G-4**: The dashboard reflects live container state, not static placeholder data.
- **G-5**: Sensitive data (bot tokens, API keys) is handled securely.
- **G-6**: The application is production-ready with proper error handling, rate limiting, and documentation.

---

## 3. User Stories

### US-001: Update Prisma Schema with OpenClaw Instance Fields

**Description:** As a developer, I need the database schema to include all fields required for OpenClaw deployments (model, channel, botToken, apiKey, containerId, config) so that the API can store complete instance configuration.

**Acceptance Criteria:**
- [ ] Prisma schema `Instance` model updated: added `model` (String), `channel` (String), `botToken` (String, optional), `apiKey` (String, optional), `containerId` (String, optional), `config` (Json, optional, default `{}`)
- [ ] Existing `region` and `instanceType` fields retained for backward compatibility (marked optional)
- [ ] `status` field allows values: `pending`, `creating`, `running`, `stopped`, `error`, `deleted`
- [ ] `npx prisma db push` succeeds against Neon database
- [ ] `npx prisma generate` succeeds
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-002: Update Zod Validation Schemas and CRUD API Routes

**Description:** As a developer, I need the Zod validation schemas and existing API route handlers to accept and validate the new instance fields so that the API can create and update instances with full configuration.

**Acceptance Criteria:**
- [ ] `createInstanceSchema` in `instance-schema.ts` updated: requires `name`, `model` (enum: `claude-opus-4.5`, `gpt-5.2`, `gemini-3-flash`), `channel` (enum: `telegram`, `discord`, `whatsapp`); optional `botToken`, `apiKey`, `region`, `instanceType`
- [ ] `updateInstanceSchema` updated to allow patching `name`, `status`, `botToken`, `apiKey`, `config`
- [ ] `instanceStatusSchema` updated to include `creating` and `deleted`
- [ ] POST `/api/instances` route creates instances with new fields
- [ ] PATCH `/api/instances/[id]` route updates instances with new fields
- [ ] Manual curl test: `POST /api/instances` with `{ "name": "test", "model": "gpt-5.2", "channel": "telegram" }` returns 201
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Lint passes: `cd frontend && npm run lint`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-003: Install Docker Engine on the Server

**Description:** As a developer, I need Docker Engine installed and running on the Ubuntu server so that the application can manage containers programmatically.

**Acceptance Criteria:**
- [ ] Shell script `scripts/install-docker.sh` created that installs Docker Engine on Ubuntu via official Docker apt repo
- [ ] Script is idempotent (safe to run twice)
- [ ] Docker daemon is running: `docker info` succeeds
- [ ] Current user can run Docker without sudo (added to `docker` group)
- [ ] `docker run --rm hello-world` succeeds
- [ ] Script committed to the repo

---

### US-004: Create Docker Service Module

**Description:** As a developer, I need a Docker service module that wraps container operations (create, start, stop, remove, status, logs) so that API routes can manage containers through a clean interface.

**Acceptance Criteria:**
- [ ] `dockerode` npm package added to frontend dependencies
- [ ] `frontend/src/lib/docker.ts` created with exported async functions: `createContainer(options)`, `startContainer(containerId)`, `stopContainer(containerId)`, `removeContainer(containerId)`, `getContainerStatus(containerId)`, `getContainerLogs(containerId, tail?)`
- [ ] `createContainer` uses `nginx:alpine` image as mock, maps a dynamic host port (range 10000-20000) to container port 80, sets CPU/memory limits (0.5 CPU, 256MB), enables auto-restart (`unless-stopped`)
- [ ] Container names follow pattern `clawdeploy-{instanceId}`
- [ ] All functions include proper error handling with typed error responses
- [ ] `@types/dockerode` added as devDependency
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-005: Integrate Docker with Instance Creation and Deletion APIs

**Description:** As a developer, I need the POST `/api/instances` route to create a Docker container and the DELETE `/api/instances/[id]` route to remove it, so that instance lifecycle is synchronized with containers.

**Acceptance Criteria:**
- [ ] POST `/api/instances`: after DB insert, calls `createContainer()`, updates instance with `containerId` and status `creating`, then calls `startContainer()` and updates status to `running`
- [ ] If container creation fails, instance status is set to `error` and error is logged
- [ ] DELETE `/api/instances/[id]`: stops and removes the Docker container (if `containerId` exists) before deleting the DB record
- [ ] If container removal fails (e.g., container already gone), deletion continues gracefully
- [ ] Manual test: POST creates a running nginx container, DELETE removes it
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-006: Add Container Action API Endpoints (Start / Stop / Logs)

**Description:** As a user, I want API endpoints to start, stop, and view logs for my instances so that I can control their lifecycle remotely.

**Acceptance Criteria:**
- [ ] `POST /api/instances/[id]/start` — starts the container via Docker service, updates DB status to `running`, returns updated instance
- [ ] `POST /api/instances/[id]/stop` — stops the container via Docker service, updates DB status to `stopped`, returns updated instance
- [ ] `GET /api/instances/[id]/logs` — returns last 100 lines of container logs as `{ logs: string }`; accepts optional `?tail=N` query param
- [ ] All three endpoints require Clerk auth and verify instance ownership (userId match)
- [ ] Returns 404 if instance not found or not owned by user
- [ ] Returns 400 if instance has no containerId
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Lint passes: `cd frontend && npm run lint`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-007: Create Instance Creation Page (`/dashboard/new`)

**Description:** As a user, I want a form at `/dashboard/new` to create a new OpenClaw instance by selecting a model, channel, and providing my API credentials, so that I can deploy with a few clicks.

**Acceptance Criteria:**
- [ ] New page at `frontend/src/app/dashboard/new/page.tsx` using `DashboardLayout`
- [ ] Form fields: Instance Name (text input, required), Model (select: Claude Opus 4.5 / GPT-5.2 / Gemini 3 Flash), Channel (select: Telegram / Discord / WhatsApp), Bot Token (password input, optional), API Key (password input, optional)
- [ ] Form validates with client-side validation before submission
- [ ] On submit: POST to `/api/instances` with form data, show loading spinner on button
- [ ] On success: redirect to `/dashboard` with success feedback
- [ ] On error: show error message inline
- [ ] "Cancel" button navigates back to `/dashboard`
- [ ] Page is protected by Clerk auth (redirects to `/` if unauthenticated)
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-008: Make Dashboard Page Dynamic with Real Instance Data

**Description:** As a user, I want the dashboard to show my actual deployed instances with real status information, so that I can monitor my deployments at a glance.

**Acceptance Criteria:**
- [ ] Dashboard page fetches instances from `GET /api/instances` on load (server component using `fetch` with Clerk auth headers, or client component with `useEffect`)
- [ ] Each instance displayed as a `Card` showing: name, model, channel, status badge (color-coded: green=running, yellow=pending/creating, red=error, gray=stopped), and creation date
- [ ] `EmptyState` shown when user has zero instances, with "Create New Instance" button
- [ ] If fetch fails, an error message is displayed
- [ ] Instance cards link to `/dashboard/instances/[id]`
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-009: Create Instance Detail Page (`/dashboard/instances/[id]`)

**Description:** As a user, I want a detail page for each instance showing its full configuration, live status, and recent logs, so that I can monitor and troubleshoot deployments.

**Acceptance Criteria:**
- [ ] New page at `frontend/src/app/dashboard/instances/[id]/page.tsx` using `DashboardLayout`
- [ ] Fetches instance data from `GET /api/instances/[id]`
- [ ] Displays: instance name, model, channel, status badge, containerId (truncated), creation date, last updated date
- [ ] Displays container logs in a scrollable monospace `<pre>` block, fetched from `GET /api/instances/[id]/logs`
- [ ] Shows "Instance not found" if 404 returned
- [ ] "Back to Dashboard" link at top
- [ ] Page protected by Clerk auth
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-010: Add Start / Stop / Delete Action Buttons in UI

**Description:** As a user, I want buttons to start, stop, and delete my instances from both the dashboard cards and the detail page, so that I can control deployments without using the terminal.

**Acceptance Criteria:**
- [ ] Each instance card on the dashboard includes a kebab/action menu or inline buttons for Start, Stop, Delete
- [ ] Instance detail page has prominent Start, Stop, Delete buttons in a toolbar
- [ ] Start button: calls `POST /api/instances/[id]/start`, disabled when status is `running`
- [ ] Stop button: calls `POST /api/instances/[id]/stop`, disabled when status is `stopped`
- [ ] Delete button: shows a confirmation `Modal` dialog before calling `DELETE /api/instances/[id]`; on success redirects to `/dashboard`
- [ ] Buttons show loading state during API call
- [ ] On success, instance data is refreshed to show new status
- [ ] On error, toast or inline error message displayed
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-011: Instance State Sync (Container Status Polling)

**Description:** As a developer, I need a mechanism to periodically sync Docker container state to the database so that the dashboard always reflects reality, even if containers crash or stop externally.

**Acceptance Criteria:**
- [ ] New file `frontend/src/lib/state-sync.ts` with a `syncInstanceStates()` function that: queries all instances with status `running` or `creating`, checks each container's actual status via Docker service, updates DB if status has diverged
- [ ] New API route `POST /api/admin/sync` (protected — only callable internally or with a secret header) that runs the sync
- [ ] If a container is not found (removed externally), instance status is set to `error`
- [ ] Sync function logs each status change
- [ ] A simple cron-like mechanism: the client-side dashboard polls instance status every 30 seconds (via `setInterval` + re-fetch)
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-012: Loading States and Error Boundaries

**Description:** As a user, I want to see appropriate loading indicators and friendly error messages so that the app feels polished and I know what's happening.

**Acceptance Criteria:**
- [ ] Dashboard page shows `LoadingSpinner` while instances are being fetched
- [ ] Instance detail page shows `LoadingSpinner` while data loads
- [ ] Create instance form button shows spinner during submission
- [ ] Next.js `error.tsx` boundary added to `/dashboard` route segment — displays a user-friendly error card with a "Try Again" button
- [ ] Next.js `loading.tsx` added to `/dashboard` route segment — displays `LoadingSpinner` centered
- [ ] All API-calling components handle and display error states (not silent failures)
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-013: Rate Limiting, Security Hardening, and Health Check

**Description:** As a developer, I need rate limiting on API routes, secure handling of sensitive data, and a health check endpoint for monitoring, so that the platform is production-ready.

**Acceptance Criteria:**
- [ ] Simple in-memory rate limiter middleware in `frontend/src/lib/rate-limit.ts` (e.g., sliding window, 60 requests/minute per userId)
- [ ] Rate limiter applied to all `POST` and `DELETE` API routes; returns 429 when exceeded
- [ ] Bot tokens and API keys are never returned in API GET responses (redacted to `"***"` or omitted)
- [ ] `GET /api/health` endpoint returns `{ status: "ok", timestamp: ..., docker: "connected" | "disconnected" }` — no auth required
- [ ] Health check verifies Docker daemon connectivity
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Lint passes: `cd frontend && npm run lint`
- [ ] Build passes: `cd frontend && npm run build`

---

### US-014: SEO Meta Tags, README, and API Documentation

**Description:** As a developer and product owner, I need proper SEO on public pages, an updated README, and API documentation so that the project is presentable and maintainable.

**Acceptance Criteria:**
- [ ] Landing page (`/`) has proper `<title>`, `<meta name="description">`, and Open Graph tags via Next.js `metadata` export
- [ ] Dashboard pages have appropriate `<title>` tags (e.g., "Dashboard | ClawDeploy", "New Instance | ClawDeploy")
- [ ] `README.md` at repo root updated with: project overview, tech stack, prerequisites (Node 22, Docker), setup instructions (env vars, `prisma db push`, `npm run dev`), API endpoint reference table, architecture diagram (text-based)
- [ ] `docs/api.md` created with full API documentation: all endpoints, request/response examples, auth requirements, error codes
- [ ] TypeScript check passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

---

## 4. Functional Requirements

- **FR-01**: The Prisma `Instance` model must include fields: `id`, `userId`, `name`, `model`, `channel`, `status`, `botToken`, `apiKey`, `containerId`, `config`, `region` (optional), `instanceType` (optional), `ipAddress` (optional), `createdAt`, `updatedAt`.
- **FR-02**: The system must validate instance creation input: `model` must be one of `claude-opus-4.5`, `gpt-5.2`, `gemini-3-flash`; `channel` must be one of `telegram`, `discord`, `whatsapp`.
- **FR-03**: Creating an instance via the API must spin up a Docker container using the `nginx:alpine` image as a mock.
- **FR-04**: Deleting an instance must stop and remove the associated Docker container.
- **FR-05**: Users must be able to start and stop instances via dedicated API endpoints.
- **FR-06**: Users must be able to view the last N lines of container logs via API.
- **FR-07**: The dashboard must display all instances for the authenticated user with real-time status.
- **FR-08**: The `/dashboard/new` page must provide a form for creating instances with model, channel, name, and optional credentials.
- **FR-09**: The instance detail page must display full instance info and scrollable container logs.
- **FR-10**: Bot tokens and API keys must never be exposed in API GET responses.
- **FR-11**: API routes must be rate-limited (60 requests/minute per user for mutation endpoints).
- **FR-12**: A health check endpoint must report application and Docker daemon status.
- **FR-13**: Container resource limits must be enforced: max 0.5 CPU, 256MB memory per container.
- **FR-14**: Instance status must be periodically synced with actual Docker container state.

---

## 5. Non-Goals (Out of Scope)

- **NG-1**: Real OpenClaw image integration — `nginx:alpine` is used as a placeholder.
- **NG-2**: Multi-server / multi-node orchestration — all containers run on a single server.
- **NG-3**: Billing, payments, or usage-based pricing.
- **NG-4**: User registration flow — Clerk handles all auth (Google OAuth only).
- **NG-5**: WebSocket-based real-time updates — polling is sufficient for now.
- **NG-6**: Custom domain support for instances.
- **NG-7**: Database migrations to the `usage_logs` table from `backend/schema.sql` — deferred to a future stage.
- **NG-8**: Automated CI/CD pipeline configuration.
- **NG-9**: Kubernetes or Docker Swarm orchestration.
- **NG-10**: End-to-end or integration test suites.

---

## 6. Technical Considerations

### Infrastructure
- **Docker Engine** must be installed on the Ubuntu server (not currently present).
- **Port 3000** is occupied by the Next.js dev server. Ports **4000, 4321, 8000** are also in use.
- Docker containers should map to dynamic ports in the **10000–20000** range.
- All Docker management runs within Next.js API routes using the `dockerode` Node.js library (no separate backend service needed).

### Database
- Prisma ORM with Neon PostgreSQL. Schema changes use `prisma db push` (not SQL migrations).
- The existing `backend/schema.sql` serves as a reference for the intended schema but is **not** the source of truth — the Prisma schema is.

### Dependencies
- **dockerode** + **@types/dockerode** for Docker API interaction.
- All other dependencies (Next.js 16, Clerk, Prisma, Zod, Pino, Tailwind 4) are already installed.

### Quality Gates
All stories must pass before commit:
```bash
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

### Security
- Clerk JWT middleware protects all `/api/instances/*` routes.
- Bot tokens and API keys must be write-only (never returned in GET responses).
- Rate limiting prevents API abuse (in-memory sliding window is acceptable for single-server).

---

## 7. Success Metrics

- **SM-1**: A user can go from sign-in to a running instance in under 60 seconds.
- **SM-2**: Dashboard loads and displays real instance data in under 2 seconds.
- **SM-3**: Start/stop actions take effect within 5 seconds.
- **SM-4**: Container logs are viewable within 3 seconds of page load.
- **SM-5**: All 14 user stories pass quality checks (typecheck + lint + build).
- **SM-6**: Zero sensitive credentials exposed in API responses.

---

## 8. Open Questions

- **OQ-1**: When the real OpenClaw Docker image becomes available, what environment variables and configuration does it require? (For now, `nginx:alpine` is used.)
- **OQ-2**: Should there be a maximum number of instances per user? (Not enforced in this stage, but the rate limiter provides some protection.)
- **OQ-3**: Should container logs be persisted to the database, or is real-time Docker log streaming sufficient? (Current plan: real-time only.)
