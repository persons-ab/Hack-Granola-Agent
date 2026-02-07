import { getSlackApp } from "./app.js";
import { answerQuestion } from "../knowledge/qa.js";
import { summarizeThread } from "./threadSummarizer.js";
import { executeActionAuto } from "../providers/actionExecutor.js";

function tryReact(client: any, channel: string, timestamp: string, name: string): void {
  client.reactions.add({ channel, timestamp, name }).catch(() => {});
}

export function registerMentionHandler(): void {
  getSlackApp()!.event("app_mention", async ({ event, client, say }) => {
    // Strip bot mention from text
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
    const threadTs = event.thread_ts || event.ts;

    console.log(`[slack] Mention: "${text}" in ${event.channel}`);

    try {
      // Intent: summarize thread
      if (text.toLowerCase().includes("summarize") && event.thread_ts) {
        tryReact(client, event.channel, event.ts, "brain");
        console.log(`[slack] Summarizing thread ${event.thread_ts} in ${event.channel}`);
        const summary = await summarizeThread(client, event.channel, event.thread_ts);
        console.log(`[slack] Summary ready (${summary.length} chars), posting reply...`);
        const result = await client.chat.postMessage({
          channel: event.channel,
          thread_ts: threadTs,
          text: summary,
        });
        console.log(`[slack] Reply posted: ${result.ok}, ts: ${result.ts}`);
        return;
      }

      // Intent: create issue/ticket
      if (
        text.toLowerCase().includes("create issue") ||
        text.toLowerCase().includes("make ticket") ||
        text.toLowerCase().includes("create ticket")
      ) {
        tryReact(client, event.channel, event.ts, "hammer_and_wrench");
        await executeActionAuto(text, client, event.channel, threadTs);
        return;
      }

      // Default: Q&A
      tryReact(client, event.channel, event.ts, "mag");
      const answer = await answerQuestion(text);
      await say({ text: answer, thread_ts: threadTs });
    } catch (err) {
      console.error("[slack] Mention handler error:", err);
      await say({
        text: `❌ Something went wrong: ${err instanceof Error ? err.message : "unknown error"}`,
        thread_ts: threadTs,
      });
    }
  });

  console.log("[slack] Mention handler registered");
}
