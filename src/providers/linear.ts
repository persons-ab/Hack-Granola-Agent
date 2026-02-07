import { LinearClient } from "@linear/sdk";
import { config } from "../config.js";
import type {
  ActionProvider,
  CreateItemParams,
  CreatedItem,
  ProviderUser,
} from "./types.js";

function isAttributeNotAllowedError(err: unknown): boolean {
  const anyErr = err as any;
  const message =
    (typeof anyErr?.message === "string" && anyErr.message) ||
    (typeof anyErr?.toString === "function" ? String(anyErr) : "");

  // Seen in the wild as `409/ATTRIBUTE.NOT_ALLOWED` and variations.
  if (/ATTRIBUTE\.?NOT_ALLOWED/i.test(message)) return true;
  if (/\b409\b/.test(message) && /NOT_ALLOWED/i.test(message)) return true;

  const gqlErrors = anyErr?.errors;
  if (Array.isArray(gqlErrors)) {
    for (const e of gqlErrors) {
      const code = e?.extensions?.code;
      const emsg = e?.message;
      if (typeof code === "string" && /NOT_ALLOWED/i.test(code)) return true;
      if (typeof emsg === "string" && /ATTRIBUTE\.?NOT_ALLOWED/i.test(emsg)) {
        return true;
      }
    }
  }

  return false;
}

export class LinearProvider implements ActionProvider {
  name = "linear";
  type = "task-manager" as const;

  private client: LinearClient | null = null;
  private users: ProviderUser[] = [];
  private teamMemberIds: Set<string> | null = null;

  async init(): Promise<void> {
    this.client = new LinearClient({ apiKey: config.linear.apiKey });

    try {
      const result = await this.client.users();
      this.users = result.nodes.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email || undefined,
      }));
      console.log(`[linear] Cached ${this.users.length} users`);
    } catch (err) {
      console.warn("[linear] Could not cache users:", err);
    }

    // Best-effort: cache team members so we don't try to assign users
    // that are not allowed for the configured team (can trigger 409/ATTRIBUTE.NOT_ALLOWED).
    try {
      const team = await this.client.team(config.linear.teamId);
      const members = await team.members();
      this.teamMemberIds = new Set(members.nodes.map((m) => m.id));
      console.log(`[linear] Cached ${this.teamMemberIds.size} team members`);
    } catch (err) {
      this.teamMemberIds = null;
      console.warn("[linear] Could not cache team members:", err);
    }
  }

  async createItem(params: CreateItemParams): Promise<CreatedItem> {
    if (!this.client) throw new Error("Linear not initialized");

    const matchedAssignee = params.assignee
      ? this.matchUser(params.assignee, params.assigneeEmail)
      : null;

    // If we know team members, only assign when the user is a member of the configured team.
    const assigneeAllowed =
      !!matchedAssignee &&
      (!this.teamMemberIds || this.teamMemberIds.has(matchedAssignee.id));

    if (matchedAssignee && !assigneeAllowed) {
      console.warn(
        `[linear] Matched assignee "${matchedAssignee.name}" (${matchedAssignee.id}) is not a member of team ${config.linear.teamId}; creating issue unassigned`
      );
    }

    const baseInput = {
      teamId: config.linear.teamId,
      title: params.title,
      description: params.description,
    };

    const inputWithAssignee = {
      ...baseInput,
      ...(assigneeAllowed ? { assigneeId: matchedAssignee!.id } : {}),
    };

    try {
      const result = await this.client.createIssue(inputWithAssignee);
      const issue = await result.issue;
      return {
        id: issue?.identifier || result.lastSyncId.toString(),
        url: issue?.url || "",
        title: params.title,
        provider: this.name,
      };
    } catch (err) {
      // If Linear rejects assignment (commonly 409/ATTRIBUTE.NOT_ALLOWED), retry without assignee.
      if (assigneeAllowed && isAttributeNotAllowedError(err)) {
        console.warn(
          `[linear] CreateIssue rejected assignee (409/ATTRIBUTE.NOT_ALLOWED). Retrying without assignee. Original error:`,
          err
        );

        const result = await this.client.createIssue(baseInput);
        const issue = await result.issue;
        return {
          id: issue?.identifier || result.lastSyncId.toString(),
          url: issue?.url || "",
          title: params.title,
          provider: this.name,
        };
      }

      throw err;
    }
  }

  async listUsers(): Promise<ProviderUser[]> {
    return this.users;
  }

  matchUser(name: string, email?: string): ProviderUser | null {
    if (!name && !email) return null;

    // Exact email match — strongest signal
    if (email) {
      const byEmail = this.users.find(
        (u) => u.email && u.email.toLowerCase() === email.toLowerCase()
      );
      if (byEmail) return byEmail;
    }

    if (!name) return null;
    const lower = name.toLowerCase().trim();

    const exact = this.users.find(
      (u) =>
        u.name.toLowerCase() === lower ||
        (u.email && u.email.toLowerCase().split("@")[0] === lower)
    );
    if (exact) return exact;

    const partial = this.users.find(
      (u) =>
        u.name.toLowerCase().startsWith(lower) ||
        u.name.toLowerCase().includes(lower)
    );
    return partial || null;
  }
}
