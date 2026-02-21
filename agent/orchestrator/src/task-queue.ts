import { prisma } from "./lib/prisma.js";
import { executeTask } from "./agent-loop.js";
import { logger } from "./lib/logger.js";
import { LOOP_LIMITS } from "./config.js";

export async function pollAndProcessTasks(): Promise<void> {
  while (true) {
    try {
      // Claim one pending task atomically
      const tasks = await prisma.task.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
        take: 1,
      });

      if (tasks.length === 0) {
        await sleep(LOOP_LIMITS.taskPollIntervalMs);
        continue;
      }

      const task = tasks[0];

      // Mark as processing
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "processing" },
      });

      logger.info({ taskId: task.id, type: task.type, userId: task.userId }, "Processing task");

      try {
        const result = await executeTask({
          type: task.type,
          params: task.params as Record<string, any>,
          userId: task.userId,
          instanceId: task.instanceId ?? undefined,
        });

        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: result.success ? "completed" : "failed",
            result: result.reportData ?? { success: result.success },
            traceId: result.traceId,
            error: result.error ?? null,
          },
        });

        logger.info(
          {
            taskId: task.id,
            success: result.success,
            traceId: result.traceId,
            cost: result.cost,
          },
          "Task completed",
        );
      } catch (err: any) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: "failed",
            error: err.message ?? "Unknown error",
          },
        });
        logger.error({ err, taskId: task.id }, "Task execution failed");
      }
    } catch (err) {
      logger.error({ err }, "Task queue poll error");
      await sleep(5000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
