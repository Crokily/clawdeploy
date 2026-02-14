# OpenClaw Onboarding Test Tasks

## Scope
- Validate instance creation config is minimal and valid for current OpenClaw.
- Validate create flow is terminal-first (no provider/API-key UI).
- Validate onboarding guidance points users to Web Terminal commands.
- Validate detail page behavior is quiet when logs/container are not yet available.

## Unit / Smoke Checks
1. Config generation shape
Run:
```bash
cd frontend
npx --yes tsx -e 'import assert from "node:assert/strict"; import { generateOpenClawConfig } from "./src/lib/instance-config.ts"; const cfg = generateOpenClawConfig({ instanceId: "unit-1", gatewayToken: "token" }); assert.equal((cfg as Record<string, unknown>).wizard, undefined, "wizard key must be absent"); assert.equal(cfg.channels, undefined, "channels must be omitted by default"); console.log("ok");'
```
Expected:
- `wizard` key is absent.
- Base config includes `agents.defaults.workspace` and `gateway` token config.

2. Channel-specific config
Run:
```bash
cd frontend
npx --yes tsx -e 'import assert from "node:assert/strict"; import { generateOpenClawConfig } from "./src/lib/instance-config.ts"; const tg = generateOpenClawConfig({ instanceId: "unit-2", gatewayToken: "token", channel: "telegram", botToken: "telegram-token" }); const dc = generateOpenClawConfig({ instanceId: "unit-3", gatewayToken: "token", channel: "discord", botToken: "discord-token" }); assert.deepEqual(tg.channels, { telegram: { enabled: true, botToken: "telegram-token" } }); assert.deepEqual(dc.channels, { discord: { enabled: true, token: "discord-token" } }); console.log("ok");'
```
Expected:
- Only selected channel block is emitted.

3. Smoke script
Run:
```bash
./scripts/run-openclaw-smoke-test.sh
```
Fallback when Docker is unavailable:
```bash
./scripts/run-openclaw-smoke-test.sh --skip-docker
```
Expected:
- Config validation passes.
- If Docker checks run, image and basic mount/start assumptions pass.

## Integration Checks
1. API accepts minimal create payload from UI
Run:
```bash
curl -i -X POST http://localhost:3000/api/instances \
  -H 'Content-Type: application/json' \
  -d '{"name":"Integration Minimal","model":"claude-opus-4.5","channel":""}'
```
Expected:
- Request validates without requiring `aiProvider` or `apiKey`.
- Instance record is created and status transitions to `creating` then `running` (or `error` if infra unavailable).

2. Channel token requirement still enforced
Run:
```bash
curl -i -X POST http://localhost:3000/api/instances \
  -H 'Content-Type: application/json' \
  -d '{"name":"Integration Missing Token","model":"claude-opus-4.5","channel":"telegram"}'
```
Expected:
- `400` response with `botToken` validation error.

3. Logs endpoint behavior before container assignment
Run against an instance with `containerId = null`:
```bash
curl -i http://localhost:3000/api/instances/<instance-id>/logs
```
Expected:
- API may return `400` (`Instance has no container`), but UI should render a calm placeholder, not a page-level failure.

## E2E Checks (Mandatory `agent-browser` Flow)
1. Launch app and sign in to dashboard.
2. Navigate to `/dashboard/new`.
3. Confirm form fields:
- Present: `Instance Name`, `AI Model`, `Channel`, conditional `Bot Token`.
- Absent: `AI Provider`, `API Key`.
4. Create instance with:
- Name only + default model + channel skipped.
5. Open created instance detail page and verify:
- Terminal onboarding guidance is visible with:
  - `openclaw onboard`
  - `openclaw doctor --fix`
- When container/logs are not ready, page shows non-error placeholder text instead of hard failure.
6. If instance is running:
- Click `Open Web Terminal`.
- Execute:
  - `openclaw onboard`
  - `openclaw doctor --fix`
- Confirm commands execute and output appears.

Expected:
- User can complete onboarding from terminal-first guidance without provider/API-key form steps.

## Pass / Fail Checklist
- [ ] `openclaw.json` generation does not include `wizard.completed`.
- [ ] Channel blocks are optional and only emitted when selected.
- [ ] Create form excludes provider/API-key inputs.
- [ ] Create flow succeeds with minimal payload from UI.
- [ ] Instance detail page explicitly guides terminal onboarding commands.
- [ ] Missing container/logs state shows graceful placeholder (no noisy failure banner).
- [ ] Type check passes: `cd frontend && npx tsc --noEmit`.
- [ ] Production build passes: `cd frontend && npm run build`.
