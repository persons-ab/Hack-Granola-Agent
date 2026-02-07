import type { WebClient } from "@slack/web-api";
import { processMeeting } from "../pipeline/meetingPipeline.js";
import type { MeetingSummary } from "../granola/types.js";

export async function summarizeThread(
  client: WebClient,
  channel: string,
  threadTs: string
): Promise<string> {
  const replies = await client.conversations.replies({
    channel,
    ts: threadTs,
    limit: 200,
  });

  if (!replies.messages || replies.messages.length < 2) {
    return "Not enough messages in this thread to summarize.";
  }

  // Resolve user IDs to display names
  const userCache: Record<string, string> = {};
  async function resolveUser(userId: string): Promise<string> {
    if (userCache[userId]) return userCache[userId];
    try {
      const info = await client.users.info({ user: userId });
      const name = info.user?.real_name || info.user?.name || userId;
      userCache[userId] = name;
      return name;
    } catch {
      return userId;
    }
  }

  // Build transcript with resolved names
  const transcriptLines: string[] = [];
  const participantSet = new Set<string>();

  for (const m of replies.messages) {
    const userId = m.user || "unknown";
    const name = await resolveUser(userId);
    participantSet.add(name);
    const time = m.ts
      ? new Date(parseFloat(m.ts) * 1000).toLocaleTimeString()
      : "";
    transcriptLines.push(`[${name}] (${time}): ${m.text}`);
  }

  const transcript = transcriptLines.join("\n");
  const participants = [...participantSet];

  // Build notes from thread messages (without timestamps for cleaner summary input)
  const notes = replies.messages
    .map((m) => {
      const name = userCache[m.user || ""] || m.user || "unknown";
      return `${name}: ${m.text}`;
    })
    .join("\n");

  // Run through the full meeting pipeline
  const docId = `thread-${channel}-${threadTs}`;
  const firstMsg = replies.messages[0];
  const threadDate = firstMsg?.ts
    ? new Date(parseFloat(firstMsg.ts) * 1000).toISOString()
    : new Date().toISOString();

  // Get channel name for title
  let channelName = channel;
  try {
    const info = await client.conversations.info({ channel });
    channelName = info.channel?.name || channel;
  } catch {}

  const record = await processMeeting({
    id: docId,
    title: `Slack Thread: #${channelName}`,
    date: threadDate,
    rawNotes: notes,
    transcript,
    participants,
  });

  // Format response
  const s = record.gptSummary;
  const actionList = s.actionItems.length > 0
    ? s.actionItems.map((a) => {
        const name = a.assigneeFullName || a.assignee || "unassigned";
        const type = a.type ? ` [${a.type}]` : "";
        return `  - ${a.task} -> ${name}${type}`;
      }).join("\n")
    : "  None";

  const decisionList = s.keyDecisions.length > 0
    ? s.keyDecisions.map((d) => `  - ${d}`).join("\n")
    : "  None";

  return [
    `*Thread Summary*`,
    s.summary,
    `\n*Participants:* ${participants.join(", ")}`,
    `\n*Key Decisions:*`,
    decisionList,
    `\n*Action Items (${s.actionItems.length}):*`,
    actionList,
  ].join("\n");
}
