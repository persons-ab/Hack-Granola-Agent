export interface CreateItemParams {
  title: string;
  description: string;
  assignee?: string;
  assigneeEmail?: string;
  type?: "issue" | "pr" | "prd" | "bug" | "task";
  metadata?: Record<string, unknown>;
}

export interface CreatedItem {
  id: string;
  url: string;
  title: string;
  provider: string;
}

export interface ProviderUser {
  id: string;
  name: string;
  email?: string;
}

export interface ActionProvider {
  /** Provider name, e.g. "linear", "github", "youtrack" */
  name: string;

  /** What kind of provider: task managers create issues, code platforms create PRs */
  type: "task-manager" | "code-platform";

  /** Initialize the provider (cache users, auth, etc.) */
  init(): Promise<void>;

  /** Create a work item (issue, PR, PRD, etc.) */
  createItem(params: CreateItemParams): Promise<CreatedItem>;

  /** List available users for assignment */
  listUsers?(): Promise<ProviderUser[]>;

  /** Fuzzy match a user by name, optionally aided by email */
  matchUser?(name: string, email?: string): ProviderUser | null;
}
