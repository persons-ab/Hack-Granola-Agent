import type { ActionItemType } from "../granola/types.js";
import { taskHandler } from "./handlers/task.js";
import { featureHandler } from "./handlers/feature.js";
import { followUpHandler } from "./handlers/followUp.js";
import { bugHandler } from "./handlers/bug.js";
import type { ActionHandler } from "./handlers/types.js";

const handlers: Record<string, ActionHandler> = {
  task: taskHandler,
  bug: bugHandler,
  feature: featureHandler,
  follow_up: followUpHandler,
};

export function getHandler(type?: ActionItemType): ActionHandler {
  if (type && handlers[type]) {
    return handlers[type];
  }
  // Default unknown types to task handler
  return taskHandler;
}
