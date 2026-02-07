# Dr. Evil — Meeting Intelligence Agent

> *"Your meetings. Handled. With surgical precision."*

An autonomous meeting intelligence agent that ingests meeting notes, builds a searchable knowledge base, creates tickets, and answers questions — all through a Slack bot with personality.

Built in one day for the **Granola x DeepMind Hackathon 2026**.

## What It Does

**Dr. Evil** is an end-to-end meeting automation system. It takes raw meeting notes and turns them into structured knowledge, actionable tickets, and instant answers.

### Core Capabilities

| Capability | Description |
|---|---|
| **Auto-Summarization** | Meeting notes are processed through LLM, extracting key decisions, action items, discussion points, and assignees |
| **Knowledge Base** | All meetings are embedded into a vector store for semantic search and RAG-powered Q&A |
| **Slack Bot** | `@Dr. Evil` in Slack to ask questions, summarize threads, or create tickets — in character |
| **Actor System** | Action items are automatically classified (bug, feature, task, follow-up) and routed to specialized handlers |
| **Linear Integration** | Tickets are created automatically with correct assignees, titles, and descriptions |
| **GitHub Integration** | Bug reports and PRs can be created directly from meeting action items |
| **Thread Summarization** | Any Slack thread can be summarized into a full meeting record with structured action items |
| **Assignee Matching** | Fuzzy-matches action item assignees to meeting participants by name, email, or partial match |
| **Web Dashboard** | Real-time dashboard to browse meetings, vector store entries, and run semantic searches |

### Data Flow

```
Meeting Notes (Granola / Slack / Manual)
    │
    ▼
┌─────────────────────────────────────┐
│  Meeting Pipeline                    │
│  ┌───────────┐   ┌───────────────┐  │
│  │ LLM   │──▶│ Structured    │  │
│  │ Summarizer│   │ Summary       │  │
│  └───────────┘   └──────┬────────┘  │
│                          │           │
│  ┌───────────┐   ┌──────▼────────┐  │
│  │ Vector DB │◀──│ Meeting Store │  │
│  │ (Vectra)  │   │ (JSON)        │  │
│  └───────────┘   └──────┬────────┘  │
└──────────────────────────┼───────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Slack   │ │  Linear  │ │  GitHub  │
        │  Notify  │ │  Tickets │ │  Issues  │
        └──────────┘ └──────────┘ └──────────┘
```

### Actor System

Action items extracted from meetings are automatically classified and routed:

| Type | Handler | What It Does |
|---|---|---|
| `bug` | Bug Handler | Creates Linear bug ticket + optional GitHub issue with reproduction steps |
| `feature` | Feature Handler | Creates Linear feature ticket with PRD-style description |
| `task` | Task Handler | Creates Linear task with context from the meeting |
| `follow_up` | Follow-Up Handler | Posts Slack reminder with assignee mention |
| `pr` | PR Handler | Creates GitHub issue for code-related action items |

All handlers run concurrently via the orchestrator, then post a grouped summary to Slack.

## Architecture

```
src/
├── index.ts                     # Entry point — boots all services
├── config.ts                    # Environment variable validation
├── server.ts                    # Express: webhooks, API, dashboard, landing page
│
├── ai/
│   ├── models.ts                # LLM wrapper (text + JSON modes)
│   └── soul.ts                  # Dr. Evil personality engine
│
├── granola/
│   ├── mcpClient.ts             # Granola MCP server client
│   ├── webhook.ts               # Zapier webhook receiver + attendee parser
│   └── types.ts                 # Core TypeScript types
│
├── knowledge/
│   ├── vectorStore.ts           # Vectra vector DB (embed, query, CRUD)
│   ├── summarizer.ts            # GPT structured summarization
│   └── qa.ts                    # RAG pipeline: vector search → full record → answer
│
├── pipeline/
│   ├── meetingPipeline.ts        # Orchestrator: summarize → store → notify
│   └── meetingStore.ts           # JSON file-based meeting persistence
│
├── actor/
│   ├── orchestrator.ts           # Concurrent action item processing
│   ├── router.ts                 # Routes items to handlers by type
│   └── handlers/                 # bug, feature, task, follow_up, pr
│
├── providers/
│   ├── linear.ts                 # Linear SDK: create issues, match users
│   ├── github.ts                 # Octokit: create issues and PRs
│   └── registry.ts               # Provider registration system
│
└── slack/
    ├── app.ts                    # Slack Bolt (Socket Mode)
    ├── mentionHandler.ts         # @mention intent routing
    ├── threadSummarizer.ts       # Thread → full meeting record
    ├── ingestCommand.ts          # /ingest slash command
    ├── postProcessHook.ts        # Post-meeting Slack + actor notification
    └── format.ts                 # Slack message formatting
```

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | TypeScript, Node.js 20+ |
| AI | LLM + vector embeddings |
| Vector DB | Vectra (in-process, file-backed) |
| Slack | @slack/bolt (Socket Mode) |
| Project Management | @linear/sdk |
| Code Platform | @octokit/rest (GitHub) |
| Meeting Source | Granola AI (via MCP + Zapier webhook) |
| HTTP Server | Express 5 |
| Deployment | Railway (persistent volume) |
| CI/CD | GitHub Actions |

## Ingestion Paths

Dr. Evil accepts meeting notes from three sources:

1. **Granola Webhook** — Zapier watches for new Granola notes and POSTs to `/webhooks/granola`
2. **Slack `/ingest`** — Manual command opens a modal to paste meeting notes
3. **Thread Summary** — `@Dr. Evil summarize this` in any Slack thread creates a full meeting record

## Slack Commands

| Command | What Happens |
|---|---|
| `@Dr. Evil <question>` | RAG search across all meetings, answer with citations |
| `@Dr. Evil summarize this` (in thread) | Summarizes thread, creates meeting record + vector entry |
| `@Dr. Evil create issue: <desc>` | Creates Linear ticket with assignee matching |
| `/ingest` | Opens modal to manually paste meeting notes |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Landing page |
| `GET` | `/health` | Health check |
| `GET` | `/dashboard` | Web dashboard (meetings, vector store, search) |
| `GET` | `/meetings` | List all meetings |
| `GET` | `/meetings/:id` | Full meeting detail |
| `DELETE` | `/meetings/:id` | Delete a meeting |
| `GET` | `/vector` | List all vector documents |
| `DELETE` | `/vector/:uri` | Delete a vector document |
| `GET` | `/vector/search?q=...` | Semantic search |
| `POST` | `/webhooks/granola` | Granola/Zapier webhook |

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your keys (see below)

# Run locally
npm start

# Development mode (hot reload)
npm run dev
```

### Environment Variables

```env
# LLM (required)
OPENAI_API_KEY=sk-...

# Slack Bot
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
SUMMARY_CHANNEL_ID=C...

# Linear
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=...

# GitHub (optional)
GITHUB_TOKEN=ghp_...
GITHUB_REPO=owner/repo

# Granola (optional — webhook works without this)
GRANOLA_OAUTH_TOKEN=...

# Server
PORT=3030
```

## Deployment

Deployed on **Railway** with a persistent volume at `/app/data` for meeting records and vector index.

CI/CD via GitHub Actions — every push to `main` triggers automatic deployment.

```bash
# Manual deploy
railway up --detach --service app
```

## The Dr. Evil Persona

The Slack bot operates in character as Dr. Evil. Every response is delivered with theatrical precision:

- Bug fixes are "eliminating the problem"
- PRs are "the latest creation"
- Action items go "on the agenda"
- Air quotes are mandatory for "critical" bugs
- Always speaks as part of the team: "we", "our", "us"

> *"Dr. Evil will personally see to this... one moment."*

## Team

Built by **Person A** (data pipeline, knowledge base, API, deployment) and **Person B** (Slack bot, actor system, Linear/GitHub integrations, personality engine).

Powered by Google Gemini.
