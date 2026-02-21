import { Type, type Static } from "@sinclair/typebox";
import { updateNginxPortMap } from "../lib/nginx.js";
import { logger } from "../lib/logger.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const parameters = Type.Object({});

export const nginxSyncTool = {
  name: "nginx_sync",
  label: "Sync Nginx",
  description:
    "Synchronize Nginx port map with all running instances. Regenerates config and reloads Nginx. Returns sync status.",
  parameters,
  execute: async (
    toolCallId: string,
    params: Static<typeof parameters>,
    signal?: AbortSignal,
    onUpdate?: (partialResult: any) => void,
  ) => {
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
