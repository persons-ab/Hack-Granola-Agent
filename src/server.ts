import express from "express";
import path from "path";
import { config } from "./config.js";
import { granolaWebhookRouter } from "./granola/webhook.js";
import { getMeetingRecord, listAllMeetings, deleteMeeting } from "./pipeline/meetingStore.js";
import { query as vectorQuery, listDocuments, deleteDocument as deleteVectorDoc } from "./knowledge/vectorStore.js";

export const app = express();

app.use(express.json());
app.use("/public", express.static(path.resolve("public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "meeting-knowledge-system" });
});

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(landingHTML());
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

function landingHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evil Corp — Meeting Intelligence Agent</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #09090b;
    --card: #0c0c0f;
    --border: #1c1c22;
    --border-hover: #2a2a35;
    --muted: #71717a;
    --foreground: #fafafa;
    --accent: #e11d48;
    --accent-glow: rgba(225, 29, 72, 0.15);
    --green: #22c55e;
    --blue: #3b82f6;
    --amber: #f59e0b;
    --purple: #a855f7;
    --radius: 12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg);
    color: var(--foreground);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* Ambient glow */
  .glow {
    position: fixed;
    width: 600px; height: 600px;
    border-radius: 50%;
    filter: blur(120px);
    opacity: 0.07;
    pointer-events: none;
    z-index: 0;
  }
  .glow-1 { top: -200px; left: -100px; background: var(--accent); }
  .glow-2 { bottom: -200px; right: -100px; background: var(--purple); }

  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 24px;
    position: relative;
    z-index: 1;
  }

  /* Nav */
  nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px 0;
    border-bottom: 1px solid var(--border);
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 1.1em;
    letter-spacing: -0.02em;
  }
  .logo-icon {
    width: 36px; height: 36px;
    border-radius: 50%;
    overflow: hidden;
  }
  .logo-icon img {
    width: 100%; height: 100%;
    object-fit: cover;
  }
  .nav-links { display: flex; gap: 8px; }
  .nav-link {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.875em;
    font-weight: 500;
    color: var(--muted);
    text-decoration: none;
    transition: all 0.15s;
  }
  .nav-link:hover { color: var(--foreground); background: var(--border); }
  .nav-link.primary {
    background: var(--foreground);
    color: var(--bg);
  }
  .nav-link.primary:hover { opacity: 0.9; }

  /* Hero */
  .hero {
    text-align: center;
    padding: 100px 0 80px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 100px;
    font-size: 0.8em;
    color: var(--muted);
    margin-bottom: 28px;
    background: var(--card);
  }
  .pill-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  h1 {
    font-size: clamp(2.5em, 6vw, 4em);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.05;
    margin-bottom: 20px;
  }
  h1 .accent { color: var(--accent); }
  .subtitle {
    font-size: 1.15em;
    color: var(--muted);
    max-width: 540px;
    margin: 0 auto 40px;
    line-height: 1.6;
  }
  .hero-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 10px;
    font-size: 0.9em;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.15s;
    border: none;
    cursor: pointer;
  }
  .btn-primary {
    background: var(--accent);
    color: white;
    box-shadow: 0 0 24px var(--accent-glow);
  }
  .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
  .btn-secondary {
    background: var(--card);
    color: var(--foreground);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover { border-color: var(--border-hover); }

  /* Stats */
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 80px;
  }
  .stat {
    background: var(--card);
    padding: 28px;
    text-align: center;
  }
  .stat-value {
    font-size: 2em;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .stat-label {
    font-size: 0.8em;
    color: var(--muted);
    margin-top: 4px;
  }

  /* Features */
  .section-label {
    font-size: 0.75em;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    text-align: center;
    margin-bottom: 12px;
  }
  .section-title {
    font-size: 1.8em;
    font-weight: 700;
    letter-spacing: -0.02em;
    text-align: center;
    margin-bottom: 48px;
  }
  .features {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 80px;
  }
  .feature {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px;
    transition: border-color 0.15s;
  }
  .feature:hover { border-color: var(--border-hover); }
  .feature-icon {
    width: 40px; height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    margin-bottom: 16px;
  }
  .fi-red { background: rgba(225,29,72,0.1); }
  .fi-blue { background: rgba(59,130,246,0.1); }
  .fi-green { background: rgba(34,197,94,0.1); }
  .fi-amber { background: rgba(245,158,11,0.1); }
  .fi-purple { background: rgba(168,85,247,0.1); }
  .feature h3 {
    font-size: 1em;
    font-weight: 600;
    margin-bottom: 8px;
    letter-spacing: -0.01em;
  }
  .feature p {
    font-size: 0.875em;
    color: var(--muted);
    line-height: 1.6;
  }

  /* How it works */
  .flow {
    display: flex;
    align-items: stretch;
    gap: 12px;
    margin-bottom: 80px;
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .flow-step {
    flex: 1;
    min-width: 180px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px 20px;
    position: relative;
    text-align: center;
  }
  .flow-step::after {
    content: '\\2192';
    position: absolute;
    right: -18px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-size: 1.2em;
  }
  .flow-step:last-child::after { content: none; }
  .flow-num {
    width: 28px; height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75em;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .flow-step h4 {
    font-size: 0.9em;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .flow-step p {
    font-size: 0.8em;
    color: var(--muted);
    line-height: 1.5;
  }

  /* Tech stack */
  .tech-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-bottom: 80px;
  }
  .tech-tag {
    padding: 8px 16px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 100px;
    font-size: 0.8em;
    font-weight: 500;
    color: var(--muted);
    transition: all 0.15s;
  }
  .tech-tag:hover { color: var(--foreground); border-color: var(--border-hover); }

  /* CTA */
  .cta {
    text-align: center;
    padding: 64px 0;
    margin-bottom: 40px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: linear-gradient(135deg, var(--accent-glow), transparent);
  }
  .cta h2 {
    font-size: 1.6em;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 12px;
  }
  .cta p {
    color: var(--muted);
    margin-bottom: 28px;
    font-size: 0.95em;
  }

  /* Footer */
  footer {
    text-align: center;
    padding: 32px 0;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.8em;
  }
  footer a { color: var(--accent); text-decoration: none; }

  /* Terminal mockup */
  .terminal {
    background: #0c0c0f;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 80px;
    overflow: hidden;
  }
  .terminal-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    background: #111114;
    border-bottom: 1px solid var(--border);
  }
  .terminal-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
  }
  .td-red { background: #ff5f57; }
  .td-yellow { background: #febc2e; }
  .td-green { background: #28c840; }
  .terminal-title {
    flex: 1;
    text-align: center;
    font-size: 0.75em;
    color: var(--muted);
  }
  .terminal-body {
    padding: 20px 24px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.82em;
    line-height: 1.8;
    color: var(--muted);
  }
  .t-prompt { color: var(--green); }
  .t-cmd { color: var(--foreground); }
  .t-comment { color: #4a4a55; }
  .t-accent { color: var(--accent); }
  .t-blue { color: var(--blue); }
  .t-amber { color: var(--amber); }

  @media (max-width: 640px) {
    .features { grid-template-columns: 1fr; }
    .stats { grid-template-columns: 1fr; }
    .flow { flex-direction: column; }
    .flow-step::after { content: '\\2193'; right: auto; bottom: -18px; top: auto; left: 50%; transform: translateX(-50%); }
    .hero { padding: 60px 0 40px; }
  }
</style>
</head>
<body>
<div class="glow glow-1"></div>
<div class="glow glow-2"></div>

<div class="container">
  <nav>
    <div class="logo">
      <div class="logo-icon"><img src="/public/logo.png" alt="Dr. Evil"></div>
      Evil Corp
    </div>
    <div class="nav-links">
      <a href="/dashboard" class="nav-link">Dashboard</a>
      <a href="https://github.com/persons-ab/Hack-Granola-Agent" class="nav-link primary" target="_blank">GitHub</a>
    </div>
  </nav>

  <section class="hero">
    <div class="pill">
      <span class="pill-dot"></span>
      Operational and scheming
    </div>
    <h1>Your meetings.<br><span class="accent">Handled.</span></h1>
    <p class="subtitle">
      Dr. Evil turns your meetings into action. Auto-summarization, knowledge base, Linear tickets,
      and a Slack bot with... <em>theatrical precision</em>.
    </p>
    <div class="hero-actions">
      <a href="/dashboard" class="btn btn-primary">Open Dashboard</a>
      <a href="#how" class="btn btn-secondary">How it works</a>
    </div>
  </section>

  <div class="stats" id="stats">
    <div class="stat">
      <div class="stat-value" id="stat-meetings">-</div>
      <div class="stat-label">Meetings processed</div>
    </div>
    <div class="stat">
      <div class="stat-value" id="stat-vectors">-</div>
      <div class="stat-label">Knowledge entries</div>
    </div>
    <div class="stat">
      <div class="stat-value" id="stat-actions">-</div>
      <div class="stat-label">Action items tracked</div>
    </div>
  </div>

  <section>
    <div class="section-label">Capabilities</div>
    <div class="section-title">Everything after the meeting</div>
    <div class="features">
      <div class="feature">
        <div class="feature-icon fi-red">&#9889;</div>
        <h3>Auto-Summarization</h3>
        <p>Meeting notes from Granola are processed through an LLM, extracting key decisions, action items, and discussion points.</p>
      </div>
      <div class="feature">
        <div class="feature-icon fi-blue">&#128269;</div>
        <h3>Semantic Search</h3>
        <p>Vector-powered RAG. Ask questions about past meetings in Slack and get answers with source citations.</p>
      </div>
      <div class="feature">
        <div class="feature-icon fi-green">&#9989;</div>
        <h3>Linear Integration</h3>
        <p>Action items are automatically routed to Linear as tickets. Bugs, features, tasks, follow-ups &mdash; all categorized.</p>
      </div>
      <div class="feature">
        <div class="feature-icon fi-amber">&#128172;</div>
        <h3>Slack Bot</h3>
        <p>@Dr. Evil in Slack to ask questions, summarize threads, or create tickets. In character, naturally.</p>
      </div>
      <div class="feature">
        <div class="feature-icon fi-purple">&#128101;</div>
        <h3>Assignee Matching</h3>
        <p>Fuzzy-matches action item assignees to meeting participants by name, email, or partial match.</p>
      </div>
      <div class="feature">
        <div class="feature-icon fi-red">&#128204;</div>
        <h3>Thread Summaries</h3>
        <p>Summarize any Slack thread into a full meeting record with notes, transcript, and structured action items.</p>
      </div>
    </div>
  </section>

  <section id="how">
    <div class="section-label">Pipeline</div>
    <div class="section-title">How Dr. Evil operates</div>
    <div class="flow">
      <div class="flow-step">
        <div class="flow-num">1</div>
        <h4>Ingest</h4>
        <p>Meeting notes arrive via Granola webhook, Slack /ingest, or thread summary</p>
      </div>
      <div class="flow-step">
        <div class="flow-num">2</div>
        <h4>Summarize</h4>
        <p>LLM extracts decisions, action items, discussion points, and assignees</p>
      </div>
      <div class="flow-step">
        <div class="flow-num">3</div>
        <h4>Store</h4>
        <p>Embedded into vector DB for semantic search and persisted as full records</p>
      </div>
      <div class="flow-step">
        <div class="flow-num">4</div>
        <h4>Act</h4>
        <p>Linear tickets created, Slack notified, knowledge base updated</p>
      </div>
    </div>
  </section>

  <div class="terminal">
    <div class="terminal-bar">
      <div class="terminal-dot td-red"></div>
      <div class="terminal-dot td-yellow"></div>
      <div class="terminal-dot td-green"></div>
      <div class="terminal-title">#general &mdash; Slack</div>
    </div>
    <div class="terminal-body">
      <span class="t-comment">// Ask about past meetings</span><br>
      <span class="t-prompt">@Dr. Evil</span> <span class="t-cmd">what were the key decisions from the sprint planning?</span><br>
      <span class="t-accent">Dr. Evil</span> <span class="t-cmd">consulted the archives... The key decisions were: 1) Move auth to JWT, 2) Ship v2 API by Friday, 3) Sergey owns the migration. Source: Sprint Planning Jan 30</span><br><br>
      <span class="t-comment">// Create tickets from conversation</span><br>
      <span class="t-prompt">@Dr. Evil</span> <span class="t-cmd">create issue: implement rate limiting on /api/search, assign to Alice</span><br>
      <span class="t-accent">Dr. Evil</span> <span class="t-cmd">It's on our agenda. <span class="t-blue">BIL-142</span> &mdash; you're welcome.</span><br><br>
      <span class="t-comment">// Summarize a thread</span><br>
      <span class="t-prompt">@Dr. Evil</span> <span class="t-cmd">summarize this</span><br>
      <span class="t-accent">Dr. Evil</span> <span class="t-cmd">Our operation is complete. 3 decisions, 5 action items, all filed with <span class="t-amber">surgical precision</span>.</span>
    </div>
  </div>

  <section>
    <div class="section-label">Built with</div>
    <div class="section-title">Tech Stack</div>
    <div class="tech-grid">
      <span class="tech-tag">TypeScript</span>
      <span class="tech-tag">Node.js</span>
      <span class="tech-tag">LLM</span>
      <span class="tech-tag">Vectra</span>
      <span class="tech-tag">Slack Bolt</span>
      <span class="tech-tag">Linear SDK</span>
      <span class="tech-tag">Granola AI</span>
      <span class="tech-tag">Express</span>
      <span class="tech-tag">Railway</span>
      <span class="tech-tag">Zapier</span>
    </div>
  </section>

  <div class="cta">
    <h2>The scheme is live.</h2>
    <p>Dr. Evil is processing meetings, filing tickets, and answering questions. Right now.</p>
    <a href="/dashboard" class="btn btn-primary">Open Dashboard</a>
  </div>

  <footer>
    Built with theatrical precision for <a href="#">Granola x DeepMind Hackathon 2026</a><br>
    Powered by Google Gemini
  </footer>
</div>

<script>
(async () => {
  try {
    const [mRes, vRes] = await Promise.all([fetch('/meetings'), fetch('/vector')]);
    const [mData, vData] = await Promise.all([mRes.json(), vRes.json()]);
    const meetings = mData.data || [];
    const vectors = vData.data || [];
    const actions = meetings.reduce((sum, m) => sum + (m.actionItemCount || 0), 0);
    document.getElementById('stat-meetings').textContent = meetings.length;
    document.getElementById('stat-vectors').textContent = vectors.length;
    document.getElementById('stat-actions').textContent = actions;
  } catch {}
})();
</script>
</body>
</html>`;
}

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
  <div class="tab active" onclick="switchTab('meetings')">Meetings</div>
  <div class="tab" onclick="switchTab('vector')">Vector Store</div>
  <div class="tab" onclick="switchTab('search')">Semantic Search</div>
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
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
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
