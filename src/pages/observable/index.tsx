import { useState } from 'react';
import { PageLayout } from '@/components/page-layout';
import { SectionCards } from './section-cards';
import { useObservability, ObserverEntry } from '@/hooks/use-observability';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, CopyButton } from '@/components/ui/button';
import { LuaBlock } from '@/components/code';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useConfig } from '@/hooks/use-config';
import { lineDiff, hasDiff } from '@/utils/diff';
import { cn } from '@/utils/styles';

function DiffView({ oldValue, newValue }: { oldValue: string; newValue: string }) {
  const lines = lineDiff(oldValue, newValue);
  return (
    <div className="rounded-md bg-muted font-mono text-xs leading-5 overflow-auto p-3">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn('px-1 whitespace-pre', {
            'bg-green-500/20 text-green-400': line.kind === 'added',
            'bg-red-500/20 text-red-400 line-through': line.kind === 'removed',
            'text-muted-foreground': line.kind === 'same',
          })}
        >
          {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  '}
          {line.text}
        </div>
      ))}
    </div>
  );
}

function HistoryEntry({ value, index, total }: { value: string; index: number; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const isLatest = index === total - 1;
  const preview = value.split('\n')[0];

  return (
    <div className="text-xs border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="font-mono truncate text-muted-foreground">{preview}</span>
        <span className="text-muted-foreground ml-2 shrink-0">
          {isLatest ? 'previous' : `${total - index} ago`}
        </span>
      </button>
      {expanded && (
        <div className="border-t">
          <LuaBlock code={value} showLineNumbers={false} className="text-xs" />
        </div>
      )}
    </div>
  );
}

export function ObserveSidePanel({
  data,
  onClose,
}: {
  onClose: (o: boolean) => void;
  data: ObserverEntry;
}) {
  const diffLines = data.previous !== undefined ? lineDiff(data.previous, data.value) : [];
  const showDiff = hasDiff(diffLines);
  const defaultTab = showDiff ? 'diff' : 'current';

  return (
    <Card className="w-[600px] rounded-none rounded-br-xl flex flex-col">
      <CardHeader className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <CardTitle>{data.key}</CardTitle>
          {data.changed && (
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" title="Value changed" />
          )}
        </div>
        <Button onClick={() => onClose(false)} variant="secondary">
          Dismiss
        </Button>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <Tabs defaultValue={defaultTab} className="h-full flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="current">Current</TabsTrigger>
            <TabsTrigger value="diff" disabled={!showDiff}>
              Diff {showDiff && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-yellow-400 inline-block" />}
            </TabsTrigger>
            <TabsTrigger value="history" disabled={data.history.length === 0}>
              History {data.history.length > 0 && <span className="ml-1 text-muted-foreground">({data.history.length})</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="flex-1 overflow-auto space-y-4 mt-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Value</span>
                <CopyButton value={data.value} />
              </div>
              <LuaBlock className="max-h-[100%]" code={data.value} showLineNumbers={false} />
            </div>
            <Separator />
            <div>
              <span className="text-sm font-medium">Type</span>
              <LuaBlock className="mt-1" code={data.type} showLineNumbers={false} />
            </div>
          </TabsContent>

          <TabsContent value="diff" className="flex-1 overflow-auto mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Changes from previous value</span>
            </div>
            <DiffView oldValue={data.previous ?? ''} newValue={data.value} />
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-full">
              <div className="space-y-2 pr-3">
                {[...data.history].reverse().map((v, i) => (
                  <HistoryEntry key={i} value={v} index={data.history.length - 1 - i} total={data.history.length} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function Page() {
  const [search, setSearch] = useState('');
  const { data } = useObservability(search);
  const [selected, setSelected] = useState<string | null>(null);

  const onSelect = (key: string) => setSelected(key);
  const onClose = () => setSelected(null);

  useConfig();

  const selectedEntry = data.find((item) => item.key === selected);

  if (data.length === 0 && !search) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-16 text-center">
          <div className="grid gap-1">
            <p className="text-lg font-semibold">No observers yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Call <code className="font-mono">DEBUGGER:observe()</code> anywhere in your game loop to watch values in
              real time.
            </p>
          </div>
          <LuaBlock
            className="w-full max-w-lg text-left"
            showLineNumbers={false}
            code={`-- Call this each frame (or whenever the value changes)
function love.update(dt)
  DEBUGGER:observe("player.x", player.x)
  DEBUGGER:observe("player.y", player.y)
  DEBUGGER:observe("health", player.health)
  DEBUGGER:observe("state", player.state)
end`}
          />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout right={selected && selectedEntry && <ObserveSidePanel data={selectedEntry} onClose={onClose} />}>
      <div className="px-4 lg:px-6 pb-4">
        <Input
          placeholder="Search observers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No observers match &ldquo;{search}&rdquo;
        </div>
      ) : (
        <SectionCards data={data} selected={selected} onSelect={onSelect} />
      )}
    </PageLayout>
  );
}
