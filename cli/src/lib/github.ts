export const GH_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

export async function fetchCommitSha(repo: string, ref: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, {
    headers: GH_HEADERS,
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} resolving ${repo}@${ref} to commit SHA`);
  return ((await res.json()) as { sha: string }).sha;
}

export async function fetchLuaFiles(repo: string, ref: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`, {
    headers: GH_HEADERS,
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} fetching file tree for ${repo}@${ref}`);
  const data = (await res.json()) as { tree: Array<{ path: string; type: string }> };
  return data.tree
    .filter((n) => n.type === 'blob' && n.path.endsWith('.lua'))
    .map((n) => n.path)
    .sort();
}

export async function fetchLatestReleaseTag(repo: string): Promise<string> {
  if (process.env.FEATHER_TEST_GITHUB_LATEST_RELEASE_TAG) {
    return process.env.FEATHER_TEST_GITHUB_LATEST_RELEASE_TAG;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: GH_HEADERS,
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} fetching latest release for ${repo}`);
  const data = (await res.json()) as { tag_name?: unknown };
  if (typeof data.tag_name !== 'string' || !data.tag_name.trim()) {
    throw new Error(`GitHub latest release for ${repo} did not include a tag_name`);
  }
  return data.tag_name.trim();
}
