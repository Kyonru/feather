import { GH_HEADERS } from '../lib/github.js';

export const REPO_TOTAL = 7;
export const URL_TOTAL = 4;

export async function fetchRepoMeta(repo: string): Promise<{ values: string[]; labels: string[] }> {
  const [tagsRes, repoRes, branchesRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}/tags?per_page=20`, { headers: GH_HEADERS }),
    fetch(`https://api.github.com/repos/${repo}`, { headers: GH_HEADERS }),
    fetch(`https://api.github.com/repos/${repo}/branches?per_page=30`, { headers: GH_HEADERS }),
  ]);
  if (!tagsRes.ok) throw new Error(`GitHub API ${tagsRes.status} fetching tags for ${repo}`);
  if (!repoRes.ok) throw new Error(`GitHub API ${repoRes.status} fetching repo info for ${repo}`);
  if (!branchesRes.ok) throw new Error(`GitHub API ${branchesRes.status} fetching branches for ${repo}`);
  const [tagsData, repoData, branchesData] = await Promise.all([
    tagsRes.json() as Promise<Array<{ name: string }>>,
    repoRes.json() as Promise<{ default_branch?: string }>,
    branchesRes.json() as Promise<Array<{ name: string }>>,
  ]);
  const tags = tagsData.map((tag) => tag.name);
  const defaultBranch = repoData.default_branch ?? 'main';
  const branches = branchesData.map((branch) => branch.name);
  const orderedBranches = [defaultBranch, ...branches.filter((branch) => branch !== defaultBranch)];
  const values = [...tags, ...orderedBranches];
  const labels = [...tags, ...orderedBranches.map((branch) => `⎇  ${branch}`)];
  return { values, labels };
}
