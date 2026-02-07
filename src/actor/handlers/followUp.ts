import type { ActionItem } from "../../granola/types.js";
import type { ActionHandler, HandlerResult, SlackContext } from "./types.js";

export const followUpHandler: ActionHandler = {
  type: "follow_up",

  async execute(item: ActionItem, ctx: SlackContext): Promise<HandlerResult> {
    const assigneeName = item.assigneeFullName || item.assignee || "team";

    await ctx.client.chat.postMessage({
      channel: ctx.channel,
      thread_ts: ctx.threadTs,
      text: `🔔 *Follow-up reminder* for ${assigneeName}: ${item.task}`,
    });

    return {
      success: true,
      statusText: `Reminder posted for ${assigneeName}: ${item.task}`,
    };
  },
};
