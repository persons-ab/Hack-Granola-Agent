import { LinearClient } from "@linear/sdk";
import { config } from "../config.js";
import type {
  ActionProvider,
  CreateItemParams,
  CreatedItem,
  ProviderUser,
} from "./types.js";

export class LinearProvider implements ActionProvider {
  name = "linear";
  type = "task-manager" as const;

  private client: LinearClient | null = null;
  private users: ProviderUser[] = [];

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
  }

  async createItem(params: CreateItemParams): Promise<CreatedItem> {
    if (!this.client) throw new Error("Linear not initialized");

    const assignee = params.assignee
      ? this.matchUser(params.assignee, params.assigneeEmail)
      : null;

    const result = await this.client.createIssue({
      teamId: config.linear.teamId,
      title: params.title,
      description: params.description,
      ...(assignee ? { assigneeId: assignee.id } : {}),
    });

    const issue = await result.issue;
    return {
      id: issue?.identifier || result.lastSyncId.toString(),
      url: issue?.url || "",
      title: params.title,
      provider: this.name,
    };
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
