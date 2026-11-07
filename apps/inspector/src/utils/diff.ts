export type DiffLine = { kind: 'added' | 'removed' | 'same'; text: string };

function buildLcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp;
}

export function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.split('\n');
  const b = newStr.split('\n');
  const dp = buildLcs(a, b);
  const path: DiffLine[] = [];

  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      path.push({ kind: 'same', text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      path.push({ kind: 'added', text: b[j - 1] });
      j--;
    } else {
      path.push({ kind: 'removed', text: a[i - 1] });
      i--;
    }
  }

  return path.reverse();
}

export function hasDiff(lines: DiffLine[]): boolean {
  return lines.some((l) => l.kind !== 'same');
}
