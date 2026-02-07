import express from "express";
import { config } from "./config.js";
import { granolaWebhookRouter } from "./granola/webhook.js";
import { getMeetingRecord, listAllMeetings, deleteMeeting } from "./pipeline/meetingStore.js";
import { query as vectorQuery, listDocuments, deleteDocument as deleteVectorDoc } from "./knowledge/vectorStore.js";

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

// GET /vector — list all vector documents
app.get("/vector", async (_req, res) => {
  const docs = await listDocuments();
  res.json({ status: "ok", count: docs.length, data: docs });
});

// DELETE /vector/:uri — delete a vector document
app.delete("/vector/:uri", async (req, res) => {
  const deleted = await deleteVectorDoc(req.params.uri);
  if (!deleted) {
    res.status(404).json({ status: "error", message: "Vector document not found" });
    return;
  }
  res.json({ status: "ok", message: "Vector document deleted", uri: req.params.uri });
});

// GET /vector/search?q=... — semantic search
app.get("/vector/search", async (req, res) => {
  const q = req.query.q as string;
  if (!q) {
    res.status(400).json({ status: "error", message: "Missing ?q= parameter" });
    return;
  }
  const results = await vectorQuery(q, parseInt(req.query.topK as string) || 5);
  res.json({ status: "ok", query: q, results });
});

// GET /dashboard — web UI
app.get("/dashboard", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(dashboardHTML());
});

function dashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meeting Knowledge System</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 20px; }
  h1 { font-size: 1.4em; margin-bottom: 16px; color: #fff; }
  h2 { font-size: 1.1em; margin: 20px 0 10px; color: #8ab4f8; }
  h3 { font-size: 0.95em; margin: 12px 0 6px; color: #8ab4f8; }
  .tabs { display: flex; gap: 4px; margin-bottom: 16px; }
  .tab { padding: 8px 16px; background: #1a1a1a; border: 1px solid #333; border-radius: 6px 6px 0 0; cursor: pointer; color: #aaa; }
  .tab.active { background: #1e1e1e; color: #8ab4f8; border-bottom-color: #1e1e1e; }
  .panel { display: none; background: #1e1e1e; border: 1px solid #333; border-radius: 0 6px 6px 6px; padding: 16px; }
  .panel.active { display: block; }
  .card { background: #252525; border: 1px solid #333; border-radius: 8px; padding: 14px; margin-bottom: 10px; }
  .card:hover { border-color: #555; }
  .card-title { font-weight: 600; color: #fff; margin-bottom: 4px; cursor: pointer; }
  .card-meta { font-size: 0.8em; color: #888; margin-bottom: 8px; }
  .badge { display: inline-block; background: #2a3a50; color: #8ab4f8; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; margin-right: 4px; }
  .badge.green { background: #1a3a2a; color: #81c995; }
  .badge.orange { background: #3a2a1a; color: #f5a623; }
  .summary { color: #bbb; font-size: 0.9em; line-height: 1.5; }
  .detail { display: none; margin-top: 12px; }
  .detail.open { display: block; }
  .action-item { padding: 6px 0; border-bottom: 1px solid #333; font-size: 0.85em; }
  .action-item:last-child { border: none; }
  .participant { display: inline-block; background: #1a2a3a; padding: 3px 8px; border-radius: 4px; margin: 2px; font-size: 0.8em; }
  .search-box { display: flex; gap: 8px; margin-bottom: 12px; }
  .search-box input { flex: 1; padding: 8px 12px; background: #252525; border: 1px solid #444; border-radius: 6px; color: #e0e0e0; font-size: 0.9em; }
  .search-box button { padding: 8px 16px; background: #8ab4f8; color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .search-result { background: #252525; padding: 10px; margin-bottom: 8px; border-radius: 6px; border-left: 3px solid #8ab4f8; }
  .score { color: #81c995; font-size: 0.8em; }
  pre { background: #1a1a1a; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 0.8em; color: #ccc; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; }
  .raw-toggle { color: #8ab4f8; cursor: pointer; font-size: 0.8em; margin-top: 6px; }
  .vec-doc { background: #252525; padding: 10px; margin-bottom: 6px; border-radius: 6px; font-size: 0.85em; }
  .loading { color: #888; font-style: italic; }
  .delete-btn { background: #4a2020; color: #f88; border: 1px solid #633; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.75em; margin-left: 8px; }
  .delete-btn:hover { background: #633; }
</style>
</head>
<body>
<h1>Meeting Knowledge System</h1>
<div class="tabs">
  <div class="tab active" onclick="switchTab(event, 'meetings')">Meetings</div>
  <div class="tab" onclick="switchTab(event, 'vector')">Vector Store</div>
  <div class="tab" onclick="switchTab(event, 'search')">Semantic Search</div>
</div>

<div id="meetings" class="panel active"><div class="loading">Loading meetings...</div></div>
<div id="vector" class="panel"><div class="loading">Loading vector index...</div></div>
<div id="search" class="panel">
  <div class="search-box">
    <input id="searchInput" placeholder="Ask a question about your meetings..." onkeydown="if(event.key==='Enter')doSearch()">
    <button onclick="doSearch()">Search</button>
  </div>
  <div id="searchResults"></div>
</div>

<script>
function switchTab(evt, name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');
  document.getElementById(name).classList.add('active');
}

function toggleDetail(id) {
  const el = document.getElementById('detail-' + id);
  el.classList.toggle('open');
}

function toggleRaw(id) {
  const el = document.getElementById('raw-' + id);
  el.classList.toggle('open');
}

async function deleteMeeting(id) {
  if (!confirm('Delete meeting ' + id + '?')) return;
  await fetch('/meetings/' + id, { method: 'DELETE' });
  loadMeetings();
}

async function loadMeetings() {
  const res = await fetch('/meetings');
  const data = await res.json();
  const panel = document.getElementById('meetings');
  if (!data.data || data.data.length === 0) {
    panel.innerHTML = '<p style="color:#888">No meetings yet.</p>';
    return;
  }
  panel.innerHTML = '<h2>All Meetings (' + data.count + ')</h2>';
  for (const m of data.data) {
    const detail = await fetch('/meetings/' + m.id).then(r => r.json());
    const d = detail.data;
    const participants = d.participants.map(p => '<span class="participant">' + esc(p) + '</span>').join('');
    const actions = d.gptSummary.actionItems.map(a => {
      const name = a.assigneeFullName || a.assignee || 'unassigned';
      const email = a.assigneeEmail ? ' (' + esc(a.assigneeEmail) + ')' : '';
      return '<div class="action-item"><span class="badge green">' + esc(name) + email + '</span> ' + esc(a.task) + '</div>';
    }).join('');
    const decisions = d.gptSummary.keyDecisions.map(k => '<div class="action-item">' + esc(k) + '</div>').join('');
    const discussions = d.gptSummary.discussionPoints.map(p => '<div class="action-item">' + esc(p) + '</div>').join('');

    panel.innerHTML += '<div class="card">' +
      '<div class="card-title" onclick="toggleDetail(\\'' + m.id + '\\')">' + esc(d.title) +
        '<button class="delete-btn" onclick="event.stopPropagation();deleteMeeting(\\'' + m.id + '\\')">delete</button></div>' +
      '<div class="card-meta">' + esc(d.date) + ' &middot; <span class="badge">' + d.gptSummary.actionItems.length + ' actions</span> <span class="badge orange">' + d.participants.length + ' people</span></div>' +
      '<div class="summary">' + esc(d.gptSummary.summary) + '</div>' +
      '<div id="detail-' + m.id + '" class="detail">' +
        '<h3>Participants</h3><div>' + (participants || '<em style="color:#888">None</em>') + '</div>' +
        '<h3>Key Decisions</h3>' + (decisions || '<em style="color:#888">None</em>') +
        '<h3>Action Items</h3>' + (actions || '<em style="color:#888">None</em>') +
        '<h3>Discussion Points</h3>' + (discussions || '<em style="color:#888">None</em>') +
        '<div class="raw-toggle" onclick="toggleRaw(\\'' + m.id + '\\')">Show raw data</div>' +
        '<div id="raw-' + m.id + '" class="detail"><pre>' + esc(JSON.stringify(d, null, 2)) + '</pre></div>' +
      '</div></div>';
  }
}

async function loadVector() {
  const res = await fetch('/vector');
  const data = await res.json();
  const panel = document.getElementById('vector');
  if (!data.data || data.data.length === 0) {
    panel.innerHTML = '<p style="color:#888">No documents in vector store.</p>';
    return;
  }
  panel.innerHTML = '<h2>Vector Index (' + data.count + ' documents)</h2>';
  for (const doc of data.data) {
    const metaStr = Object.keys(doc.metadata).length > 0
      ? Object.entries(doc.metadata).map(([k,v]) => '<span class="badge">' + esc(k) + ': ' + esc(String(v)) + '</span>').join(' ')
      : '<span style="color:#666">no metadata</span>';
    panel.innerHTML += '<div class="card">' +
      '<div class="card-title" onclick="toggleDetail(\\'vec-' + doc.id + '\\')">' + esc(doc.uri) + '</div>' +
      '<div class="card-meta">' + metaStr + ' &middot; <span style="color:#666;font-size:0.75em">' + esc(doc.id) + '</span></div>' +
      '<div id="detail-vec-' + doc.id + '" class="detail">' +
        '<h3>Embedded Text</h3><pre>' + esc(doc.text) + '</pre>' +
        '<h3>Metadata (raw)</h3><pre>' + esc(JSON.stringify(doc.metadata, null, 2)) + '</pre>' +
      '</div></div>';
  }
}

async function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;
  const results = document.getElementById('searchResults');
  results.innerHTML = '<div class="loading">Searching...</div>';
  const res = await fetch('/vector/search?q=' + encodeURIComponent(q));
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    results.innerHTML = '<p style="color:#888">No results found.</p>';
    return;
  }
  results.innerHTML = '<h2>Results for "' + esc(q) + '"</h2>';
  for (const r of data.results) {
    results.innerHTML += '<div class="search-result"><span class="score">Score: ' + r.score.toFixed(3) + '</span><pre>' + esc(r.text) + '</pre></div>';
  }
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

loadMeetings();
loadVector();
</script>
</body>
</html>`;
}

export function startServer(): void {
  app.listen(config.port, () => {
    console.log(`[server] listening on port ${config.port}`);
  });
}
