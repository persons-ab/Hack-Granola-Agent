import { ai } from "../ai/models.js";
import { query } from "./vectorStore.js";
import { getMeetingRecord } from "../pipeline/meetingStore.js";

export async function answerQuestion(question: string): Promise<string> {
  const results = await query(question, 5);

  if (results.length === 0) {
    return "I don't have any meeting notes that match your question yet. Try ingesting some meetings first with `/ingest`.";
  }

  // Fetch full meeting records for the top vector matches
  const contextParts: string[] = [];
  for (const r of results) {
    const record = r.uri ? await getMeetingRecord(r.uri) : null;

    if (record) {
      // Use full notes + transcript from the meeting store
      const parts = [
        `[Meeting: ${record.title} | ${record.date} | score: ${r.score.toFixed(2)}]`,
      ];
      if (record.rawNotes) parts.push(`Notes:\n${record.rawNotes}`);
      if (record.transcript) parts.push(`Transcript:\n${record.transcript}`);
      if (record.gptSummary) {
        parts.push(`Summary: ${record.gptSummary.summary}`);
        if (record.gptSummary.keyDecisions.length > 0)
          parts.push(`Key Decisions: ${record.gptSummary.keyDecisions.join("; ")}`);
        if (record.gptSummary.actionItems.length > 0)
          parts.push(`Action Items: ${record.gptSummary.actionItems.map((a) => `${a.task} (${a.assigneeFullName || a.assignee || "unassigned"})`).join("; ")}`);
      }
      if (record.participants.length > 0)
        parts.push(`Participants: ${record.participants.join(", ")}`);
      contextParts.push(parts.join("\n"));
    } else {
      // Fallback to vector text if full record not found
      contextParts.push(`[Source (score: ${r.score.toFixed(2)})]\n${r.text}`);
    }
  }

  const context = contextParts.join("\n\n---\n\n");

  const instructions = `You are a meeting knowledge assistant. Answer questions using ONLY the provided meeting context below.
- Cite which meeting the information came from when possible.
- If the answer is not in the context, say "I couldn't find that in the meeting notes."
- Be concise and direct.
- You have access to full meeting notes, transcripts, and summaries — use all of them to give the most accurate answer.

## Meeting Context
${context}`;

  return await ai(instructions, question);
}
