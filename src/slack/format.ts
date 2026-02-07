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

/** Format date: "Tue, 7 Feb 15:00" */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const date = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day}, ${date} ${month} ${time}`;
}

/** Format the main meeting summary posted to the channel */
export function fmtMeetingSummary(record: MeetingRecord, summary: MeetingSummary): string {
  const decisionList = summary.keyDecisions.length > 0
    ? summary.keyDecisions.map((d) => `• ${d}`).join("\n")
    : "_None_";

  return [
    `*${record.title}*`,
    `_${fmtDate(record.date)}_`,
    "",
    summary.summary,
    "",
    `*Key decisions*`,
    decisionList,
  ].join("\n");
}

/** Format action items plan — posted BEFORE handlers execute */
export function fmtActionPlan(items: ActionItem[]): string {
  const groups = new Map<string, ActionItem[]>();
  for (const item of items) {
    const type = item.type || "task";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(item);
  }

  const sections: string[] = [];

  for (const type of TYPE_ORDER) {
    const entries = groups.get(type);
    if (!entries || entries.length === 0) continue;

    const heading = TYPE_SECTIONS[type] || type;
    const lines = entries.map((item) => {
      const assigneeName = item.assigneeFullName || item.assignee;
      const assignee = assigneeName ? ` → ${fmtAssignee(assigneeName)}` : "";
      return `• ${item.task}${assignee}`;
    }).join("\n");
    sections.push(`*${heading}*\n${lines}`);
  }

  return sections.join("\n\n");
}
