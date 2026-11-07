function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) => {
    const [main, pre] = v.split('-');
    const [major, minor, patch] = main.split('.').map(Number);
    return { major, minor, patch, pre };
  };

  const a = parse(v1);
  const b = parse(v2);

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  if (!a.pre && b.pre) return 1;
  if (a.pre && !b.pre) return -1;
  if (a.pre && b.pre) {
    if (a.pre === b.pre) return 0;
    return a.pre > b.pre ? 1 : -1;
  }

  return 0;
}

export function isGreaterOrEqual(v1: string, v2: string): boolean {
  return compareSemver(v1, v2) >= 0;
}
