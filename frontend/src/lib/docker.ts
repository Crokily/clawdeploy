import Docker, { ContainerCreateOptions } from "dockerode";
import { PassThrough } from "stream";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const MIN_PORT = 10_000;
const MAX_PORT = 20_000;
const CPU_LIMIT_NANO_CPUS = 500_000_000;
const MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;
const PORT_RETRY_ATTEMPTS = 10;

type DockerError = Error & {
  statusCode?: number;
  reason?: string;
  json?: {
    message?: string;
  };
};

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

function toEnv(config?: Record<string, string>): string[] | undefined {
  if (!config || Object.keys(config).length === 0) {
    return undefined;
  }

  return Object.entries(config).map(([key, value]) => `${key}=${value}`);
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

// Create and start a container for an instance
export async function createContainer(
  instanceId: string,
  config?: Record<string, string>,
): Promise<{ containerId: string; port: number }> {
  const containerName = normalizeInstanceName(instanceId);
  const env = toEnv(config);

  for (let attempt = 1; attempt <= PORT_RETRY_ATTEMPTS; attempt += 1) {
    const port = getRandomPort();

    const createOptions: ContainerCreateOptions = {
      name: containerName,
      Image: "nginx:alpine",
      Env: env,
      ExposedPorts: {
        "80/tcp": {},
      },
      Labels: {
        clawdeploy: "true",
        instanceId,
      },
      HostConfig: {
        PortBindings: {
          "80/tcp": [{ HostPort: String(port) }],
        },
        NanoCpus: CPU_LIMIT_NANO_CPUS,
        Memory: MEMORY_LIMIT_BYTES,
        RestartPolicy: {
          Name: "unless-stopped",
        },
      },
    };

    try {
      const container = await docker.createContainer(createOptions);
      await container.start();

      return {
        containerId: container.id,
        port,
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
  tail: number = 100,
): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    });

    if (typeof logs === "string") {
      return logs;
    }

    if (Buffer.isBuffer(logs)) {
      return logs.toString("utf8");
    }

    return await demuxLogs(logs);
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      throw new Error(`Cannot get logs for container "${containerId}": not found`);
    }

    throw new Error(
      `Cannot get logs for container "${containerId}": ${getDockerErrorMessage(error)}`,
    );
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
