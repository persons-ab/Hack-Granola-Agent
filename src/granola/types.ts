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

export interface MeetingRecord {
  id: string;
  title: string;
  date: string;
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

export interface ActionItem {
  task: string;
  assignee?: string;
  assigneeFullName?: string;
  assigneeEmail?: string;
}
