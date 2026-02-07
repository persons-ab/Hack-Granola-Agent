import OpenAI from "openai";
import { config } from "../config.js";
import type { MeetingSummary } from "../granola/types.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function summarizeMeeting(
  notes: string,
  transcript?: string
): Promise<MeetingSummary> {
  const content = [
    "## Meeting Notes",
    notes,
    transcript ? "\n## Transcript\n" + transcript : "",
  ].join("\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a meeting notes assistant. Extract structured information from meeting notes and transcripts.
Return JSON with this exact shape:
{
  "summary": "2-3 sentence summary of the meeting",
  "keyDecisions": ["decision 1", "decision 2"],
  "actionItems": [
    {
      "task": "what needs to be done",
      "assignee": "person name or null",
      "type": "task|bug|feature|follow_up",
      "priority": "high|medium|low",
      "context": "brief context from the discussion explaining why this item matters"
    }
  ],
  "discussionPoints": ["topic 1", "topic 2"]
}

Action item type rules:
- "bug": something is broken or not working correctly
- "feature": a new capability or product idea to explore
- "follow_up": someone needs to check back, schedule a meeting, or follow up with someone — no issue needed
- "task": everything else (default)

Priority rules:
- "high": blocking, urgent, or explicitly marked important
- "medium": normal work items (default)
- "low": nice-to-have, exploratory, or explicitly deprioritized

Be concise. Extract ALL action items — including unassigned ones.`,
      },
      { role: "user", content },
    ],
  });

  const raw = resp.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);

  return {
    summary: parsed.summary || "",
    keyDecisions: parsed.keyDecisions || [],
    actionItems: parsed.actionItems || [],
    discussionPoints: parsed.discussionPoints || [],
  };
}
