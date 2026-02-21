import { getContainerStatus } from "@/lib/docker";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

type SyncResult = {
  checked: number;
  updated: number;
};

function mapDockerStatusToInstanceStatus(
  dockerStatus: string,
): "running" | "stopped" | "error" | null {
  if (dockerStatus === "running") {
    return "running";
  }

  if (dockerStatus === "exited" || dockerStatus === "dead") {
    return "stopped";
  }

  if (dockerStatus === "not_found") {
    return "error";
  }

  return null;
}

export async function syncInstanceStates(): Promise<SyncResult> {
  const instances = await prisma.instance.findMany({
    where: {
      status: {
        in: ["running", "creating"],
      },
    },
    select: {
      id: true,
      status: true,
      containerId: true,
    },
  });

  let checked = 0;
  let updated = 0;

  for (const instance of instances) {
    if (!instance.containerId) {
      continue;
    }

    checked += 1;

    try {
      const dockerStatus = await getContainerStatus(instance.containerId);
      const nextStatus = mapDockerStatusToInstanceStatus(dockerStatus);

      if (!nextStatus || nextStatus === instance.status) {
        continue;
      }

      await prisma.instance.update({
        where: {
          id: instance.id,
        },
        data: {
          status: nextStatus,
        },
      });

      updated += 1;

      logger.info(
        {
          instanceId: instance.id,
          containerId: instance.containerId,
          previousStatus: instance.status,
          dockerStatus,
          nextStatus,
        },
        "Synchronized instance status with Docker container state",
      );
    } catch (error: unknown) {
      logger.error(
        {
          err: error,
          instanceId: instance.id,
          containerId: instance.containerId,
        },
        "Failed to sync instance status with Docker",
      );
    }
  }

  return {
    checked,
    updated,
  };
}
