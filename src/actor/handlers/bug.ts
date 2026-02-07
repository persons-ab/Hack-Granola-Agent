import OpenAI from "openai";
import { config } from "../../config.js";
import type { ActionItem } from "../../granola/types.js";
import { getProvidersByType } from "../../providers/registry.js";
import type { CreatedItem } from "../../providers/types.js";
import { createPRViaAPI, fetchFileContent, getRepoFileList } from "./pr.js";
import type { ActionHandler, HandlerResult, SlackContext } from "./types.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

async function pickRelevantFiles(fileList: string[], bugDescription: string): Promise<string[]> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior developer. Given a bug description and a list of files in a repository, pick 3-5 files most likely to contain the bug or need changes.

Return JSON: {"files": ["path/to/file1.ts", "path/to/file2.ts"]}

Only pick files that exist in the provided list. Prefer source files over configs/tests.`,
      },
      {
        role: "user",
        content: `Bug: ${bugDescription}\n\nRepository files:\n${fileList.join("\n")}`,
      },
    ],
  });

  const raw = resp.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  return parsed.files || [];
}

interface GeneratedFix {
  files: Array<{ path: string; content: string }>;
  commitMessage: string;
  prBody: string;
}

async function generateFix(
  bugDescription: string,
  fileContents: Map<string, string>
): Promise<GeneratedFix> {
  const filesContext = [...fileContents.entries()]
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior developer. Given a bug description and relevant source files, generate a fix.

Return JSON:
{
  "files": [{"path": "exact/file/path.ts", "content": "complete file content with fix applied"}],
  "commitMessage": "fix: short description of the fix",
  "prBody": "## Bug\\n(description)\\n\\n## Fix\\n(what was changed and why)"
}

IMPORTANT:
- Return the COMPLETE file content for each changed file, not just the diff.
- Only include files that actually need changes.
- Keep changes minimal — fix the bug, don't refactor.`,
      },
      {
        role: "user",
        content: `Bug: ${bugDescription}\n\nSource files:\n${filesContext}`,
      },
    ],
  });

  const raw = resp.choices[0]?.message?.content || "{}";
  return JSON.parse(raw);
}

export const bugHandler: ActionHandler = {
  type: "bug",

  async execute(item: ActionItem, ctx: SlackContext): Promise<HandlerResult> {
    const providers = getProvidersByType("task-manager");
    const provider = providers[0];
    const assigneeName = item.assigneeFullName || item.assignee;
    const assigneeLabel = assigneeName || "unassigned";

    // Phase A: Create Linear issue (always)
    let issueItem: CreatedItem | undefined;

    if (provider) {
      const assignee = assigneeName && provider.matchUser
        ? provider.matchUser(assigneeName, item.assigneeEmail)
        : null;

      await ctx.client.chat.postMessage({
        channel: ctx.channel,
        thread_ts: ctx.threadTs,
        text: `🐛 Bug reported: *${item.task}* → creating issue + attempting auto-fix...`,
      });

      issueItem = await provider.createItem({
        title: `[Bug] ${item.task}`,
        description: item.context || item.task,
        assignee: assigneeName || undefined,
        assigneeEmail: item.assigneeEmail,
        type: "bug",
      });

      await ctx.client.chat.postMessage({
        channel: ctx.channel,
        thread_ts: ctx.threadTs,
        text: `✅ Bug tracked in ${provider.name}: <${issueItem.url}|${issueItem.title}> (${issueItem.id}) → ${assignee?.name || assigneeLabel}`,
      });
    } else {
      await ctx.client.chat.postMessage({
        channel: ctx.channel,
        thread_ts: ctx.threadTs,
        text: `🐛 Bug reported: *${item.task}* → no task manager configured, attempting auto-fix only...`,
      });
    }

    // Phase B: Best-effort fix PR
    let prItem: CreatedItem | undefined;
    try {
      if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
        throw new Error("GitHub not configured — skipping auto-fix PR");
      }

      // Get repo file list
      const fileList = await getRepoFileList();

      // GPT picks relevant files
      const relevantPaths = await pickRelevantFiles(fileList, item.task);
      if (relevantPaths.length === 0) {
        throw new Error("GPT could not identify relevant files");
      }

      // Fetch file contents
      const fileContents = new Map<string, string>();
      for (const path of relevantPaths) {
        try {
          fileContents.set(path, await fetchFileContent(path));
        } catch {
          console.warn(`[bug] Could not fetch ${path}, skipping`);
        }
      }

      if (fileContents.size === 0) {
        throw new Error("Could not fetch any relevant files");
      }

      // GPT generates fix
      const fix = await generateFix(item.task, fileContents);
      if (!fix.files || fix.files.length === 0) {
        throw new Error("GPT could not generate a fix");
      }

      // Create PR via API
      const slug = item.task.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
      const branchName = `fix/${Date.now()}-${slug}`;

      prItem = await createPRViaAPI({
        title: fix.commitMessage || `fix: ${item.task}`,
        body: fix.prBody || `Auto-generated fix for: ${item.task}`,
        branchName,
        files: fix.files,
      });

      await ctx.client.chat.postMessage({
        channel: ctx.channel,
        thread_ts: ctx.threadTs,
        text: `🔧 Auto-fix PR created: <${prItem.url}|${prItem.title}> (${prItem.id})`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.warn(`[bug] Auto-fix PR failed: ${msg}`);
      await ctx.client.chat.postMessage({
        channel: ctx.channel,
        thread_ts: ctx.threadTs,
        text: `⚠️ Auto-fix PR skipped: ${msg}`,
      });
    }

    return {
      success: !!issueItem,
      item: issueItem,
      secondaryItems: prItem ? [prItem] : undefined,
      statusText: issueItem
        ? `Bug tracked${prItem ? " + fix PR created" : ""}: ${issueItem.title}`
        : `Bug reported (no task manager): ${item.task}`,
    };
  },
};
