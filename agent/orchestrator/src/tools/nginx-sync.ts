import { Type } from "@sinclair/typebox";
import { updateNginxPortMap } from "../lib/nginx.js";
import { logger } from "../lib/logger.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const nginxSyncTool = {
  name: "nginx_sync",
  description:
    "Synchronize Nginx port map with all running instances. Regenerates config and reloads Nginx. Returns sync status.",
  parameters: Type.Object({}),
  execute: async (_args: Record<string, never>) => {
    logger.info("Executing nginx_sync");

    // Run the sync
    await updateNginxPortMap();

    // Verify nginx config is valid
    let verificationPassed = false;
    try {
      await execFileAsync("sudo", ["nginx", "-t"], { timeout: 5000 });
      verificationPassed = true;
    } catch (err) {
      logger.error({ err }, "Nginx config verification failed after sync");
    }

    const result = { reloadSuccess: true, verificationPassed };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      details: result,
    };
  },
};
