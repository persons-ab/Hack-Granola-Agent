import type { MeetingRecord, MeetingSummary, ActionItem } from "../granola/types.js";
import type { CreatedItem } from "../providers/types.js";
import type { HandlerResult } from "../actor/handlers/types.js";

/** Format a created item as a linked reference: <url|BIL-123> */
export function fmtRef(item: CreatedItem): string {
  return `<${item.url}|${item.id}>`;
}

/** Format assignee */
export function fmtAssignee(name?: string): string {
  return name ? `*${name}*` : "";
}

const TYPE_SECTIONS: Record<string, string> = {
  bug: "Bugs to fix",
  feature: "Feature requests",
  task: "Tasks",
  follow_up: "Follow-ups",
};

const TYPE_ORDER = ["bug", "feature", "task", "follow_up"];

/** Format the main meeting summary posted to the channel */
export function fmtMeetingSummary(record: MeetingRecord, summary: MeetingSummary): string {
  const decisionList = summary.keyDecisions.length > 0
    ? summary.keyDecisions.map((d) => `• ${d}`).join("\n")
    : "_None_";

  return [
    `*${record.title}*`,
    `_${record.date}_`,
    "",
    summary.summary,
    "",
    `*Key decisions*`,
    decisionList,
  ].join("\n");
}

interface ResultEntry {
  item: ActionItem;
  result: HandlerResult;
}

/** Format the orchestrator summary — grouped by type */
export function fmtOrchestratorSummary(results: ResultEntry[]): string {
  // Group results by type
  const groups = new Map<string, ResultEntry[]>();
  for (const entry of results) {
    const type = entry.item.type || "task";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(entry);
  }

  const sections: string[] = [];

  for (const type of TYPE_ORDER) {
    const entries = groups.get(type);
    if (!entries || entries.length === 0) continue;

    const heading = TYPE_SECTIONS[type] || type;
    const items = entries.map((e) => fmtResultLine(e)).join("\n");
    sections.push(`*${heading}*\n${items}`);
  }

  return sections.join("\n\n");
}

function fmtResultLine({ item, result }: ResultEntry): string {
  const assigneeName = item.assigneeFullName || item.assignee;
  const assignee = assigneeName ? ` → ${fmtAssignee(assigneeName)}` : "";

  if (result.success && result.item) {
    return `• ${fmtRef(result.item)} ${item.task}${assignee}`;
  }
  if (result.success) {
    return `• ${item.task}${assignee}`;
  }
  return `• ~${item.task}~ — _${result.error || "failed"}_`;
}
