# Actor System Roadmap

## Problem

Currently the post-process hook is a dumb pipe: extract action items → create Linear issues for assigned ones. No routing, no prioritization, no intelligence.

## Goal

After a meeting is processed, the agent builds a plan and executes the right action for each item:

| Action Type | What the agent does |
|------------|---------------------|
| `bug` | Create Linear issue + read repo + GPT generates fix + open GitHub PR |
| `feature` | Create PRD (detailed Linear issue with structured sections) |
| `task` | Create Linear issue (current behavior) |
| `pr` | Create GitHub PR directly (branch + commit + PR) |
| `follow_up` | Post reminder to Slack thread only |

## Architecture

```
Action Items (from GPT summary)
       │
       ▼
┌─────────────┐
│   Router     │  ← type → handler map
└──────┬──────┘
       │
  ┌────┼────┬────────┬──────────┐
  ▼    ▼    ▼        ▼          ▼
 bug  task  feature  pr      follow_up
  │    │      │      │          │
  │    │      │      │          └→ Slack message
  │    │      │      └→ GitHub: branch + commit + PR
  │    │      └→ Linear: PRD issue (structured)
  │    └→ Linear: issue (current behavior)
  │
  └→ Linear issue
     + GitHub: read files → GPT fix → branch → commit → PR
```

All handlers follow the same pattern:
1. **Pre-announce** in Slack thread ("Working on: ...")
2. **Execute** the action(s)
3. **Notify** in Slack thread with results/links

## Implementation Plan

### 1. Action Router (~30 min)

`src/actor/router.ts`

- Takes an action item (with `type` from GPT extraction)
- Maps to the correct handler
- Runs handler with Slack context for reporting
- Processes ALL items (not just assigned ones)

```typescript
const handlers: Record<string, ActionHandler> = {
  bug: bugHandler,
  feature: featureHandler,
  task: taskHandler,
  pr: prHandler,
  follow_up: followUpHandler,
};
```

### 2. Improve GPT Classification (~20 min)

Update `src/knowledge/summarizer.ts` to extract richer action items:

```typescript
interface ActionItem {
  task: string;
  assignee?: string;
  type: "bug" | "feature" | "task" | "pr" | "follow_up";
  priority: "high" | "medium" | "low";
  context: string;  // relevant details from discussion
}
```

The current prompt extracts `task` and `assignee` only. We need `type`, `priority`, and `context` for routing and for the handlers to do their job well.

### 3. Task Handler (~10 min)

`src/actor/handlers/task.ts`

Essentially what we have now — create a Linear issue. Extract into a standalone handler.

### 4. Feature/PRD Handler (~20 min)

`src/actor/handlers/feature.ts`

- Takes the action item context
- GPT-4o generates a structured PRD (problem, goal, requirements, scope)
- Creates a Linear issue with the PRD as description
- Labels it appropriately

### 5. Follow-up Handler (~10 min)

`src/actor/handlers/followUp.ts`

- Posts a reminder message to Slack thread
- No external system integration needed

### 6. Bug Fix Handler (~1.5 hrs) — the hard one

`src/actor/handlers/bug.ts`

Step 1: Create Linear issue (like task handler)

Step 2: Attempt a fix PR
- Use GitHub API to read repo tree (`GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`)
- Ask GPT-4o: "Given this bug description and this file list, which files are likely relevant?" → get 3-5 file paths
- Fetch those files via GitHub API (`GET /repos/{owner}/{repo}/contents/{path}`)
- Ask GPT-4o: "Here's the bug and the relevant code. Generate a fix." → get modified file contents
- GitHub API workflow:
  1. Get `main` branch SHA
  2. Create branch `fix/{issue-id}-{slug}`
  3. Create blobs for modified files
  4. Create tree with new blobs
  5. Create commit on the new tree
  6. Update branch ref
  7. Create PR targeting `main`
- Post PR link to Slack thread

All via GitHub REST API — no local git needed.

### 7. PR Handler (~30 min)

`src/actor/handlers/pr.ts`

Same as bug handler step 2, but without creating a Linear issue first. For when the meeting explicitly says "we need a PR for X."

### 8. Update Post-Process Hook (~20 min)

Replace the current loop in `postProcessHook.ts`:
- Use the router instead of direct `executeActionAuto` calls
- Process ALL action items (not just assigned)
- Run items concurrently where possible (Promise.allSettled)
- Report summary at end: "Processed 5 action items: 2 issues, 1 PRD, 1 PR, 1 follow-up"

### 9. Orchestration & Status (~30 min)

`src/actor/orchestrator.ts`

- Receives list of action items
- Sorts by priority (high first)
- Runs handlers (concurrent with configurable parallelism)
- Tracks status per item
- Posts a summary to Slack when all done:
  ```
  ✅ Processed 5 action items:
    • 🐛 Fix payment bug → BIL-26 + PR #3
    • 📋 User auth feature → PRD BIL-27
    • ✅ Update docs → BIL-28
    • 🔄 Follow up with design team → reminded
    • ❌ API migration → failed (no relevant files found)
  ```

## File Structure

```
src/actor/
├── router.ts           # type → handler mapping
├── orchestrator.ts     # priority sort, parallel exec, status tracking
└── handlers/
    ├── types.ts        # ActionHandler interface
    ├── task.ts         # Linear issue
    ├── feature.ts      # PRD (structured Linear issue)
    ├── bug.ts          # Linear issue + GitHub fix PR
    ├── pr.ts           # GitHub PR only
    └── followUp.ts     # Slack reminder
```

## Execution Order

1. Router + handler interface + task handler (get the skeleton working)
2. Feature + follow-up handlers (quick wins)
3. Bug handler (the big one — GitHub PR generation)
4. Orchestrator with priority + concurrency
5. Wire into post-process hook, test E2E

## Config

Uses existing env vars:
- `LINEAR_API_KEY` / `LINEAR_TEAM_ID` — for issues/PRDs
- `GITHUB_TOKEN` / `GITHUB_REPO` — for PRs (configurable target repo)
- `OPENAI_API_KEY` — for GPT-4o classification + code generation

## Testing

- Unit test each handler with mocked APIs
- E2E: send webhook with mixed action items, verify correct routing
- Bug handler: test with a known simple bug in a test repo
