import * as React from 'react';
import { CheckIcon, CopyIcon, SearchIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copyToClipboardWithMeta } from '@/utils/strings';
import { cn } from '@/utils/styles';

export type TriageTone = 'default' | 'good' | 'warning' | 'danger' | 'muted';

export type TriageFilterOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  title?: string;
  disabled?: boolean;
};

export type TriageSummaryItem = {
  id: string;
  label: React.ReactNode;
  value?: React.ReactNode;
  tone?: TriageTone;
  title?: string;
};

function toneClass(tone: TriageTone = 'default') {
  if (tone === 'good') return 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300';
  if (tone === 'warning') return 'border-amber-500/40 text-amber-700 dark:text-amber-300';
  if (tone === 'danger') return 'border-destructive/40 text-destructive';
  if (tone === 'muted') return 'border-muted-foreground/25 text-muted-foreground';
  return 'border-border text-foreground';
}

export function TriageToolbar({
  search,
  filters,
  summary,
  actions,
  className,
}: {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 border-b px-4 py-2', className)}>
      {search ? <div className="min-w-52 flex-1 sm:max-w-xl">{search}</div> : null}
      {filters ? <div className="flex min-w-0 flex-wrap items-center gap-1.5">{filters}</div> : null}
      {summary ? <div className="flex min-w-0 flex-wrap items-center gap-2">{summary}</div> : null}
      {actions ? <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}

export function TriageSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 pl-8 pr-8 text-xs" />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
          title="Clear search"
          onClick={() => onChange('')}
        >
          <XIcon className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function TriageFilterBar<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<TriageFilterOption<T>>;
  onChange: (value: T) => void;
}) {
  return (
    <>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? 'secondary' : 'outline'}
          className="h-7 px-2 text-xs"
          title={option.title}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </>
  );
}

export function TriageSummaryChip({ label, value, tone = 'default', title }: Omit<TriageSummaryItem, 'id'>) {
  return (
    <Badge variant="outline" className={cn('h-6 gap-1.5 px-2 font-mono text-xs', toneClass(tone))} title={title}>
      <span className="font-sans font-medium">
        {label}
        {value !== undefined ? <> {value}</> : null}
      </span>
    </Badge>
  );
}

export function TriageSummaryChips({ items }: { items: TriageSummaryItem[] }) {
  return (
    <>
      {items.map((item) => (
        <TriageSummaryChip key={item.id} label={item.label} value={item.value} tone={item.tone} title={item.title} />
      ))}
    </>
  );
}

export function TriageEmptyState({
  title,
  description,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-52 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground', className)}>
      <div className="grid justify-items-center gap-2">
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
        <p className="font-medium text-foreground">{title}</p>
        {description ? <p className="max-w-md text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

export function TriageCopyButton({
  value,
  label = 'value',
  title,
  disabled,
  children,
  className,
}: {
  value?: string | null;
  label?: string;
  title?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const canCopy = !disabled && !!value;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn('size-7', className)}
          disabled={!canCopy}
          title={title ?? `Copy ${label}`}
          onClick={() => {
            if (!value) return;
            copyToClipboardWithMeta(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
        >
          {children ?? (copied ? <CheckIcon className="size-3.5 text-emerald-600" /> : <CopyIcon className="size-3.5" />)}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? `Copied ${label}` : title ?? `Copy ${label}`}</TooltipContent>
    </Tooltip>
  );
}

export function TriageDetailsPanel({
  title,
  subtitle,
  badges,
  actions,
  onClose,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn('flex w-[min(640px,45vw)] min-w-[420px] flex-col rounded-none rounded-br-xl border-l bg-card', className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 truncate font-mono text-base font-semibold">{title}</div>
            {badges}
          </div>
          {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <Button onClick={onClose} variant="secondary" size="sm">
            Dismiss
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">{children}</div>
      </ScrollArea>
    </aside>
  );
}
