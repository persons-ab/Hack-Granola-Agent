import { getSlackApp } from "./app.js";
import { processMeeting } from "../pipeline/meetingPipeline.js";
import crypto from "crypto";

export function registerIngestCommand(): void {
  // /ingest opens a modal
  getSlackApp()!.command("/ingest", async ({ ack, client, body }) => {
    await ack();

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "ingest_modal",
        title: { type: "plain_text", text: "Ingest Meeting Notes" },
        submit: { type: "plain_text", text: "Ingest" },
        blocks: [
          {
            type: "input",
            block_id: "title_block",
            label: { type: "plain_text", text: "Meeting Title" },
            element: {
              type: "plain_text_input",
              action_id: "title_input",
              placeholder: { type: "plain_text", text: "e.g. Sprint Planning 2025-01-15" },
            },
          },
          {
            type: "input",
            block_id: "notes_block",
            label: { type: "plain_text", text: "Meeting Notes" },
            element: {
              type: "plain_text_input",
              action_id: "notes_input",
              multiline: true,
              placeholder: { type: "plain_text", text: "Paste meeting notes here..." },
            },
          },
        ],
      },
    });
  });

  // Handle modal submission
  getSlackApp()!.view("ingest_modal", async ({ ack, view, client, body }) => {
    await ack();

    const title =
      view.state.values.title_block.title_input.value || "Untitled Meeting";
    const notes =
      view.state.values.notes_block.notes_input.value || "";

    const userId = body.user.id;

    try {
      const id = `manual-${crypto.randomUUID().slice(0, 8)}`;
      await processMeeting({
        id,
        title,
        date: new Date().toISOString().split("T")[0],
        source: "manual",
        rawNotes: notes,
        transcript: "",
      });

      await client.chat.postMessage({
        channel: userId,
        text: `✅ *${title}* ingested and processed! Check <#${process.env.SUMMARY_CHANNEL_ID || ""}> for the summary.`,
      });
    } catch (err) {
      console.error("[ingest] Error:", err);
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Failed to ingest notes: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  });

  console.log("[slack] /ingest command registered");
}
