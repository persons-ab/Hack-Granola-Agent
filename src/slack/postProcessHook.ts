import type { MeetingRecord, MeetingSummary } from "../granola/types.js";
import { getSlackApp } from "./app.js";
import { config } from "../config.js";
import { orchestrate } from "../actor/orchestrator.js";
import { fmtMeetingSummary } from "./format.js";

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

  const text = fmtMeetingSummary(record, summary);

  // Post summary to channel
  const result = await getSlackApp()!.client.chat.postMessage({
    channel: channelId,
    text,
    unfurl_links: false,
  });

  const threadTs = result.ts;
  if (!threadTs) return;

  // Process ALL action items through the actor system
  if (summary.actionItems.length === 0) {
    console.log("[hook] No action items to process");
    return;
  }

  console.log(`[hook] Orchestrating ${summary.actionItems.length} action items...`);
  try {
    const outcome = await orchestrate(summary.actionItems, {
      client: getSlackApp()!.client,
      channel: channelId,
      threadTs,
    });
    console.log(`[hook] Orchestration complete: ${outcome.succeeded} succeeded, ${outcome.failed} failed`);
  } catch (err) {
    console.error("[hook] Orchestration failed:", err);
    await getSlackApp()!.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `❌ Action item processing failed: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
}
