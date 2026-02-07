export interface GranolaMeeting {
  id: string;
  title: string;
  date: string;
  participants?: string[];
  content?: string;
}

export interface GranolaTranscript {
  entries: TranscriptEntry[];
}

export interface TranscriptEntry {
  source: "microphone" | "system";
  text: string;
  startTimestamp: string;
  endTimestamp: string;
  confidence?: number;
}

export type RecordSource = "granola" | "slack_thread" | "manual" | "google_meet" | "zoom";

export interface MeetingRecord {
  id: string;
  title: string;
  date: string;
  source: RecordSource;
  participants: string[];
  rawNotes: string;
  transcript: string;
  granolaSummary: string;
  gptSummary: MeetingSummary;
  createdAt: string;
}

export interface MeetingSummary {
  summary: string;
  keyDecisions: string[];
  actionItems: ActionItem[];
  discussionPoints: string[];
}

export type ActionItemType = "task" | "bug" | "feature" | "follow_up";
export type ActionItemPriority = "high" | "medium" | "low";

export interface ActionItem {
  task: string;
  assignee?: string;
  assigneeFullName?: string;
  assigneeEmail?: string;
  type?: ActionItemType;
  priority?: ActionItemPriority;
  context?: string;
}
