# Plan: AI Agent for Granola Meeting Action Items

## Context

Building an AI agent that connects to Granola MCP (Meeting Context Protocol) to:
1. Extract meeting notes and save raw data to Vectra (vector database)
2. Process through AI pipeline to extract actionable items
3. Once processing completes, send notifications to:
   - Slack channel (pre-configured)
   - Email to meeting participants
   - Slack thread for updates
4. Actor monitors actionable lists and:
   - Announces planned action in Slack thread
   - Executes action (create PRD, PR, etc.)
   - Updates Slack thread with status and results

**Key Design Decisions:**
- Global channel configuration (all calls go to same channels)
- Vectra vector database for semantic search and context retrieval
- Automatic AI-driven action execution with pre-announcement
- Database as source of truth, synced to Slack for visibility
- Node.js standalone service architecture
- **Extreme testability**: Every module has unit tests + e2e tests as the primary tool for understanding behavior

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Granola MCP                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       INGESTOR                               │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐ │
│  │   Granola   │───▶│   Vectra     │───▶│  AI Pipeline   │ │
│  │   Client    │    │   Storage    │    │  (Extract      │ │
│  │             │    │ (Raw + Vec)  │    │   Actions)     │ │
│  └─────────────┘    └──────────────┘    └────────┬───────┘ │
│                                                   │         │
│                     ┌─────────────────────────────┘         │
│                     ▼                                       │
│            ┌──────────────────┐                             │
│            │ Pipeline Manager │ (Once processing completes) │
│            └────────┬─────────┘                             │
└─────────────────────┼───────────────────────────────────────┘
                      │
      ┌───────────────┼─────────────────┐
      │               │                 │
      ▼               ▼                 ▼
┌──────────┐  ┌──────────────┐  ┌─────────────────┐
│  Slack   │  │    Email     │  │  Slack Thread   │
│ Channel  │  │(Participants)│  │    Updates      │
└────┬─────┘  └──────────────┘  └─────────────────┘
     │
     │ (Thread created)
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                         ACTOR                                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Monitor    │───▶│ Pre-Announce │───▶│   Executor   │  │
│  │  (Watches    │    │  (Notify in  │    │  (Creates    │  │
│  │   Actions)   │    │   Thread)    │    │   Artifacts) │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘  │
│                                                   │          │
│                      ┌────────────────────────────┘          │
│                      ▼                                       │
│              ┌──────────────┐                                │
│              │   Notifier   │                                │
│              │  (Update     │                                │
│              │   Thread)    │                                │
│              └──────────────┘                                │
└─────────────────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────────────┐
        │             │                     │
        ▼             ▼                     ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    Linear    │ │    GitHub    │ │    Other     │
│     API      │ │     API      │ │   Services   │
└──────────────┘ └──────────────┘ └──────────────┘
```

## Core Entities

### 1. Call
Represents a meeting from Granola MCP.

```typescript
interface Call {
  id: string;
  granolaId: string;              // ID from Granola
  timestamp: Date;
  participants: Participant[];     // Array of participant details
  transcript: string;
  summary: string;
  rawData: Record<string, unknown>;  // Original Granola data
  vectraDocId?: string;            // Vector DB document ID
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;              // When AI processing finished
}

interface Participant {
  email: string;
  name?: string;
  role?: string;
}
```

### 2. ActionItem
Actionable items extracted from calls by AI.

```typescript
interface ActionItem {
  id: string;
  callId: string;
  description: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'announced' | 'in_progress' | 'completed' | 'cancelled';
  type: 'prd' | 'pr' | 'issue' | 'task' | 'follow_up';
  dueDate?: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  announcedAt?: Date;              // When actor announced intent in Slack
}
```

### 3. Thread
Represents a conversation thread in a channel (primarily Slack).

```typescript
interface Thread {
  id: string;
  callId: string;
  channelType: 'slack' | 'email';
  channelId: string;              // e.g., Slack channel ID
  threadId: string;               // e.g., Slack thread_ts
  url?: string;
  createdAt: Date;
}
```

### 4. Artifact
Created outputs from actor actions.

```typescript
interface Artifact {
  id: string;
  actionItemId: string;
  threadId: string;
  type: 'prd' | 'pr' | 'issue' | 'doc';
  externalId: string;             // Linear issue ID, GitHub PR number, etc.
  externalUrl: string;
  status: 'creating' | 'created' | 'failed';
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

### 5. ChannelConfig
Configuration for output channels.

```typescript
interface ChannelConfig {
  id: string;
  type: 'slack' | 'email';
  enabled: boolean;
  config: Record<string, unknown>;  // API keys, webhook URLs, etc.
  createdAt: Date;
}

### 6. VectraDocument
Stored in Vectra vector database for semantic search.

```typescript
interface VectraDocument {
  id: string;
  callId: string;
  content: string;                 // Full transcript + summary
  embedding: number[];             // Vector embedding
  metadata: {
    timestamp: Date;
    participants: string[];
    summary: string;
  };
}
```

## Directory Structure

```
/
├── README.md                        # Product description
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── ingestor/
│   │   ├── index.ts                 # Ingestor entry point
│   │   ├── client/
│   │   │   ├── granola.ts           # Granola MCP client
│   │   │   └── vectra.ts            # Vectra vector DB client
│   │   ├── processor/
│   │   │   ├── call-processor.ts    # Process calls, extract actions
│   │   │   ├── ai-extractor.ts      # AI-powered extraction logic
│   │   │   └── embeddings.ts        # Generate embeddings for Vectra
│   │   └── pipeline/
│   │       ├── pipeline-manager.ts  # Orchestrates channel sends (after processing)
│   │       ├── channels/
│   │       │   ├── slack.ts         # Slack integration
│   │       │   └── email.ts         # Email to participants
│   │       └── formatter.ts         # Format messages for channels
│   ├── actor/
│   │   ├── index.ts                 # Actor entry point
│   │   ├── monitor/
│   │   │   ├── action-monitor.ts    # Watches for pending actions
│   │   │   └── scheduler.ts         # Scheduling/prioritization logic
│   │   ├── announcer/
│   │   │   └── pre-announce.ts      # Announce intent in Slack BEFORE executing
│   │   ├── executor/
│   │   │   ├── executor.ts          # Main execution orchestrator
│   │   │   ├── actions/
│   │   │   │   ├── create-prd.ts    # Linear PRD creation
│   │   │   │   ├── create-pr.ts     # GitHub PR/bug fix creation
│   │   │   │   └── create-issue.ts  # Issue creation
│   │   │   └── ai-generator.ts      # AI-powered content generation
│   │   └── notifier/
│   │       └── thread-updater.ts    # Updates Slack threads with status
│   ├── shared/
│   │   ├── entities/
│   │   │   ├── call.ts
│   │   │   ├── action-item.ts
│   │   │   ├── thread.ts
│   │   │   ├── artifact.ts
│   │   │   └── channel-config.ts
│   │   ├── db/
│   │   │   ├── client.ts            # Database client
│   │   │   ├── schema.ts            # Database schema
│   │   │   ├── vectra-client.ts     # Vectra vector DB client
│   │   │   └── repositories/
│   │   │       ├── calls.ts
│   │   │       ├── action-items.ts
│   │   │       ├── threads.ts
│   │   │       └── artifacts.ts
│   │   └── utils/
│   │       ├── logger.ts
│   │       ├── config.ts
│   │       └── test-helpers.ts      # Shared test utilities
│   ├── main.ts                      # Entry point
│   └── config.ts                    # Global configuration
├── tests/
│   ├── unit/                        # Unit tests (mirror src structure)
│   │   ├── ingestor/
│   │   │   ├── client/
│   │   │   │   ├── granola.test.ts
│   │   │   │   └── vectra.test.ts
│   │   │   ├── processor/
│   │   │   │   ├── call-processor.test.ts
│   │   │   │   ├── ai-extractor.test.ts
│   │   │   │   └── embeddings.test.ts
│   │   │   └── pipeline/
│   │   │       ├── pipeline-manager.test.ts
│   │   │       ├── channels/
│   │   │       │   ├── slack.test.ts
│   │   │       │   └── email.test.ts
│   │   │       └── formatter.test.ts
│   │   ├── actor/
│   │   │   ├── monitor/
│   │   │   │   ├── action-monitor.test.ts
│   │   │   │   └── scheduler.test.ts
│   │   │   ├── announcer/
│   │   │   │   └── pre-announce.test.ts
│   │   │   ├── executor/
│   │   │   │   ├── executor.test.ts
│   │   │   │   ├── actions/
│   │   │   │   │   ├── create-prd.test.ts
│   │   │   │   │   ├── create-pr.test.ts
│   │   │   │   │   └── create-issue.test.ts
│   │   │   │   └── ai-generator.test.ts
│   │   │   └── notifier/
│   │   │       └── thread-updater.test.ts
│   │   └── shared/
│   │       ├── db/
│   │       │   └── repositories/
│   │       │       ├── calls.test.ts
│   │       │       ├── action-items.test.ts
│   │       │       ├── threads.test.ts
│   │       │       └── artifacts.test.ts
│   │       └── utils/
│   │           └── config.test.ts
│   ├── e2e/                         # End-to-end tests
│   │   ├── ingestor-flow.test.ts    # Full ingestor pipeline
│   │   ├── actor-flow.test.ts       # Full actor pipeline
│   │   ├── complete-flow.test.ts    # Granola → Actions → Artifacts
│   │   └── notification-flow.test.ts # Slack + Email delivery
│   ├── fixtures/                    # Test data
│   │   ├── calls/
│   │   │   ├── sample-call.json
│   │   │   └── multi-action-call.json
│   │   ├── action-items/
│   │   │   └── sample-actions.json
│   │   └── responses/
│   │       ├── anthropic-responses.json
│   │       ├── linear-responses.json
│   │       └── github-responses.json
│   └── mocks/                       # Mock implementations
│       ├── granola-mock.ts
│       ├── vectra-mock.ts
│       ├── slack-mock.ts
│       ├── email-mock.ts
│       ├── linear-mock.ts
│       ├── github-mock.ts
│       └── anthropic-mock.ts
└── db/
    └── migrations/                  # Database migrations
```

## Implementation Flow

### Phase 1: Project Setup & Core Entities
1. Create README.md with product description
2. Initialize TypeScript project (tsconfig.json, package.json)
3. Set up testing infrastructure:
   - Configure Vitest
   - Create test directory structure
   - Set up test helpers and mock builders
   - Create fixture factories
4. Create directory structure
5. Define core entities in `src/shared/entities/` with corresponding unit tests
6. Set up database schema and client in `src/shared/db/`
7. Create repository pattern for data access with unit tests for each repository

### Phase 2: Ingestor (Test-Driven)
Each step includes implementation + unit tests + updating E2E tests:

1. Implement Granola MCP client (`src/ingestor/client/granola.ts`)
   - Unit test: Mock MCP responses, connection errors
   - E2E test: Real MCP connection (optional)

2. Set up Vectra vector database client (`src/ingestor/client/vectra.ts`)
   - Unit test: Mock storage/retrieval operations
   - E2E test: Real vector operations with test DB

3. Create embeddings generator (`src/ingestor/processor/embeddings.ts`)
   - Unit test: Mock embedding API, test chunking logic
   - E2E test: Real embedding generation

4. Build AI extractor using Anthropic SDK (`src/ingestor/processor/ai-extractor.ts`)
   - Unit test: Mock Anthropic responses with various action types
   - Unit test: Test parsing errors, malformed responses
   - E2E test: Real AI extraction (optional, can be slow)

5. Create call processor orchestrator (`src/ingestor/processor/call-processor.ts`)
   - Unit test: Mock all dependencies, test state transitions
   - Unit test: Test error handling at each stage
   - E2E test: Full processing pipeline with real components

6. Implement email channel to participants (`src/ingestor/pipeline/channels/email.ts`)
   - Unit test: Mock SMTP, test participant extraction
   - E2E test: Real email delivery to test inbox

7. Implement Slack channel integration (`src/ingestor/pipeline/channels/slack.ts`)
   - Unit test: Mock Slack API, test message formatting
   - E2E test: Real Slack posting to test channel

8. Build pipeline manager (`src/ingestor/pipeline/pipeline-manager.ts`)
   - Unit test: Mock channels, test conditional routing
   - Unit test: Test processing completion trigger
   - E2E test: Full notification flow

9. Create message formatter (`src/ingestor/pipeline/formatter.ts`)
   - Unit test: Test various action item combinations
   - Unit test: Test Slack markdown formatting

### Phase 3: Actor (Test-Driven)
Each step includes implementation + unit tests + updating E2E tests:

1. Implement action monitor (`src/actor/monitor/action-monitor.ts`)
   - Unit test: Mock DB queries, test polling logic
   - Unit test: Test action filtering (pending vs completed)
   - E2E test: Real DB polling with test data

2. Build scheduler for prioritization (`src/actor/monitor/scheduler.ts`)
   - Unit test: Test priority algorithms
   - Unit test: Test due date handling

3. Create pre-announcer (`src/actor/announcer/pre-announce.ts`)
   - Unit test: Mock Slack, test announcement formatting
   - Unit test: Test status update to 'announced'
   - E2E test: Real Slack announcement

4. Create AI generator for content (`src/actor/executor/ai-generator.ts`)
   - Unit test: Mock Anthropic, test PRD/PR templates
   - Unit test: Test context retrieval from Vectra
   - E2E test: Real AI content generation

5. Implement action executors:
   - **Linear PRD creation** (`src/actor/executor/actions/create-prd.ts`)
     - Unit test: Mock Linear API, test issue creation payload
     - E2E test: Real Linear issue creation

   - **GitHub PR creation** (`src/actor/executor/actions/create-pr.ts`)
     - Unit test: Mock GitHub API, test PR payload
     - E2E test: Real PR creation in test repo

   - **Generic issue creation** (`src/actor/executor/actions/create-issue.ts`)
     - Unit test: Mock APIs, test error handling

6. Build thread updater (`src/actor/notifier/thread-updater.ts`)
   - Unit test: Mock Slack, test status messages
   - Unit test: Test error notifications
   - E2E test: Real thread updates

7. Create executor orchestrator (`src/actor/executor/executor.ts`)
   - Unit test: Mock all steps, test Announce → Execute → Notify flow
   - Unit test: Test rollback on execution failure
   - E2E test: Complete actor flow from pending action to artifact

### Phase 4: Integration & Main Loop (Test-Driven)
1. Create main entry point that runs both ingestor and actor (`src/main.ts`)
   - Unit test: Mock ingestor and actor modules
   - E2E test: Full system integration test

2. Implement configuration loading (`src/config.ts`)
   - Unit test: Test env parsing, validation
   - Unit test: Test missing required config errors

3. Add logging and error handling
   - Unit test: Test log formatting, error capture

4. Create .env.example with required credentials

5. **Final E2E Test Suite**:
   - Complete flow: Granola → Vectra → AI → Slack/Email → Actor → Linear/GitHub
   - Error recovery: Test system resilience to API failures
   - Concurrency: Test multiple simultaneous calls

## Technology Stack

- **Runtime**: Node.js (TypeScript)
- **Database**: PostgreSQL with Drizzle ORM (clean, type-safe, Gemini-like)
- **Vector DB**: Vectra (local vector database for embeddings)
- **MCP**: `@modelcontextprotocol/sdk`
- **Slack**: `@slack/web-api`
- **Email**: `nodemailer` (sending to participants)
- **Linear**: `@linear/sdk`
- **GitHub**: `@octokit/rest`
- **AI**: `@anthropic-ai/sdk`
- **Embeddings**: `@anthropic-ai/sdk` (Claude can generate embeddings) or `openai` SDK
- **Logging**: `pino` (fast, structured logging)
- **Testing**: `vitest` (fast, modern test runner)
- **Test Utilities**: `@testcontainers/postgresql` (E2E DB), `msw` (HTTP mocking)

## Critical Files

- `README.md` - Product description
- `src/shared/entities/*.ts` - Core entity definitions
- `src/shared/db/schema.ts` - Database schema
- `src/shared/db/vectra-client.ts` - Vectra vector DB integration
- `src/ingestor/client/vectra.ts` - Vectra client wrapper
- `src/ingestor/processor/embeddings.ts` - Embedding generation
- `src/ingestor/processor/ai-extractor.ts` - AI extraction logic
- `src/ingestor/processor/call-processor.ts` - Main processing orchestrator
- `src/ingestor/pipeline/pipeline-manager.ts` - Notification trigger (after processing)
- `src/ingestor/pipeline/channels/slack.ts` - Slack integration
- `src/ingestor/pipeline/channels/email.ts` - Email to participants
- `src/actor/announcer/pre-announce.ts` - Pre-execution announcement
- `src/actor/monitor/action-monitor.ts` - Action monitoring
- `src/actor/executor/executor.ts` - Action execution (Announce → Execute → Notify)
- `src/actor/executor/ai-generator.ts` - AI content generation
- `src/actor/notifier/thread-updater.ts` - Slack status updates
- `src/main.ts` - Application entry point

## Code Style Guidelines (Gemini-inspired)

1. **Functional & Type-Safe**: Use TypeScript strictly, prefer functional patterns
2. **Clean Separation**: Single responsibility per module
3. **Explicit Dependencies**: Inject dependencies, avoid globals
4. **Result Types**: Use Result<T, E> pattern for error handling instead of exceptions
5. **Immutability**: Prefer `const`, readonly, and immutable data structures
6. **Descriptive Naming**: Functions and variables clearly describe intent
7. **Small Functions**: Keep functions focused and composable
8. **Testability First**: Every function should be easily testable with clear inputs/outputs

Example pattern:
```typescript
// Good: Gemini-style with testability
export async function extractActionItems(
  call: Call,
  client: AnthropicClient
): Promise<Result<ActionItem[], ExtractionError>> {
  const prompt = buildExtractionPrompt(call);
  const response = await client.sendMessage(prompt);

  if (!response.ok) {
    return err(new ExtractionError('AI request failed', response.error));
  }

  return ok(parseActionItems(response.value));
}

// Avoid: Throwing exceptions, unclear return types, hard-coded dependencies
export async function extractActionItems(call: Call) {
  // ... might throw, unclear what errors to expect
  const client = new AnthropicClient(); // Hard-coded - untestable!
}
```

## Testing Strategy

**Philosophy**: Tests are the primary documentation for how each module works. AI agents and developers should read tests first to understand behavior.

### Testing Principles

1. **Test-Driven Understanding**: Every module must have tests that demonstrate its behavior
2. **Isolation**: Unit tests mock all external dependencies (DB, APIs, AI)
3. **Real Integration**: E2E tests use real services or Docker containers
4. **Fast Feedback**: Unit tests run in <1s, E2E tests in <30s
5. **Deterministic**: Tests must not be flaky - same input = same output
6. **Fixtures Over Randomness**: Use realistic fixtures, not random data

### Unit Test Requirements

Every module must have unit tests that verify:
- ✅ **Happy path**: Normal operation with valid inputs
- ✅ **Error cases**: All error conditions with Result types
- ✅ **Edge cases**: Empty arrays, nulls, boundary conditions
- ✅ **Mocked dependencies**: All external calls mocked

**Example Unit Test Pattern**:
```typescript
// tests/unit/ingestor/processor/ai-extractor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { extractActionItems } from '@/ingestor/processor/ai-extractor';
import { mockAnthropicClient } from '@/tests/mocks/anthropic-mock';
import { sampleCall } from '@/tests/fixtures/calls/sample-call';

describe('AI Extractor', () => {
  it('should extract action items from call transcript', async () => {
    const mockClient = mockAnthropicClient({
      response: { /* mock AI response */ }
    });

    const result = await extractActionItems(sampleCall, mockClient);

    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(3);
    expect(result.value[0].type).toBe('prd');
  });

  it('should handle AI API failure gracefully', async () => {
    const mockClient = mockAnthropicClient({
      shouldFail: true,
      error: 'API timeout'
    });

    const result = await extractActionItems(sampleCall, mockClient);

    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('AI request failed');
  });

  it('should handle empty transcript', async () => {
    const emptyCall = { ...sampleCall, transcript: '' };
    const mockClient = mockAnthropicClient({ response: { actions: [] } });

    const result = await extractActionItems(emptyCall, mockClient);

    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(0);
  });
});
```

### E2E Test Requirements

E2E tests must verify complete flows:

**Example E2E Test Pattern**:
```typescript
// tests/e2e/complete-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDB, teardownTestDB } from '@/tests/helpers/db-setup';
import { mockGranola, mockSlack, mockLinear } from '@/tests/mocks';

describe('Complete Flow: Granola → Slack → Linear', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  it('should process call and create PRD in Linear', async () => {
    // 1. Ingest call from Granola
    const call = await ingestCall(mockGranola.getCall('test-call-1'));
    expect(call.processingStatus).toBe('completed');

    // 2. Verify Slack notification sent
    const slackMessages = mockSlack.getMessages();
    expect(slackMessages).toHaveLength(1);
    expect(slackMessages[0].text).toContain('3 action items');

    // 3. Wait for actor to announce
    await waitFor(() => {
      const announcements = mockSlack.getThreadReplies(slackMessages[0].ts);
      return announcements.some(m => m.text.includes('Planning to create PRD'));
    });

    // 4. Verify PRD created in Linear
    await waitFor(() => {
      const issues = mockLinear.getIssues();
      return issues.length > 0;
    });

    const prd = mockLinear.getIssues()[0];
    expect(prd.title).toContain('User Authentication');

    // 5. Verify Slack updated with Linear link
    const finalReplies = mockSlack.getThreadReplies(slackMessages[0].ts);
    expect(finalReplies).toContainEqual(
      expect.objectContaining({
        text: expect.stringContaining(prd.url)
      })
    );
  });
});
```

### Module-Specific Test Coverage

| Module | Unit Tests | E2E Tests |
|--------|-----------|-----------|
| **Granola Client** | Mock responses, connection failures | Real MCP connection |
| **Vectra Client** | Mock storage/retrieval, embeddings | Real vector operations |
| **AI Extractor** | Mock Anthropic responses, parsing errors | Real AI calls (optional) |
| **Call Processor** | Mock all dependencies, state transitions | Full processing pipeline |
| **Pipeline Manager** | Mock channels, conditional routing | Real Slack/email delivery |
| **Slack Channel** | Mock Slack API, message formatting | Real Slack posting |
| **Email Channel** | Mock SMTP, participant extraction | Real email delivery (test inbox) |
| **Action Monitor** | Mock DB queries, scheduling logic | Real DB polling |
| **Pre-Announcer** | Mock Slack, message formatting | Real Slack announcement |
| **Executor** | Mock all external APIs, error handling | Real Linear/GitHub operations |
| **AI Generator** | Mock Anthropic, content templates | Real AI generation (optional) |
| **Thread Updater** | Mock Slack, threading logic | Real thread updates |

### Test Utilities & Helpers

**Mock Builder Pattern**:
```typescript
// tests/mocks/anthropic-mock.ts
export function mockAnthropicClient(options: {
  response?: any;
  shouldFail?: boolean;
  error?: string;
  delay?: number;
}) {
  return {
    sendMessage: vi.fn(async () => {
      if (options.delay) await sleep(options.delay);
      if (options.shouldFail) {
        return err(new Error(options.error || 'Mock error'));
      }
      return ok(options.response);
    })
  };
}
```

**Fixture Factories**:
```typescript
// tests/fixtures/calls/factory.ts
export function createMockCall(overrides?: Partial<Call>): Call {
  return {
    id: 'test-call-1',
    granolaId: 'granola-123',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    participants: [
      { email: 'alice@example.com', name: 'Alice' },
      { email: 'bob@example.com', name: 'Bob' }
    ],
    transcript: 'We should build a user auth system...',
    summary: 'Discussed user authentication requirements',
    rawData: {},
    processingStatus: 'completed',
    createdAt: new Date(),
    ...overrides
  };
}
```

## Verification

### End-to-End Test Flow:
1. **Setup**: Configure environment variables for Granola, Vectra, Slack, Email, Linear, GitHub
2. **Ingest Test Call**:
   - Connect to Granola MCP
   - Fetch a test call/meeting
   - Verify call is stored in database
   - Verify raw data is stored in Vectra with embeddings
   - Wait for processing status to change to 'completed'
3. **Notification After Processing**:
   - Verify Slack thread is created with actionable list
   - Verify email sent to all participants
   - Check action items appear in Slack thread
4. **Actor Pre-Announcement**:
   - Monitor should detect pending actions
   - Verify actor posts "Planning to create PRD for X" in Slack thread
   - Action status should change to 'announced'
5. **Actor Execution**:
   - Execute a test PRD creation in Linear
   - Verify artifact is created and stored
   - Check Slack thread is updated with "Created PRD: [link]"
6. **Test GitHub PR**:
   - Actor announces "Planning to create PR for bug fix Y"
   - Execute a test PR creation
   - Verify PR is created on GitHub
   - Check Slack thread shows "Created PR #123: [link]"

### Manual Testing:
```bash
# Start the service
npm run dev

# In another terminal, trigger a test ingestion
npm run test:ingest

# Check Slack for new thread
# Wait for actor to create artifacts
# Verify updates appear in Slack thread
```

### Unit Test Commands:
```bash
# Run all unit tests
npm run test:unit

# Run specific module tests
npm run test:unit -- ingestor/processor/ai-extractor

# Run with coverage
npm run test:unit -- --coverage

# Watch mode for development
npm run test:unit -- --watch
```

**Coverage Requirements**:
- Overall: >80% coverage
- Critical paths (AI extraction, executor): >90% coverage
- All error paths must be tested

### E2E Test Commands:
```bash
# Run all E2E tests (slower, uses real services)
npm run test:e2e

# Run specific flow
npm run test:e2e -- complete-flow

# Run with real external services (requires credentials)
npm run test:e2e:real
```

### Test Documentation:
Every test file should include a header comment:
```typescript
/**
 * Unit Tests: AI Extractor
 *
 * Purpose: Verify that meeting transcripts are correctly parsed
 * into structured action items using Anthropic AI.
 *
 * Mocks: Anthropic API client
 * Dependencies: Call entity, ActionItem entity
 *
 * Critical behaviors tested:
 * - Extraction of PRD, PR, and issue type actions
 * - Handling of empty/malformed transcripts
 * - AI API failure recovery
 * - Assignee extraction from transcript
 */
```
