import { summarizeMeeting } from "../knowledge/summarizer.js";
import { addDocument } from "../knowledge/vectorStore.js";
import { saveMeeting } from "./meetingStore.js";
import type { MeetingRecord, MeetingSummary } from "../granola/types.js";

// Parse "Name <email>" format from participants list
function parseParticipant(p: string): { name: string; email: string } {
  const match = p.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: p.trim(), email: "" };
}

// Fuzzy match an assignee name (from GPT) against participants list
function matchAssignee(
  assignee: string,
  participants: string[]
): { name: string; email: string } | null {
  const lower = assignee.toLowerCase().trim();
  const parsed = participants.map(parseParticipant);

  // Exact full name match
  const exact = parsed.find((p) => p.name.toLowerCase() === lower);
  if (exact) return exact;

  // First name match
  const byFirst = parsed.find(
    (p) => p.name.toLowerCase().split(" ")[0] === lower
  );
  if (byFirst) return byFirst;

  // Last name match
  const byLast = parsed.find((p) => {
    const parts = p.name.toLowerCase().split(" ");
    return parts.length > 1 && parts[parts.length - 1] === lower;
  });
  if (byLast) return byLast;

  // Partial / contains match
  const partial = parsed.find(
    (p) =>
      p.name.toLowerCase().includes(lower) ||
      lower.includes(p.name.toLowerCase().split(" ")[0])
  );
  if (partial) return partial;

  // Email prefix match
  const byEmail = parsed.find(
    (p) => p.email && p.email.toLowerCase().split("@")[0].includes(lower)
  );
  if (byEmail) return byEmail;

  return null;
}

interface MeetingInput {
  id: string;
  title: string;
  date: string;
  rawNotes: string;
  transcript: string;
  participants?: string[];
  granolaSummary?: string;
}

// Hook for Person B to wire Slack + Linear notifications
export type PostProcessHook = (
  record: MeetingRecord,
  summary: MeetingSummary
) => Promise<void>;

const hooks: PostProcessHook[] = [];

export function registerPostProcessHook(hook: PostProcessHook): void {
  hooks.push(hook);
}

export async function processMeeting(input: MeetingInput): Promise<MeetingRecord> {
  console.log(`[pipeline] Processing: ${input.title}`);

  // 1. Summarize with GPT-4o
  const gptSummary = await summarizeMeeting(input.rawNotes, input.transcript);
  console.log(`[pipeline] Summary: ${gptSummary.summary.slice(0, 100)}...`);

  // 2. Match assignees to participants
  const participants = input.participants || [];
  if (participants.length > 0) {
    for (const item of gptSummary.actionItems) {
      if (!item.assignee) continue;
      const match = matchAssignee(item.assignee, participants);
      if (match) {
        item.assigneeFullName = match.name;
        item.assigneeEmail = match.email;
        console.log(`[pipeline] Matched "${item.assignee}" → ${match.name} <${match.email}>`);
      }
    }
  }

  // 3. Build record with all versions
  const record: MeetingRecord = {
    id: input.id,
    title: input.title,
    date: input.date,
    participants: input.participants || [],
    rawNotes: input.rawNotes,
    transcript: input.transcript,
    granolaSummary: input.granolaSummary || "",
    gptSummary,
    createdAt: new Date().toISOString(),
  };

  // 3. Persist raw + summaries to JSON
  await saveMeeting(record);

  // 4. Upsert GPT summary into Vectra for RAG
  const vectorText = [
    `Meeting: ${input.title} (${input.date})`,
    gptSummary.summary,
    "Key Decisions: " + gptSummary.keyDecisions.join("; "),
    "Action Items: " + gptSummary.actionItems.map((a) => `${a.task}${a.assignee ? ` (${a.assignee})` : ""}`).join("; "),
    "Discussion: " + gptSummary.discussionPoints.join("; "),
  ].join("\n");

  await addDocument(input.id, vectorText, {
    title: input.title,
    date: input.date,
  });

  console.log(`[pipeline] Stored in Vectra: ${input.id}`);

  // 5. Run post-process hooks (Slack notification, Linear issues — wired by Person B)
  for (const hook of hooks) {
    try {
      await hook(record, gptSummary);
    } catch (err) {
      console.error("[pipeline] Hook error:", err);
    }
  }

  return record;
}
