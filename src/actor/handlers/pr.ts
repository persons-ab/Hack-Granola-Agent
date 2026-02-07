import type { CreatedItem } from "../../providers/types.js";

interface FileChange {
  path: string;
  content: string;
}

interface PRParams {
  title: string;
  body: string;
  branchName: string;
  files: FileChange[];
}

interface GitHubConfig {
  octokit: any;
  owner: string;
  repo: string;
}

function getGitHubConfig(): GitHubConfig | null {
  // Lazily cached — avoids import at module level
  return _cachedConfig;
}

let _cachedConfig: GitHubConfig | null = null;

export async function initGitHub(): Promise<GitHubConfig> {
  if (_cachedConfig) return _cachedConfig;

  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPO;
  if (!token || !repoFull) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPO required for PR creation");
  }

  const [owner, repo] = repoFull.split("/");
  // @ts-ignore — optional dependency
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token });

  _cachedConfig = { octokit, owner, repo };
  return _cachedConfig;
}

/**
 * Create a pull request via GitHub REST API (no local git needed).
 *
 * Flow:
 * 1. GET /git/ref/heads/main → base SHA
 * 2. POST /git/refs → create branch
 * 3. POST /git/blobs × N → create blob per file
 * 4. POST /git/trees → new tree with blobs
 * 5. POST /git/commits → commit on new tree
 * 6. PATCH /git/refs/heads/{branch} → point branch at commit
 * 7. POST /pulls → open PR
 */
export async function createPRViaAPI(params: PRParams): Promise<CreatedItem> {
  const gh = await initGitHub();
  const { octokit, owner, repo } = gh;

  // 1. Get base SHA from main
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: "heads/main",
  });
  const baseSha = refData.object.sha;

  // 2. Create branch
  try {
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${params.branchName}`,
      sha: baseSha,
    });
  } catch (err: any) {
    // Branch may already exist (retry scenario) — continue
    if (err.status !== 422) throw err;
  }

  // 3. Create blobs for each changed file
  const blobs = await Promise.all(
    params.files.map(async (file) => {
      const { data } = await octokit.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: "utf-8",
      });
      return { path: file.path, sha: data.sha };
    })
  );

  // 4. Create tree
  const { data: treeData } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseSha,
    tree: blobs.map((b) => ({
      path: b.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: b.sha,
    })),
  });

  // 5. Create commit
  const { data: commitData } = await octokit.git.createCommit({
    owner,
    repo,
    message: params.title,
    tree: treeData.sha,
    parents: [baseSha],
  });

  // 6. Update branch ref to point at new commit
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${params.branchName}`,
    sha: commitData.sha,
  });

  // 7. Create pull request
  const { data: prData } = await octokit.pulls.create({
    owner,
    repo,
    title: params.title,
    body: params.body,
    head: params.branchName,
    base: "main",
  });

  return {
    id: `#${prData.number}`,
    url: prData.html_url,
    title: params.title,
    provider: "github",
  };
}

/**
 * Get the flat file listing of a repo (for GPT to pick relevant files).
 */
export async function getRepoFileList(): Promise<string[]> {
  const gh = await initGitHub();
  const { octokit, owner, repo } = gh;

  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: "main",
    recursive: "1",
  });

  return data.tree
    .filter((entry: any) => entry.type === "blob")
    .map((entry: any) => entry.path as string);
}

/**
 * Fetch a single file's content from the repo.
 */
export async function fetchFileContent(path: string): Promise<string> {
  const gh = await initGitHub();
  const { octokit, owner, repo } = gh;

  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ref: "main",
  });

  if ("content" in data && data.encoding === "base64") {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }

  throw new Error(`Cannot read file ${path}: unexpected format`);
}
