/**
 * Which of these asset paths are not on disk.
 *
 * Its own module so the batching can be tested without a filesystem, because
 * the bug it replaces was invisible until you had a big enough project.
 *
 * The previous version checked `paths.slice(0, 250)` and reported the result as
 * though it were complete. Assets drives a **Missing** filter, so on any project
 * with more than 250 assets that filter quietly under-reported: an asset at
 * position 400 could be absent from disk and the panel would say nothing was
 * wrong. A tool that answers "is anything missing?" with a confident, incomplete
 * "no" is the L1 failure the lens calls non-negotiable — worse than not offering
 * the answer at all.
 *
 * So every path is checked. The cap existed for a real reason, though: firing
 * one `stat` per asset at once on a large project exhausts file handles, so the
 * work runs in bounded batches instead of being unbounded or truncated.
 *
 * See V4.md §6.3 (6.6).
 */

/** Enough to keep the filesystem busy, small enough not to exhaust handles. */
const BATCH_SIZE = 64;

export type StatFn = (path: string) => Promise<unknown>;

export async function findMissingPaths(
  paths: string[],
  stat: StatFn,
  options: { batchSize?: number; isCancelled?: () => boolean } = {},
): Promise<Set<string>> {
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const isCancelled = options.isCancelled ?? (() => false);
  const missing = new Set<string>();

  for (let index = 0; index < paths.length; index += batchSize) {
    // Checked between batches rather than only at the end: on a large project
    // this outlives the panel that started it, and a user who navigated away
    // should not keep the filesystem busy.
    if (isCancelled()) return missing;

    const batch = paths.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map(async (path) => {
        try {
          await stat(path);
          return null;
        } catch {
          return path;
        }
      }),
    );

    for (const path of results) {
      if (path) missing.add(path);
    }
  }

  return missing;
}
