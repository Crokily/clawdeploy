import { logger } from "./lib/logger.js";
import { pollAndProcessTasks } from "./task-queue.js";

async function main() {
  logger.info("piDeploy Orchestrator starting...");

  // Initialize task queue consumer
  const taskQueuePromise = pollAndProcessTasks();
  // TODO: Initialize heartbeat loop

  logger.info("piDeploy Orchestrator started");

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await taskQueuePromise;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
