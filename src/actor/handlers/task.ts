import type { ActionItem } from "../../granola/types.js";
import { getProvidersByType } from "../../providers/registry.js";
import type { ActionHandler, HandlerResult, SlackContext } from "./types.js";

export const taskHandler: ActionHandler = {
  type: "task",

  async execute(item: ActionItem, ctx: SlackContext): Promise<HandlerResult> {
    const providers = getProvidersByType("task-manager");
    if (providers.length === 0) {
      return { success: false, statusText: "No task-manager provider configured", error: "no_provider" };
    }

    const provider = providers[0];
    const assigneeName = item.assigneeFullName || item.assignee;

    // Resolve assignee
    const assignee = assigneeName && provider.matchUser
      ? provider.matchUser(assigneeName, item.assigneeEmail)
      : null;
    const assigneeLabel = assignee?.name || assigneeName || "unassigned";

    // Pre-announce
    await ctx.client.chat.postMessage({
      channel: ctx.channel,
      thread_ts: ctx.threadTs,
      text: `🔔 Creating task in *${provider.name}*: *${item.task}* → ${assigneeLabel}`,
    });

    const created = await provider.createItem({
      title: item.task,
      description: item.context || item.task,
      assignee: assigneeName || undefined,
      assigneeEmail: item.assigneeEmail,
      type: "task",
    });

    // Notify
    await ctx.client.chat.postMessage({
      channel: ctx.channel,
      thread_ts: ctx.threadTs,
      text: `✅ Created in ${provider.name}: <${created.url}|${created.title}> (${created.id}) → ${assigneeLabel}`,
    });

    return {
      success: true,
      item: created,
      statusText: `Task created in ${provider.name}: ${created.title}`,
    };
  },
};
