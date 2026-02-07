import type { WebClient } from "@slack/web-api";
import type { ActionItem } from "../../granola/types.js";
import type { CreatedItem } from "../../providers/types.js";

export interface SlackContext {
  client: WebClient;
  channel: string;
  threadTs: string;
}

export interface HandlerResult {
  success: boolean;
  item?: CreatedItem;
  secondaryItems?: CreatedItem[];
  statusText: string;
  error?: string;
}

export interface ActionHandler {
  type: string;
  execute(item: ActionItem, ctx: SlackContext): Promise<HandlerResult>;
}
