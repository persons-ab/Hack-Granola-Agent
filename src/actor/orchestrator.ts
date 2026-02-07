import type { ActionItem, ActionItemPriority } from "../granola/types.js";
import { characterLine } from "../ai/soul.js";
import { fmtActionPlan } from "../slack/format.js";
import { getHandler } from "./router.js";
import type { HandlerResult, SlackContext } from "./handlers/types.js";

const PRIORITY_ORDER: Record<ActionItemPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function sortByPriority(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority || "medium"];
    const pb = PRIORITY_ORDER[b.priority || "medium"];
    return pa - pb;
  });
}

interface OrchestrateResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ item: ActionItem; result: HandlerResult }>;
}

export async function orchestrate(
  items: ActionItem[],
  ctx: SlackContext
): Promise<OrchestrateResult> {
  if (items.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, results: [] };
  }

  const sorted = sortByPriority(items);

  // Post plan FIRST — before handlers execute
  const intro = await characterLine(
    `${items.length} action items from a meeting. Announce you're taking care of them. Do NOT list the items.`
  );
  await ctx.client.chat.postMessage({
    channel: ctx.channel,
    thread_ts: ctx.threadTs,
    text: `${intro}\n\n${fmtActionPlan(sorted)}`,
  });

  // Execute all handlers concurrently
  const settled = await Promise.allSettled(
    sorted.map(async (item) => {
      const handler = getHandler(item.type);
      console.log(`[orchestrator] Routing "${item.task}" → ${handler.type} handler`);
      const result = await handler.execute(item, ctx);
      return { item, result };
    })
  );

  const results: OrchestrateResult["results"] = [];
  let succeeded = 0;
  let failed = 0;

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
      if (outcome.value.result.success) {
        succeeded++;
      } else {
        failed++;
      }
    } else {
      failed++;
      console.error("[orchestrator] Handler threw:", outcome.reason);
    }
  }

  return { total: items.length, succeeded, failed, results };
}
