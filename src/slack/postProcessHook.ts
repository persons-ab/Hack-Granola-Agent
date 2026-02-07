import type { MeetingRecord, MeetingSummary } from "../granola/types.js";
import { getSlackApp } from "./app.js";
import { config } from "../config.js";
import { executeActionAuto } from "../providers/actionExecutor.js";
import { getProvidersByType } from "../providers/registry.js";

export async function slackPostProcessHook(
  record: MeetingRecord,
  summary: MeetingSummary
): Promise<void> {
  console.log("[hook] Running Slack post-process hook...");
  const channelId = config.slack.summaryChannelId;
  if (!channelId) {
    console.warn("[hook] No SUMMARY_CHANNEL_ID set, skipping Slack notification");
    return;
  }
  console.log(`[hook] Posting to channel ${channelId}`);

  // Format the summary message
  const actionList = summary.actionItems.length > 0
    ? summary.actionItems
        .map((a) => {
          const name = a.assigneeFullName || a.assignee;
          return `  • ${a.task}${name ? ` → *${name}*` : ""}`;
        })
        .join("\n")
    : "  _None identified_";

  const decisionList = summary.keyDecisions.length > 0
    ? summary.keyDecisions.map((d) => `  • ${d}`).join("\n")
    : "  _None_";

  const text = [
    `📋 *Meeting Summary: ${record.title}*`,
    `_${record.date}_\n`,
    summary.summary,
    `\n*Key Decisions:*`,
    decisionList,
    `\n*Action Items (${summary.actionItems.length}):*`,
    actionList,
  ].join("\n");

  // Post summary to channel
  const result = await getSlackApp()!.client.chat.postMessage({
    channel: channelId,
    text,
    unfurl_links: false,
  });

  const threadTs = result.ts;
  if (!threadTs) return;

  // Auto-create issues for action items with assignees (using whatever provider is configured)
  if (getProvidersByType("task-manager").length === 0) {
    console.log("[hook] No task-manager providers configured, skipping issue creation");
    return;
  }

  const assignedItems = summary.actionItems.filter((a) => a.assignee);
  console.log(`[hook] ${assignedItems.length} assigned action items to create issues for`);
  if (assignedItems.length === 0) return;

  for (const item of assignedItems) {
    try {
      const resolvedName = item.assigneeFullName || item.assignee;
      console.log(`[hook] Creating issue: "${item.task}" → ${resolvedName} (${item.assigneeEmail || "no email"})`);
      await executeActionAuto(
        `${item.task}, assign to ${resolvedName}`,
        getSlackApp()!.client,
        channelId,
        threadTs
      );
    } catch (err) {
      console.error(`[hook] Failed to create issue for "${item.task}":`, err);
      await getSlackApp()!.client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `❌ Failed to create issue: *${item.task}* — ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  }
}
