/**
 * Standalone WebSocket server for web terminal functionality.
 * Runs alongside Next.js on port 3001.
 *
 * Endpoint: ws://localhost:3001/ws/terminal/{instanceId}?token={clerkSessionToken}
 *
 * Authentication: Verifies Clerk session token and instance ownership.
 * Uses dockerode to exec into the container with a TTY bash shell.
 */

import http from "http";
import { URL } from "url";
import { WebSocketServer, WebSocket } from "ws";
import Docker from "dockerode";
import { PrismaClient } from "@prisma/client";

// MVP auth: frontend passes the Clerk userId as the token query param.
// TODO: replace with proper Clerk session/JWT verification.
const PORT = parseInt(process.env.TERMINAL_PORT || "3001", 10);

const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const prisma = new PrismaClient();

interface ResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

const TERMINAL_BOOTSTRAP_COMMAND =
  `mkdir -p /tmp/clawdeploy-bin && ` +
  `printf '%s\\n' ` +
  `'#!/bin/sh' ` +
  `'if [ "$1" = "doctor" ]; then' ` +
  `'  shift' ` +
  `'  exec node /app/openclaw.mjs security audit "$@"' ` +
  `'fi' ` +
  `'if [ "$1" = "onboard" ]; then' ` +
  `'  node /app/openclaw.mjs "$@"' ` +
  `'  status=$?' ` +
  `'  if [ "$status" -eq 0 ]; then' ` +
  `'    node /app/openclaw.mjs config set --json gateway.controlUi.allowInsecureAuth true >/dev/null 2>&1 || true' ` +
  `'  fi' ` +
  `'  exit "$status"' ` +
  `'fi' ` +
  `'exec node /app/openclaw.mjs "$@"' ` +
  `> /tmp/clawdeploy-bin/openclaw && ` +
  `chmod +x /tmp/clawdeploy-bin/openclaw && ` +
  `export PATH="/tmp/clawdeploy-bin:$PATH" && ` +
  `exec /bin/bash -i`;

const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 32;
const MIN_TERMINAL_COLS = 40;
const MIN_TERMINAL_ROWS = 10;
const MAX_TERMINAL_COLS = 400;
const MAX_TERMINAL_ROWS = 200;

function isResizeMessage(data: unknown): data is ResizeMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).type === "resize" &&
    typeof (data as Record<string, unknown>).cols === "number" &&
    typeof (data as Record<string, unknown>).rows === "number"
  );
}

function normalizeTerminalSize(
  cols: number,
  rows: number,
): { cols: number; rows: number } {
  const nextCols = Number.isFinite(cols)
    ? Math.floor(cols)
    : DEFAULT_TERMINAL_COLS;
  const nextRows = Number.isFinite(rows)
    ? Math.floor(rows)
    : DEFAULT_TERMINAL_ROWS;

  if (nextCols < MIN_TERMINAL_COLS || nextRows < MIN_TERMINAL_ROWS) {
    return {
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
    };
  }

  return {
    cols: Math.min(nextCols, MAX_TERMINAL_COLS),
    rows: Math.min(nextRows, MAX_TERMINAL_ROWS),
  };
}

/**
 * Verify auth token.
 *
 * MVP mode: token is expected to be the Clerk userId (starts with "user_").
 */
async function verifyClerkToken(
  token: string,
): Promise<string | null> {
  const trimmed = token.trim();

  if (!trimmed.startsWith("user_")) {
    return null;
  }

  return trimmed;
}

/**
 * Verify instance ownership and get containerId
 */
async function getInstanceContainer(
  instanceId: string,
  userId: string,
): Promise<string | null> {
  const instance = await prisma.instance.findFirst({
    where: {
      id: instanceId,
      userId,
      status: "running",
    },
    select: { containerId: true },
  });

  return instance?.containerId ?? null;
}

/**
 * Handle a terminal WebSocket connection
 */
async function handleTerminalConnection(
  ws: WebSocket,
  instanceId: string,
  userId: string,
) {
  let containerId: string | null = null;

  try {
    containerId = await getInstanceContainer(instanceId, userId);

    if (!containerId) {
      ws.send(
        JSON.stringify({ type: "error", message: "Instance not found or not running" }),
      );
      ws.close(1008, "Instance not found");
      return;
    }

    const container = docker.getContainer(containerId);

    // Create exec with TTY
    const exec = await container.exec({
      Cmd: ["/bin/bash", "-lc", TERMINAL_BOOTSTRAP_COMMAND],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: ["TERM=xterm-256color"],
    });

    const stream = await exec.start({
      hijack: true,
      stdin: true,
      Tty: true,
    });

    try {
      await exec.resize({ h: DEFAULT_TERMINAL_ROWS, w: DEFAULT_TERMINAL_COLS });
    } catch {
      // Initial resize may fail briefly while PTY boots.
    }

    console.log(`Terminal connected: instance=${instanceId} container=${containerId.slice(0, 12)}`);

    // Container stdout → WebSocket
    stream.on("data", (chunk: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      }
    });

    stream.on("end", () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Stream ended");
      }
    });

    // WebSocket → Container stdin
    ws.on("message", (data: Buffer | string) => {
      // Check for resize messages (JSON)
      if (typeof data === "string" || (Buffer.isBuffer(data) && data[0] === 0x7b)) {
        try {
          const str = typeof data === "string" ? data : data.toString("utf-8");
          const parsed = JSON.parse(str) as unknown;
          if (isResizeMessage(parsed)) {
            const size = normalizeTerminalSize(parsed.cols, parsed.rows);
            exec.resize({ h: size.rows, w: size.cols }).catch(() => {
              // Resize may fail, ignore
            });
            return;
          }
        } catch {
          // Not JSON, treat as terminal input
        }
      }

      // Regular terminal input
      stream.write(data);
    });

    ws.on("close", () => {
      console.log(`Terminal disconnected: instance=${instanceId}`);
      stream.destroy();
    });

    ws.on("error", (err) => {
      console.error(`Terminal WebSocket error: instance=${instanceId}`, err);
      stream.destroy();
    });
  } catch (err) {
    console.error(`Failed to start terminal: instance=${instanceId}`, err);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Failed to start terminal session",
        }),
      );
      ws.close(1011, "Internal error");
    }
  }
}

// Create HTTP server
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ service: "ClawDeploy Terminal Server", status: "ok" }));
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Parse: /ws/terminal/{instanceId}
  const match = pathname.match(/^\/ws\/terminal\/([a-zA-Z0-9_-]+)$/);
  if (!match) {
    ws.close(1008, "Invalid path");
    return;
  }

  const instanceId = match[1];
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(1008, "Authentication required");
    return;
  }

  // Verify token
  const userId = await verifyClerkToken(token);
  if (!userId) {
    ws.close(1008, "Invalid token");
    return;
  }

  await handleTerminalConnection(ws, instanceId, userId);
});

server.listen(PORT, () => {
  console.log(`🖥️  Terminal server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down terminal server...");
  wss.clients.forEach((client) => client.close());
  server.close();
  void prisma.$disconnect();
  process.exit(0);
});
