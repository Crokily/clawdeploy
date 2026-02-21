# PRD: OpenClaw Real Deployment — 从 Mock 到生产级实例管理

## Introduction

ClawDeploy 目前使用 `nginx:alpine` 作为 mock 镜像完成了全部基础架构（前后端、Docker 管理、UI）。本阶段的目标是将其升级为真正的 OpenClaw 部署平台：构建真实的 OpenClaw Docker 镜像、生成正确的配置文件、配置通配符子域名（`{id}.claw.a2a.ing`）、提供 Web Terminal 让用户完成交互式配置、以及 Nginx 动态反向代理。

## Goals

- 构建真实的 OpenClaw Docker 镜像并替换 mock 镜像
- 每个实例生成正确的 `openclaw.json` 配置文件和目录结构
- 持久化实例数据（config + workspace volumes）
- 通配符子域名路由：`{instanceId}.claw.a2a.ing` → 实例 Dashboard
- Let's Encrypt 通配符 SSL 证书（Cloudflare DNS challenge）
- Web Terminal（xterm.js）让用户在网页上操作实例 CLI
- 创建实例时可选配置 Telegram/Discord bot token
- 实例详情页显示 Dashboard 链接和 Gateway Token
- 更新按钮供用户自行更新 OpenClaw 版本

## User Stories

### US-001: Build OpenClaw Docker Image on Server
**Description:** As a developer, I need the real OpenClaw Docker image built on the server so that instances can run actual OpenClaw gateways.

**Acceptance Criteria:**
- [ ] Script `scripts/build-openclaw-image.sh` created
- [ ] Script clones `https://github.com/openclaw/openclaw.git` to `/opt/openclaw-src` (if not already present)
- [ ] Script runs `docker build -t openclaw:local -f Dockerfile .` from the cloned repo
- [ ] Script is idempotent (skip clone if dir exists, always rebuild image)
- [ ] `docker images openclaw:local` shows the built image after running the script
- [ ] Script committed to the repo
- [ ] Typecheck passes (no frontend changes needed for this story)

**Notes:** The OpenClaw Dockerfile uses `node:22-bookworm` base, requires `pnpm` and `bun`. Build may take 5-10 minutes. Resource: 34GB free disk, should be enough.

---

### US-002: Create Instance Persistent Storage and Config Generator
**Description:** As a developer, I need a service that creates persistent directories and generates the correct `openclaw.json` config file for each instance, so containers have proper configuration on startup.

**Acceptance Criteria:**
- [ ] New file `frontend/src/lib/instance-config.ts` created
- [ ] Function `createInstanceStorage(instanceId: string)` creates directories: `/data/clawdeploy/{instanceId}/config/` and `/data/clawdeploy/{instanceId}/workspace/`
- [ ] Function `generateOpenClawConfig(params)` generates a valid `openclaw.json` with: `agents.defaults.workspace`, `gateway.mode: "local"`, `gateway.port: 18789`, `gateway.bind: "lan"`, `gateway.auth.mode: "token"` + generated token, `gateway.tailscale.mode: "off"`, `wizard` metadata, and optional `channels.telegram` / `channels.discord` config
- [ ] Function `generateEnvFile(params)` generates `.env` content with optional API key env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
- [ ] Function `writeInstanceConfig(instanceId, config, envContent)` writes `openclaw.json` and `.env` to the config directory
- [ ] Function `removeInstanceStorage(instanceId)` removes the instance directories
- [ ] Gateway token is generated using `crypto.randomBytes(32).toString('hex')`
- [ ] Config JSON is written with `JSON.stringify(config, null, 2)`
- [ ] Typecheck passes: `cd frontend && npx tsc --noEmit`
- [ ] Build passes: `cd frontend && npm run build`

**Notes:** The config structure is derived from source code analysis of OpenClaw's `src/config/types.openclaw.ts`. Minimal viable config only — users complete the rest via Dashboard or Web Terminal.

---

### US-003: Update Docker Service for OpenClaw Containers
**Description:** As a developer, I need the Docker service module updated to create real OpenClaw containers with proper volumes, ports, environment variables, and resource limits.

**Acceptance Criteria:**
- [ ] `frontend/src/lib/docker.ts` updated: `createContainer` now accepts a typed options object (instanceId, gatewayToken, envVars, channel config)
- [ ] Image changed from `nginx:alpine` to `openclaw:local`
- [ ] Container exposes port 18789 (gateway) mapped to random host port (range 10000-20000)
- [ ] Volumes mounted: `/data/clawdeploy/{id}/config:/home/node/.openclaw` and `/data/clawdeploy/{id}/workspace:/home/node/.openclaw/workspace`
- [ ] Environment variables injected: `HOME=/home/node`, `TERM=xterm-256color`, `OPENCLAW_GATEWAY_TOKEN={token}`, plus optional API key vars
- [ ] Container command: `["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789", "--allow-unconfigured"]`
- [ ] User set to `node` (UID 1000) via container config
- [ ] Resource limits: 1 CPU (NanoCpus: 1_000_000_000), 1GB memory (1024 * 1024 * 1024)
- [ ] Restart policy: `unless-stopped`
- [ ] `createContainer` returns `{ containerId, port, gatewayToken }`
- [ ] New function `execInContainer(containerId, command[])` added for running commands inside a container
- [ ] Typecheck passes
- [ ] Build passes

**Notes:** The `dist/index.js` path is used by docker-compose.yml in the OpenClaw repo. The `--allow-unconfigured` flag lets the gateway start even without a complete config.

---

### US-004: Update Instance Creation API to Wire Everything Together
**Description:** As a developer, I need the POST /api/instances endpoint to orchestrate storage creation, config generation, and container startup so that a single API call produces a working OpenClaw instance.

**Acceptance Criteria:**
- [ ] `POST /api/instances` flow updated: (1) create DB record, (2) create storage, (3) generate and write config, (4) create Docker container, (5) update DB with containerId + port + gatewayToken
- [ ] Prisma schema updated: add `port Int?` and `gatewayToken String?` fields to Instance model
- [ ] Request body accepts optional fields: `botToken`, `apiKey`, `aiProvider` (string), `channel` (telegram/discord/none)
- [ ] Gateway token stored in DB for later display
- [ ] Port stored in DB for Nginx routing
- [ ] On Docker creation failure: storage is cleaned up, DB status set to `error`
- [ ] DELETE endpoint also calls `removeInstanceStorage()` to clean up volumes
- [ ] Typecheck passes
- [ ] Build passes

**Notes:** The `channel` field becomes optional — users can skip it at creation and configure later via Dashboard.

---

### US-005: Install Certbot Cloudflare Plugin and Obtain Wildcard SSL Certificate
**Description:** As a developer, I need a wildcard SSL certificate for `*.claw.a2a.ing` using Let's Encrypt with Cloudflare DNS validation, so that all instance subdomains are served over HTTPS.

**Acceptance Criteria:**
- [ ] Script `scripts/setup-ssl-wildcard.sh` created
- [ ] Script installs `certbot` Cloudflare DNS plugin (`python3-certbot-dns-cloudflare`)
- [ ] Script creates Cloudflare credentials file at `/etc/letsencrypt/cloudflare.ini` with API token (read from env or prompted)
- [ ] Script runs certbot with `--dns-cloudflare` authenticator for domains: `claw.a2a.ing` and `*.claw.a2a.ing`
- [ ] Certificate files exist at `/etc/letsencrypt/live/claw.a2a.ing/`
- [ ] Cloudflare credentials file has restricted permissions (chmod 600)
- [ ] Script is idempotent (checks if cert already exists)
- [ ] Script committed to the repo (without secrets)

**Notes:** User must set Cloudflare DNS records manually (A record for `claw` and `*.claw` pointing to server IP, proxy OFF / grey cloud). The Cloudflare API token needs `Zone:DNS:Edit` permission for the `a2a.ing` zone. The token itself should NOT be committed — the script reads it from `CLOUDFLARE_API_TOKEN` env var.

---

### US-006: Configure Nginx Wildcard Reverse Proxy with Dynamic Port Resolution
**Description:** As a developer, I need Nginx configured to route `{instanceId}.claw.a2a.ing` to the correct container port, so users can access their OpenClaw Dashboard via a subdomain.

**Acceptance Criteria:**
- [ ] Nginx config file `/etc/nginx/sites-available/claw.a2a.ing` created
- [ ] Server block listens on 443 SSL with the wildcard cert from US-005
- [ ] Server name matches `~^(?<instance_id>.+)\.claw\.a2a\.ing$`
- [ ] Port resolution strategy: Nginx reads a port map file `/etc/nginx/conf.d/clawdeploy-ports.conf` (generated by our API) that maps instance IDs to ports via `map` directive
- [ ] WebSocket support enabled: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`
- [ ] HTTP → HTTPS redirect for port 80
- [ ] New utility function in `frontend/src/lib/nginx.ts`: `updateNginxPortMap(instances: {id, port}[])` that writes the map file and reloads Nginx (`sudo nginx -s reload`)
- [ ] The port map is regenerated on instance create/delete/start/stop
- [ ] Also add a plain `claw.a2a.ing` server block that shows a simple info page or redirects to the main ClawDeploy site
- [ ] Symlink to sites-enabled, Nginx config test passes (`nginx -t`)
- [ ] Typecheck passes
- [ ] Build passes

**Notes:** The `map` approach avoids Lua/dynamic proxying. The port map file looks like:
```nginx
map $instance_id $clawdeploy_port {
  default 0;
  "clxxxxxxxxxx" 12345;
  "clyyyyyyyyyyy" 12346;
}
```
The Next.js process needs passwordless sudo for `nginx -s reload` — add to sudoers.

---

### US-007: Update Create Instance Form with Channel and AI Config
**Description:** As a user, I want the instance creation form to let me optionally configure a channel (Telegram/Discord) and AI provider API key, so my instance is ready to use immediately.

**Acceptance Criteria:**
- [ ] `/dashboard/new` form updated with new fields
- [ ] Channel selection: radio buttons for Telegram / Discord / "Skip (configure later)" with default "Skip"
- [ ] Bot token input: shown only when Telegram or Discord is selected, with helper text explaining how to get a token
- [ ] AI Provider section: dropdown for Anthropic / OpenAI / Gemini / OpenRouter / "Skip (configure later)" with default "Skip"
- [ ] API Key input: shown only when a provider is selected, type=password
- [ ] Form submits the new optional fields to the API
- [ ] Validation: if channel selected, bot token is required; if provider selected, API key is required
- [ ] Typecheck passes
- [ ] Build passes

**Notes:** Keep the form clean — the "Skip" defaults make it possible to create an instance with zero configuration and do everything later.

---

### US-008: Update Instance Detail Page with Dashboard Link and Token
**Description:** As a user, I want the instance detail page to show my OpenClaw Dashboard URL and gateway token, so I can access and manage my instance.

**Acceptance Criteria:**
- [ ] Instance detail page (`/dashboard/instances/[id]`) shows "Dashboard URL" field: `https://{instanceId}.claw.a2a.ing`
- [ ] URL is a clickable link that opens in a new tab
- [ ] Gateway Token displayed with a copy button (masked by default, click to reveal)
- [ ] Helper text: "Use this token to log into your OpenClaw Dashboard"
- [ ] Dashboard URL and token only shown when instance status is `running`
- [ ] Instance API endpoint (`GET /api/instances/[id]`) now returns `port` and `gatewayToken` (only to the owning user)
- [ ] Typecheck passes
- [ ] Build passes

**Notes:** The gateway token is sensitive — always mask it and provide a copy-to-clipboard button.

---

### US-009: Web Terminal Backend — Container Exec WebSocket Endpoint
**Description:** As a developer, I need a WebSocket endpoint that connects to a container's shell via Docker exec, so the frontend can provide a web terminal experience.

**Acceptance Criteria:**
- [ ] New API route `frontend/src/app/api/instances/[id]/terminal/route.ts` created
- [ ] Route upgrades HTTP to WebSocket connection
- [ ] Authenticates the user (Clerk) and verifies instance ownership
- [ ] Uses dockerode `container.exec()` to start a `bash` shell inside the container (or `sh` as fallback)
- [ ] Bidirectional streaming: WebSocket messages → container stdin, container stdout → WebSocket messages
- [ ] Handles terminal resize (JSON messages with `{type: 'resize', cols, rows}`)
- [ ] Proper cleanup on disconnect (kill exec session)
- [ ] Security: only the instance owner can access the terminal
- [ ] Typecheck passes
- [ ] Build passes

**Notes:** Next.js App Router doesn't natively support WebSocket upgrades. We'll need a custom server or use a separate lightweight Express/ws server on a different port. Alternatively, use a polling-based approach with the existing exec function. The simplest MVP approach: create a small standalone WebSocket server (`frontend/src/terminal-server.ts`) that runs alongside Next.js.

---

### US-010: Web Terminal Frontend — xterm.js Integration
**Description:** As a user, I want a web terminal embedded in the instance detail page so I can run `openclaw configure` and other CLI commands directly in my browser.

**Acceptance Criteria:**
- [ ] `@xterm/xterm` and `@xterm/addon-fit` npm packages installed
- [ ] New component `frontend/src/components/WebTerminal.tsx` created
- [ ] Component renders an xterm.js terminal that connects to the WebSocket endpoint from US-009
- [ ] Terminal auto-fits to container size, handles resize
- [ ] "Open Terminal" button on the instance detail page (shown when status is `running`)
- [ ] Terminal opens in a modal or expandable panel
- [ ] Terminal reconnects on disconnect with a "Reconnect" button
- [ ] Typecheck passes
- [ ] Build passes

**Notes:** xterm.js is client-only — use dynamic import with `next/dynamic` and `ssr: false`. The terminal gives users full CLI access to run `openclaw onboard`, `openclaw configure`, `openclaw channels add`, etc.

---

### US-011: Instance Update (Rebuild) Functionality
**Description:** As a user, I want an "Update" button on my instance so I can update OpenClaw to the latest version.

**Acceptance Criteria:**
- [ ] New API endpoint `POST /api/instances/[id]/update` created
- [ ] Endpoint flow: (1) stop container, (2) remove container, (3) rebuild image from latest source (`git pull` + `docker build`), (4) recreate container with same config/volumes/port, (5) start container
- [ ] Update button added to instance detail page
- [ ] Button shows loading state during update
- [ ] Instance status changes to `updating` during the process
- [ ] On failure, instance status set to `error` with error message
- [ ] Typecheck passes
- [ ] Build passes

**Notes:** The rebuild only needs to happen once for all instances (shared image). Track whether a rebuild is already in progress to avoid duplicate builds. After rebuild, only the specific instance's container is recreated.

---

### US-012: End-to-End Integration Testing and Polish
**Description:** As a developer, I need to verify the complete flow works end-to-end and fix any remaining issues.

**Acceptance Criteria:**
- [ ] Can create an instance with Telegram bot token via the UI
- [ ] Container starts and OpenClaw gateway becomes reachable on the mapped port
- [ ] `{instanceId}.claw.a2a.ing` loads the OpenClaw Dashboard in browser
- [ ] Web Terminal connects and can run `openclaw doctor` successfully
- [ ] Can stop and restart instance without losing configuration
- [ ] Deleting instance cleans up container, storage, and Nginx port map entry
- [ ] Error states are handled gracefully (container crash, port conflict, etc.)
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Build passes

**Notes:** This is the integration and bug-fix story. Fix any issues discovered during testing. May need to adjust container startup command, volume permissions, or Nginx config.

---

## Functional Requirements

- FR-1: System must build and maintain a local `openclaw:local` Docker image from the official OpenClaw repository
- FR-2: Each instance gets isolated persistent storage at `/data/clawdeploy/{instanceId}/` with `config/` and `workspace/` subdirectories
- FR-3: System generates a valid `openclaw.json` config file with gateway auth, bind mode, and optional channel configuration
- FR-4: Containers run with 1 CPU, 1GB memory limits, `unless-stopped` restart policy
- FR-5: Each instance is accessible via `https://{instanceId}.claw.a2a.ing` with valid SSL
- FR-6: WebSocket connections are properly proxied through Nginx for Dashboard and Web Terminal
- FR-7: Users can access a web terminal to run CLI commands inside their container
- FR-8: Instance creation optionally accepts Telegram/Discord bot token and AI provider API key
- FR-9: Instance detail page displays Dashboard URL and gateway token

## Non-Goals

- No OpenClaw sandbox (Docker-in-Docker) support — instances are already in Docker
- No automatic AI OAuth flow from our website — users do OAuth via Web Terminal or Dashboard
- No billing/payment system in this phase
- No multi-server/multi-region deployment
- No automatic Cloudflare DNS record creation — set once manually
- No WhatsApp channel support (requires QR code scanning, too complex for MVP)

## Technical Considerations

- **OpenClaw image build time**: ~5-10 minutes, 2-3GB disk. Build once, share across all instances.
- **Nginx port map**: Static file approach avoids Lua dependency. Regenerated on each instance lifecycle event.
- **Sudoers**: Next.js process needs `sudo nginx -s reload` without password. Add specific rule.
- **SSL renewal**: Certbot auto-renew handles this. Wildcard certs renew via DNS challenge.
- **Container user**: OpenClaw runs as `node` (UID 1000). Host directories must be writable by this user.
- **Disk space**: ~34GB free. Each instance uses ~50-100MB for workspace. Monitor usage.

## Success Metrics

- Instance creation → OpenClaw Dashboard accessible in under 60 seconds
- Zero manual SSH intervention needed for end-user operations
- All instance lifecycle operations (create/start/stop/delete/update) work via UI
- Web Terminal provides full CLI access for advanced configuration
