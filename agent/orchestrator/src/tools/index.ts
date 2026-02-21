import { instanceCreateTool } from "./instance-create.js";
import { instanceStartTool } from "./instance-start.js";
import { instanceStopTool } from "./instance-stop.js";
import { instanceDeleteTool } from "./instance-delete.js";
import { instanceUpdateTool } from "./instance-update.js";
import { nginxSyncTool } from "./nginx-sync.js";
import { reportResultTool } from "./report-result.js";

export const tools = [
  instanceCreateTool,
  instanceStartTool,
  instanceStopTool,
  instanceDeleteTool,
  instanceUpdateTool,
  nginxSyncTool,
  reportResultTool,
];

export {
  instanceCreateTool,
  instanceStartTool,
  instanceStopTool,
  instanceDeleteTool,
  instanceUpdateTool,
  nginxSyncTool,
  reportResultTool,
};
