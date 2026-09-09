import { CircleAlertIcon, RotateCwIcon } from 'lucide-react';

import { cn } from '@/utils/styles';
import { useFreshness } from '@/hooks/use-freshness';

/**
 * Says when a panel's data arrived, and says loudly when it is from a previous
 * run of the game.
 *
 * The quiet case is deliberately quiet: muted, small, no icon. Most of the time
 * the answer is "seconds ago" and the reader should be able to skip it. The
 * stale case is not quiet, because it is the one that sends someone chasing a
 * bug in data that predates their fix.
 *
 * See V4-ENHANCED.md §5 (C2).
 */
export function Freshness({
  queryKey,
  onRefresh,
  className,
  label = 'Updated',
}: {
  queryKey: readonly unknown[];
  /** Offered only when the data is stale — a refresh you never needed is noise. */
  onRefresh?: () => void;
  className?: string;
  label?: string;
}) {
  const freshness = useFreshness(queryKey);

  if (freshness.never) {
    return <span className={cn('text-xs text-muted-foreground', className)}>Not loaded yet</span>;
  }

  if (freshness.fromPreviousRun) {
    return (
      <span
        data-testid="freshness-stale"
        className={cn('inline-flex items-center gap-1.5 text-xs text-warn', className)}
      >
        <CircleAlertIcon className="size-3.5 shrink-0" />
        <span>From a previous run</span>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded px-1 underline underline-offset-2 hover:no-underline"
          >
            <RotateCwIcon className="size-3" />
            Refresh
          </button>
        )}
      </span>
    );
  }

  return (
    <span data-testid="freshness" className={cn('text-xs text-muted-foreground tabular-nums', className)}>
      {label} {freshness.label}
    </span>
  );
}
