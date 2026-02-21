import Docker, { ContainerCreateOptions, ContainerLogsOptions } from "dockerode";
import { PassThrough } from "stream";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const MIN_PORT = 10_000;
const MAX_PORT = 20_000;
const CPU_LIMIT_NANO_CPUS = 1_000_000_000; // 1 CPU
const MEMORY_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (OpenClaw gateway needs ~1.5GB)
const PORT_RETRY_ATTEMPTS = 10;

const OPENCLAW_IMAGE = "openclaw:local";
const CONTAINER_GATEWAY_PORT = "18789/tcp";
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

type DockerError = Error & {
  statusCode?: number;
  reason?: string;
  json?: {
    message?: string;
  };
};

export interface CreateContainerOptions {
  instanceId: string;
  gatewayToken: string;
  envVars?: Record<string, string>;
}

export interface CreateContainerResult {
  containerId: string;
  port: number;
  gatewayToken: string;
}

function isDockerError(error: unknown): error is DockerError {
  return typeof error === "object" && error !== null;
}

function getDockerErrorMessage(error: unknown): string {
  if (!isDockerError(error)) {
    return "Unknown Docker error";
  }

  if (error.json?.message) {
    return error.json.message;
  }

  if (error.reason) {
    return error.reason;
  }

  if (error.message) {
    return error.message;
  }

  return "Unknown Docker error";
}

function isNotFoundError(error: unknown): boolean {
  if (!isDockerError(error)) {
    return false;
  }

  if (error.statusCode === 404) {
    return true;
  }

  return getDockerErrorMessage(error).toLowerCase().includes("no such container");
}

function isPortAllocationError(error: unknown): boolean {
  return getDockerErrorMessage(error)
    .toLowerCase()
    .includes("port is already allocated");
}

function getRandomPort(min: number = MIN_PORT, max: number = MAX_PORT): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeInstanceName(instanceId: string): string {
  return `clawdeploy-${instanceId}`;
}

async function demuxLogs(stream: NodeJS.ReadableStream): Promise<string> {
  const combinedOutput = new PassThrough();
  const chunks: Buffer[] = [];

  combinedOutput.on("data", (chunk: Buffer | string) => {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  });

  docker.modem.demuxStream(stream, combinedOutput, combinedOutput);

  return await new Promise<string>((resolve, reject) => {
    stream.once("error", (error: unknown) => {
      reject(
        new Error(
          `Failed to read container logs stream: ${getDockerErrorMessage(error)}`,
        ),
      );
    });

    stream.once("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    stream.once("close", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function demuxLogsBuffer(buffer: Buffer): string {
  if (buffer.length < 8) {
    return buffer.toString("utf8");
  }

  let offset = 0;
  const chunks: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const payloadLength = buffer.readUInt32BE(offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + payloadLength;

    if (payloadEnd > buffer.length) {
      return buffer.toString("utf8");
    }

    chunks.push(buffer.subarray(payloadStart, payloadEnd));
    offset = payloadEnd;
  }

  if (offset !== buffer.length) {
    return buffer.toString("utf8");
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Create and start an OpenClaw container for an instance
 */
export async function createContainer(
  options: CreateContainerOptions,
): Promise<CreateContainerResult> {
  const { instanceId, gatewayToken, envVars } = options;
  const containerName = normalizeInstanceName(instanceId);

  // Build environment variables
  const env: string[] = [
    `HOME=/home/node`,
    `TERM=xterm-256color`,
    `NODE_OPTIONS=--max-old-space-size=1536`,
    `OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
  ];

  if (envVars) {
    for (const [key, value] of Object.entries(envVars)) {
      if (value) {
        env.push(`${key}=${value}`);
      }
    }
  }

  for (let attempt = 1; attempt <= PORT_RETRY_ATTEMPTS; attempt += 1) {
    const port = getRandomPort();

    const createOptions: ContainerCreateOptions = {
      name: containerName,
      Image: OPENCLAW_IMAGE,
      Cmd: [
        "node",
        "openclaw.mjs",
        "gateway",
        "--bind",
        "lan",
        "--port",
        "18789",
        "--allow-unconfigured",
      ],
      Env: env,
      User: "node",
      ExposedPorts: {
        [CONTAINER_GATEWAY_PORT]: {},
      },
      Labels: {
        clawdeploy: "true",
        instanceId,
      },
      HostConfig: {
        PortBindings: {
          [CONTAINER_GATEWAY_PORT]: [{ HostPort: String(port) }],
        },
        Binds: [
          `/data/clawdeploy/${instanceId}/config:/home/node/.openclaw`,
          `/data/clawdeploy/${instanceId}/workspace:/home/node/.openclaw/workspace`,
        ],
        NanoCpus: CPU_LIMIT_NANO_CPUS,
        Memory: MEMORY_LIMIT_BYTES,
        RestartPolicy: {
          Name: "unless-stopped",
        },
        Init: true,
      },
    };

    try {
      const container = await docker.createContainer(createOptions);
      await container.start();

      return {
        containerId: container.id,
        port,
        gatewayToken,
      };
    } catch (error: unknown) {
      if (isPortAllocationError(error) && attempt < PORT_RETRY_ATTEMPTS) {
        continue;
      }

      throw new Error(
        `Failed to create container "${containerName}": ${getDockerErrorMessage(error)}`,
      );
    }
  }

  throw new Error(
    `Failed to create container "${containerName}": no available port in range ${MIN_PORT}-${MAX_PORT}`,
  );
}

/**
 * Execute a command inside a running container
 */
export async function execInContainer(
  containerId: string,
  command: string[],
): Promise<{ exitCode: number; output: string }> {
  const container = docker.getContainer(containerId);

  const exec = await container.exec({
    Cmd: command,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ hijack: true, stdin: false });
  const output = await demuxLogs(stream);
  const inspectResult = await exec.inspect();

  return {
    exitCode: inspectResult.ExitCode ?? -1,
    output,
  };
}

/**
 * Create an interactive exec session (for web terminal)
 */
export async function createInteractiveExec(
  containerId: string,
  cols: number = 80,
  rows: number = 24,
) {
  const container = docker.getContainer(containerId);

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

  // Resize to initial dimensions
  try {
    await exec.resize({ h: rows, w: cols });
  } catch {
    // Resize may fail if terminal isn't ready yet
  }

  return { exec, stream };
}

export async function startContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.start();
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      throw new Error(`Cannot start container "${containerId}": not found`);
    }

    throw new Error(
      `Cannot start container "${containerId}": ${getDockerErrorMessage(error)}`,
    );
  }
}

export async function stopContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop();
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      throw new Error(`Cannot stop container "${containerId}": not found`);
    }

    throw new Error(
      `Cannot stop container "${containerId}": ${getDockerErrorMessage(error)}`,
    );
  }
}

export async function removeContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);

  try {
    const details = await container.inspect();

    if (details.State?.Running) {
      await container.stop();
    }

    await container.remove();
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      throw new Error(`Cannot remove container "${containerId}": not found`);
    }

    throw new Error(
      `Cannot remove container "${containerId}": ${getDockerErrorMessage(error)}`,
    );
  }
}

export async function getContainerStatus(containerId: string): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const details = await container.inspect();

    return details.State?.Status ?? "unknown";
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return "not_found";
    }

    throw new Error(
      `Cannot get status for container "${containerId}": ${getDockerErrorMessage(error)}`,
    );
  }
}

export async function getContainerLogs(
  containerId: string,
  tail: number | "all" = "all",
): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const logsOptions: ContainerLogsOptions & { follow: false } = {
      stdout: true,
      stderr: true,
      timestamps: false,
      follow: false,
    };

    if (typeof tail === "number") {
      logsOptions.tail = tail;
    }

    const logs = await container.logs(logsOptions);

    if (typeof logs === "string") {
      return logs;
    }

    if (Buffer.isBuffer(logs)) {
      return demuxLogsBuffer(logs);
    }

    return await demuxLogs(logs as NodeJS.ReadableStream);
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      throw new Error(`Cannot get logs for container "${containerId}": not found`);
    }

    throw new Error(
      `Cannot get logs for container "${containerId}": ${getDockerErrorMessage(error)}`,
    );
  }
}

/**
 * Get the mapped host port for a container
 */
export async function getContainerPort(containerId: string): Promise<number | null> {
  try {
    const container = docker.getContainer(containerId);
    const details = await container.inspect();

    const portBindings = details.NetworkSettings?.Ports?.[CONTAINER_GATEWAY_PORT];
    if (portBindings && portBindings.length > 0) {
      return parseInt(portBindings[0].HostPort ?? "0", 10) || null;
    }

    return null;
  } catch {
    return null;
  }
}

export async function pingDocker(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

export { docker };
