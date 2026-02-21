#!/usr/bin/env bash
# Smoke test for OpenClaw config generation + startup assumptions.
# Usage:
#   ./scripts/run-openclaw-smoke-test.sh
#   ./scripts/run-openclaw-smoke-test.sh --skip-docker

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
SKIP_DOCKER=0
CONFIG_TEST_FILE=""
TMP_DIR=""

cleanup() {
  if [[ -n "${CONFIG_TEST_FILE}" && -f "${CONFIG_TEST_FILE}" ]]; then
    rm -f "${CONFIG_TEST_FILE}"
  fi
  if [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}

trap cleanup EXIT

if [[ "${1:-}" == "--skip-docker" ]]; then
  SKIP_DOCKER=1
fi

echo "[1/3] Validating openclaw.json generation..."
cd "${FRONTEND_DIR}"
CONFIG_TEST_FILE="$(mktemp "${FRONTEND_DIR}/.openclaw-config-smoke.XXXXXX.ts")"
cat > "${CONFIG_TEST_FILE}" <<'TS'
import assert from "node:assert/strict";
import { generateOpenClawConfig } from "./src/lib/instance-config.ts";

const gatewayToken = "smoke-test-token";

const baseConfig = generateOpenClawConfig({
  instanceId: "smoke-base",
  gatewayToken,
});

assert.equal((baseConfig as Record<string, unknown>).wizard, undefined);
assert.equal(baseConfig.agents.defaults.workspace, "/home/node/.openclaw/workspace");
assert.equal(baseConfig.gateway.mode, "local");
assert.equal(baseConfig.gateway.port, 18789);
assert.equal(baseConfig.gateway.bind, "lan");
assert.equal(baseConfig.gateway.auth.mode, "token");
assert.equal(baseConfig.gateway.auth.token, gatewayToken);
assert.equal(baseConfig.gateway.tailscale.mode, "off");
assert.equal(baseConfig.channels, undefined);

const telegramConfig = generateOpenClawConfig({
  instanceId: "smoke-telegram",
  gatewayToken,
  channel: "telegram",
  botToken: "telegram-token",
});
assert.deepEqual(telegramConfig.channels, {
  telegram: {
    enabled: true,
    botToken: "telegram-token",
  },
});

const discordConfig = generateOpenClawConfig({
  instanceId: "smoke-discord",
  gatewayToken,
  channel: "discord",
  botToken: "discord-token",
});
assert.deepEqual(discordConfig.channels, {
  discord: {
    enabled: true,
    token: "discord-token",
  },
});

console.log("Config generation checks passed.");
TS

npx --yes tsx "${CONFIG_TEST_FILE}"

echo "[2/3] Checking Docker prerequisites..."
if ! command -v docker >/dev/null 2>&1; then
  if [[ "${SKIP_DOCKER}" -eq 1 ]]; then
    echo "Docker CLI not found. Skipping Docker checks due to --skip-docker."
    echo "Smoke test completed with Docker checks skipped."
    exit 0
  fi

  echo "ERROR: docker command not found."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  if [[ "${SKIP_DOCKER}" -eq 1 ]]; then
    echo "Docker daemon unavailable. Skipping Docker checks due to --skip-docker."
    echo "Smoke test completed with Docker checks skipped."
    exit 0
  fi

  echo "ERROR: docker daemon is not reachable."
  exit 1
fi

if ! docker image inspect openclaw:local >/dev/null 2>&1; then
  if [[ "${SKIP_DOCKER}" -eq 1 ]]; then
    echo "openclaw:local image missing. Skipping Docker checks due to --skip-docker."
    echo "Smoke test completed with Docker checks skipped."
    exit 0
  fi

  echo "ERROR: Docker image openclaw:local not found."
  echo "Build it first with ./scripts/build-openclaw-image.sh"
  exit 1
fi

echo "[3/3] Verifying basic container startup assumptions..."
TMP_DIR="$(mktemp -d)"

mkdir -p "${TMP_DIR}/config" "${TMP_DIR}/workspace"
chmod 0777 "${TMP_DIR}/config" "${TMP_DIR}/workspace"

cat > "${TMP_DIR}/config/openclaw.json" <<'JSON'
{
  "agents": {
    "defaults": {
      "workspace": "/home/node/.openclaw/workspace"
    }
  },
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "smoke-test-token"
    },
    "tailscale": {
      "mode": "off"
    }
  }
}
JSON

docker run --rm \
  --user node \
  -e HOME=/home/node \
  -e OPENCLAW_GATEWAY_TOKEN=smoke-test-token \
  -v "${TMP_DIR}/config:/home/node/.openclaw" \
  -v "${TMP_DIR}/workspace:/home/node/.openclaw/workspace" \
  openclaw:local \
  node -e "const fs = require('node:fs'); fs.accessSync('/home/node/.openclaw/openclaw.json', fs.constants.R_OK); fs.accessSync('/home/node/.openclaw/workspace', fs.constants.W_OK);"

echo "Smoke test passed."
