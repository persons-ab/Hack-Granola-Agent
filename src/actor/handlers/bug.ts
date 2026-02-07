import { aiJSON } from "../../ai/models.js";
import { characterLine } from "../../ai/soul.js";
import type { ActionItem } from "../../granola/types.js";
import { getProvidersByType } from "../../providers/registry.js";
import type { CreatedItem } from "../../providers/types.js";
import { fmtRef } from "../../slack/format.js";
import { createPRViaAPI, fetchFileContent, getRepoFileList } from "./pr.js";
import type { ActionHandler, HandlerResult, SlackContext } from "./types.js";

async function pickRelevantFiles(fileList: string[], bugDescription: string): Promise<string[]> {
  const parsed = await aiJSON<{ files: string[] }>(
    `You are a senior developer. Given a bug description and a list of files in a repository, pick 3-5 files most likely to contain the bug or need changes.

Return JSON: {"files": ["path/to/file1.ts", "path/to/file2.ts"]}

Only pick files that exist in the provided list. Prefer source files over configs/tests.`,
    `Bug: ${bugDescription}\n\nRepository files:\n${fileList.join("\n")}`,
  );

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

  return await aiJSON<GeneratedFix>(
    `You are a senior developer. Given a bug description and relevant source files, generate a fix.

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
    `Bug: ${bugDescription}\n\nSource files:\n${filesContext}`,
  );
}

export const bugHandler: ActionHandler = {
  type: "bug",

  async execute(item: ActionItem, ctx: SlackContext): Promise<HandlerResult> {
    const providers = getProvidersByType("task-manager");
    const provider = providers[0];
    const assigneeName = item.assigneeFullName || item.assignee;

    // Phase A: Create Linear issue (silent — will appear in grouped summary)
    let issueItem: CreatedItem | undefined;

    if (provider) {
      issueItem = await provider.createItem({
        title: `[Bug] ${item.task}`,
        description: item.context || item.task,
        assignee: assigneeName || undefined,
        assigneeEmail: item.assigneeEmail,
        type: "bug",
      });
    }

    // Phase B: Best-effort fix PR
    let prItem: CreatedItem | undefined;
    try {
      if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
        throw new Error("GitHub not configured");
      }

      // Announce auto-fix attempt — ref appended structurally, not by AI
      const ref = issueItem ? fmtRef(issueItem) : "";
      const workingMsg = await characterLine(`Starting work on a bug fix: "${item.task}". Announce you're going to fix it and will send a PR when done. Do NOT invent any ticket numbers.`);
      await ctx.client.chat.postMessage({
        channel: ctx.channel,
        thread_ts: ctx.threadTs,
        text: ref ? `${workingMsg}\n${ref}` : workingMsg,
      });

      const fileList = await getRepoFileList();
      const relevantPaths = await pickRelevantFiles(fileList, item.task);
      if (relevantPaths.length === 0) {
        throw new Error("Could not identify relevant files");
      }

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

      const fix = await generateFix(item.task, fileContents);
      if (!fix.files || fix.files.length === 0) {
        throw new Error("Could not generate a fix");
      }

      const slug = item.task.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
      const branchName = `fix/${Date.now()}-${slug}`;

      prItem = await createPRViaAPI({
        title: fix.commitMessage || `fix: ${item.task}`,
        body: fix.prBody || `Auto-generated fix for: ${item.task}`,
        branchName,
        files: fix.files,
      });

      const doneMsg = await characterLine(`The fix PR is done for bug: "${item.task}". Announce the scheme is complete. Do NOT invent any ticket numbers.`);
      await ctx.client.chat.postMessage({
        channel: ctx.channel,
        thread_ts: ctx.threadTs,
        text: `${doneMsg}\n${fmtRef(prItem)} ${prItem.title}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.warn(`[bug] Auto-fix PR failed: ${msg}`);
    }

    return {
      success: !!issueItem,
      item: issueItem,
      secondaryItems: prItem ? [prItem] : undefined,
      statusText: issueItem
        ? `Bug tracked${prItem ? " + fix PR" : ""}: ${issueItem.title}`
        : `Bug reported (no task manager): ${item.task}`,
    };
  },
};
