import express from "express";
import { config } from "./config.js";
import { granolaWebhookRouter } from "./granola/webhook.js";
import { getMeetingRecord, listAllMeetings, deleteMeeting } from "./pipeline/meetingStore.js";

export const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "meeting-knowledge-system" });
});

app.use("/webhooks", granolaWebhookRouter);

// GET /meetings — list all meetings
app.get("/meetings", async (_req, res) => {
  const meetings = await listAllMeetings();
  res.json({
    status: "ok",
    count: meetings.length,
    data: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      participants: m.participants,
      summary: m.gptSummary.summary,
      actionItemCount: m.gptSummary.actionItems.length,
      createdAt: m.createdAt,
    })),
  });
});

// GET /meetings/:id — full meeting detail
app.get("/meetings/:id", async (req, res) => {
  const record = await getMeetingRecord(req.params.id);
  if (!record) {
    res.status(404).json({ status: "error", message: "Meeting not found" });
    return;
  }
  res.json({
    status: "ok",
    data: record,
  });
});

// DELETE /meetings/:id — delete a meeting
app.delete("/meetings/:id", async (req, res) => {
  const deleted = await deleteMeeting(req.params.id);
  if (!deleted) {
    res.status(404).json({ status: "error", message: "Meeting not found" });
    return;
  }
  res.json({ status: "ok", message: "Meeting deleted", id: req.params.id });
});

export function startServer(): void {
  app.listen(config.port, () => {
    console.log(`[server] listening on port ${config.port}`);
  });
}
