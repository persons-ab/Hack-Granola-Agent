# Meeting Knowledge System — Build Plan

> 1 day hackathon, 2 people, 4 hrs each, 8 total. Ship fast.

## What We're Building

An AI system that ingests meeting notes from Granola, stores them in a searchable knowledge base, and lets anyone chat with it via Slack. It also auto-extracts action items and creates Linear issues with a pre-announce → execute → notify pattern (inspired by Divan's Actor concept).

**Granola access**: Hybrid Zapier + MCP. Zapier webhook fires instantly on new note → our server uses Granola MCP to fetch full content + transcript. MCP uses browser OAuth (no Enterprise key needed). `/ingest` Slack command as fallback.

---

## Tech Stack

| Component | Choice |
|---|---|
| Runtime | TypeScript + Node.js 20+ (tsx) |
| Slack | `@slack/bolt` (Socket Mode dev, HTTP prod) |
| LLM | OpenAI `gpt-4o` + `text-embedding-3-small` |
| Vector DB | `vectra` (file-backed, zero-infra) |
| Granola | `@modelcontextprotocol/sdk` (MCP client) |
| Linear | `@linear/sdk` |
| Server | Express (webhooks + health) |
| Deploy | Railway |

---

## Project Structure

```
src/
  index.ts                    # Entry: boots everything
  config.ts                   # Env var loading + validation
  server.ts                   # Express app (webhooks + health check)

  granola/
    mcpClient.ts              # MCP client: list/get meetings, transcripts
    webhook.ts                # POST /webhooks/granola — Zapier trigger → MCP fetch
    types.ts                  # TypeScript interfaces

  knowledge/
    vectorStore.ts            # Vectra wrapper: init(), addDocument(), query()
    summarizer.ts             # GPT-4o: notes → structured summary + action items
    qa.ts                     # RAG: question → vector search → GPT-4o answer

  slack/
    app.ts                    # Bolt setup, event routing
    mentionHandler.ts         # @mention intent routing: Q&A / summarize / create-issue
    threadSummarizer.ts       # Fetch thread → summarize → store in KB
    ingestCommand.ts          # /ingest slash command

  linear/
    client.ts                 # SDK init, cache teams/users
    issueCreator.ts           # LLM extracts fields → pre-announce → create → notify

  pipeline/
    meetingPipeline.ts        # Orchestrator: ingest → summarize → store → notify → action items
    meetingStore.ts           # Persist raw + summaries to data/meetings/{id}.json

data/
  vector-index/               # Vectra persistent storage
  meetings/                   # Raw meeting JSON archive
  seen-docs.json              # Processed doc IDs
```

---

## Data Flows

### Flow 1: Meeting Ingestion
```
Zapier webhook (instant trigger on new note)
  → POST /webhooks/granola
  → Granola MCP fetches full content + transcript
  → meetingPipeline:
      1. GPT-4o summarizer → { summary, keyDecisions, actionItems, discussionPoints }
      2. Save raw + Granola summary + GPT summary to data/meetings/{id}.json
      3. Upsert GPT summary into Vectra (for RAG)
      4. Post summary to Slack channel
      5. For each action item with assignee:
         → Pre-announce in Slack thread ("Creating issue: X, assigning to Y")
         → Create Linear issue
         → Update thread with issue link
```

### Flow 2: Slack Q&A
```
@bot <question> → Vectra top-5 → GPT-4o with context → reply in thread
```

### Flow 3: Thread Summarization
```
@bot summarize this (in thread) → fetch replies → GPT-4o → store in Vectra → reply
```

### Flow 4: Linear Issues (from Slack)
```
@bot create issue: <desc> assign @person
  → Pre-announce in thread ("Creating: X for Y")
  → GPT-4o extracts title + description + assignee
  → Fuzzy match assignee → Linear API
  → Update thread with issue URL
```

---

## .env Template

```bash
GRANOLA_OAUTH_TOKEN=          # One-time browser OAuth
OPENAI_API_KEY=
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...      # Socket Mode
SLACK_SIGNING_SECRET=
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=
PORT=3000
SUMMARY_CHANNEL_ID=           # Slack channel for auto-posting
```

---

# PERSON A — "Backend + Knowledge" (~4 hrs)

> Owns: Granola MCP, Vectra, summarizer, pipeline, meeting store, Express server

## Your files
```
src/config.ts, src/server.ts, src/index.ts
src/granola/*       (mcpClient.ts, webhook.ts, types.ts)
src/knowledge/*     (vectorStore.ts, summarizer.ts)
src/pipeline/*      (meetingPipeline.ts, meetingStore.ts)
package.json, tsconfig.json, .env.example, .gitignore
```

### A1. Scaffolding + config (30 min)
- `npm init`, install deps:
  ```
  npm i openai vectra @slack/bolt @linear/sdk express dotenv tsx @modelcontextprotocol/sdk
  npm i -D typescript @types/node @types/express
  ```
- `tsconfig.json`, `.gitignore`, `.env.example`, directory structure
- `src/config.ts` — load dotenv, typed config, throw on missing required vars

### A2. Granola MCP client (45 min)
- `src/granola/types.ts` — Meeting, Transcript, MeetingContent interfaces
- `src/granola/mcpClient.ts`:
  - `StreamableHTTPClientTransport` → `https://mcp.granola.ai/mcp`
  - `connect()`, `listMeetings()`, `getMeeting(id)`, `getTranscript(id)`

### A3. Zapier webhook + Express (30 min)
- `src/server.ts` — Express on PORT, GET `/` health check
- `src/granola/webhook.ts` — POST `/webhooks/granola`:
  - Receive Zapier payload → MCP fetch full content → dedup → meetingPipeline

### A4. Vectra vector store (40 min)
- `src/knowledge/vectorStore.ts`:
  - `init()` — LocalDocumentIndex at `./data/vector-index/`
  - `addDocument(id, text, metadata)` — upsert with embeddings
  - `query(question, topK=5)` → `{ text, score, metadata }[]`

### A5. Summarizer (40 min)
- `src/knowledge/summarizer.ts`:
  - `summarizeMeeting(notes, transcript?)` → `{ summary, keyDecisions, actionItems: { task, assignee? }[], discussionPoints }`
  - GPT-4o structured output

### A6. Meeting store + pipeline (40 min)
- `src/pipeline/meetingStore.ts`:
  - `saveMeeting(record)` → `data/meetings/{id}.json`
  - MeetingRecord: `{ id, title, date, rawNotes, transcript, granolaSummary, gptSummary, createdAt }`
- `src/pipeline/meetingPipeline.ts`:
  - `processMeeting(...)` → summarize → save all versions → Vectra upsert → return summary
  - Person B wires Slack notification + Linear issue creation into this

### A7. Wire index.ts (15 min)
- Boot Express, init Vectra, connect MCP
- Person B adds Slack + Linear boot

---

## Sync points
| When | Push | For Person B |
|---|---|---|
| Hour 1.5 | `vectorStore.ts` interface | B needs for Q&A + thread summarizer |
| Hour 2.5 | `summarizer.ts` + `meetingPipeline.ts` | B wires Slack + Linear into pipeline |

---

# PERSON B — "Interfaces + Q&A + Deploy" (~4 hrs)

> Owns: Slack bot, RAG Q&A, Linear (with pre-announce pattern), deploy

## Your files
```
src/slack/*         (app.ts, mentionHandler.ts, threadSummarizer.ts, ingestCommand.ts)
src/knowledge/qa.ts
src/linear/*        (client.ts, issueCreator.ts)
Dockerfile
```

## Pre-work (10 min, before coding)
1. Create Slack app → Socket Mode → scopes: `app_mentions:read`, `chat:write`, `channels:history`, `commands`
2. Subscribe to `app_mention` event, create `/ingest` command
3. Install to workspace, copy tokens to `.env`

### B1. Slack Bolt app (20 min)
- `src/slack/app.ts` — Bolt + Socket Mode, export `slackApp`

### B2. Mention handler (40 min)
- `src/slack/mentionHandler.ts`:
  - Parse @mention text → intent: "summarize" / "create issue" / Q&A (default)
  - Route to appropriate handler
  - Always reply in thread, show typing

### B3. RAG Q&A (40 min)
- `src/knowledge/qa.ts`:
  - `answerQuestion(question)` → query Vectra top-5 → GPT-4o with context → answer
  - Wire as default intent in mentionHandler

### B4. Thread summarizer (30 min)
- `src/slack/threadSummarizer.ts`:
  - `conversations.replies` → format → GPT-4o summarize → Vectra upsert → reply

### B5. Ingest command (20 min)
- `src/slack/ingestCommand.ts`:
  - `/ingest` → Slack modal with text area → submit → meetingPipeline → confirm

### B6. Linear client + issue creator with pre-announce (50 min)
- `src/linear/client.ts` — SDK init, cache team members
- `src/linear/issueCreator.ts`:
  - `createIssueFromText(text, slackClient, channel, threadTs)`:
    1. GPT-4o function calling → extract `{ title, description, assigneeName }`
    2. **Pre-announce** in Slack thread: "Creating issue: *{title}* → assigning to {name}"
    3. Fuzzy match assignee → Linear user
    4. `linearClient.createIssue(...)`
    5. **Notify** in thread: "Created: [title](url) — assigned to {name}"

### B7. Wire into pipeline + deploy (30 min)
- Wire Slack summary notification + Linear auto-creation into `meetingPipeline.ts`
- Add Slack + Linear boot to `index.ts`
- Dockerfile (multi-stage) + Railway deploy + persistent volume for `./data/`

---

## Sync points
| When | Need | From Person A |
|---|---|---|
| Hour 1.5 | `vectorStore` interface | For Q&A + thread summarizer |
| Hour 2.5 | `meetingPipeline` | Wire Slack + Linear into it |

---

# Timeline (4 hrs each)

```
Hour 0-1.5  [PARALLEL]  A: scaffold + config + MCP client       B: Slack app + mention handler + Q&A
                         ── sync: A pushes vectorStore ──
Hour 1.5-2.5 [PARALLEL] A: webhook + Vectra + summarizer        B: thread summarizer + ingest + start Linear
                         ── sync: A pushes pipeline ──
Hour 2.5-3.5 [PARALLEL] A: meeting store + pipeline + wire      B: Linear issue creator (pre-announce pattern)
Hour 3.5-4   [TOGETHER]  Wire everything + Dockerfile + Railway deploy + test
```

---

# What Ships vs What's Cut

### Ships (core demo)
1. Granola → Zapier trigger → MCP fetch → GPT-4o summary
2. Raw + summary stored in JSON files + Vectra
3. Summary auto-posted to Slack channel
4. Action items → pre-announce in Slack → Linear issues created → thread updated with links
5. @bot Q&A against knowledge base (RAG)
6. @bot create issue (manual trigger from Slack)
7. Deployed on Railway

### Cut (no time)
- Google Calendar attendee lookup
- Email summaries to attendees
- Thread summarization → KB (build if spare 20 min)
- GitHub PR creation
- PRD auto-generation
- Testing infrastructure
- Postgres / Drizzle ORM

### Demo script (5 steps)
1. Finish a meeting in Granola → Zapier fires → system fetches notes via MCP
2. Bot posts summary to Slack with action items
3. Bot pre-announces "Creating issue: X for Y" → Linear issue link appears in thread
4. "@bot what decisions were made in the last meeting?" → RAG answer
5. "@bot create issue: build the auth flow, assign to Alice" → pre-announce → Linear link

---

# Key Decisions (merged from both plans)

| Decision | Choice | Why |
|---|---|---|
| Granola trigger | Zapier webhook → MCP fetch | Instant trigger + rich data. No Enterprise API key. |
| Vector DB | Vectra | In-process, file-backed. No Docker. |
| Raw data | JSON files per meeting | Store everything (raw, Granola summary, GPT summary) for later. No Postgres overhead. |
| LLM | GPT-4o + text-embedding-3-small | Single API key for chat + embeddings. |
| Linear pattern | Pre-announce → execute → notify | From Divan's Actor concept. Bot announces intent before acting. Impressive in demo. |
| Slack mode | Socket Mode (dev) → HTTP (Railway) | No ngrok needed locally. |
| Deploy | Railway | Persistent volume for data/, one-command deploy. |
| Testing | Skip | 4 hrs each. Tests are a luxury. Ship it. |
