import { Router } from "express";
import { getMeeting, getTranscript } from "./mcpClient.js";
import { processMeeting } from "../pipeline/meetingPipeline.js";
import { isProcessed, markProcessed } from "../pipeline/meetingStore.js";

function parseAttendees(raw: string): string[] {
  // Format: "email: a@b.com\nname: Alice\n\nemail: c@d.com\nname: Bob"
  // Split by double newline to get each person block
  const blocks = raw.split(/\n\n+/).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim());
    const email = lines.find((l) => l.startsWith("email:"))?.replace("email:", "").trim() || "";
    const name = lines.find((l) => l.startsWith("name:"))?.replace("name:", "").trim() || "";
    if (name && email) return `${name} <${email}>`;
    return name || email;
  }).filter(Boolean);
}

export const granolaWebhookRouter = Router();

granolaWebhookRouter.post("/granola", async (req, res) => {
  try {
    console.log("[webhook] === Incoming Zapier payload ===");
    console.log("[webhook] Content-Type:", req.headers["content-type"]);
    console.log("[webhook] User-Agent:", req.headers["user-agent"]);
    const body = req.body || {};
    for (const [key, value] of Object.entries(body)) {
      const val = typeof value === "string" ? value.slice(0, 500) : JSON.stringify(value).slice(0, 500);
      console.log(`[webhook] Body.${key}: ${val}`);
    }

    const { id, title, timestamp, notes, transcript: bodyTranscript, attendees } = req.body;

    if (!id) {
      console.log("[webhook] Rejected: missing id");
      res.status(400).json({ error: "Missing meeting id" });
      return;
    }

    if (await isProcessed(id)) {
      console.log(`[webhook] Skipped: ${id} already processed`);
      res.json({ status: "already_processed" });
      return;
    }

    console.log(`[webhook] New meeting: ${title || id}`);
    console.log(`[webhook] Notes length: ${(notes || "").length}, Transcript length: ${(bodyTranscript || "").length}`);

    // Use notes from payload if provided, otherwise fetch via MCP
    let rawNotes = notes || "";
    let transcript = bodyTranscript || "";

    if (!rawNotes) {
      [rawNotes, transcript] = await Promise.all([
        getMeeting(id).catch(() => ""),
        getTranscript(id).catch(() => ""),
      ]);
    }

    // Parse attendees — Granola sends "email: x\nname: Y\n\nemail: z\nname: W" format
    let participants: string[] = [];
    if (Array.isArray(attendees)) {
      participants = attendees.flatMap((a: string) => parseAttendees(a));
    } else if (typeof attendees === "string" && attendees.trim()) {
      participants = parseAttendees(attendees);
    }

    await processMeeting({
      id,
      title: title || "Untitled Meeting",
      date: timestamp || new Date().toISOString(),
      rawNotes,
      transcript,
      participants,
    });

    await markProcessed(id);

    res.json({ status: "processed", id });
  } catch (err) {
    console.error("[webhook] Error:", err);
    res.status(500).json({ error: "Processing failed" });
  }
});
