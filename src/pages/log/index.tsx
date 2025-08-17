import { ColumnDef } from '@tanstack/react-table';
import { BadgeType, DataTable } from '@/components/data-table';
import { PageLayout } from '@/components/page-layout';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, CopyButton } from '@/components/ui/button';
import { useConfig } from '@/hooks/use-config';
import { Log, useLogs } from '@/hooks/use-logs';
import { LuaBlock, TraceViewer } from '@/components/code';
import { isWeb } from '@/lib/utils';
import { Command } from '@tauri-apps/plugin-shell';
import { useSettingsStore } from '@/store/settings';

export const columns: ColumnDef<Log>[] = [
  {
    accessorKey: 'count',
    header: 'Count',
  },
  {
    accessorKey: 'type',
    header: 'Type',
  },
  {
    accessorKey: 'str',
    header: () => 'Log',
    cell: (info) => info.getValue() as string,
    size: 250,
    maxSize: 250,
  },
  {
    accessorKey: 'time',
    header: 'Timestamp',
  },
];

export function TraceBlock({ code, basePath }: { code: string; basePath: string }) {
  const textEditorPath = useSettingsStore((state) => state.textEditorPath);
  return (
    <ScrollArea className="mt-2 h-52 rounded border bg-muted p-2 font-mono text-xs">
      <TraceViewer
        trace={code}
        onFileClick={async (file, line) => {
          try {
            if (isWeb()) {
              open(`vscode://file/${basePath}/${file}:${line}`);
              return;
            }

            // TODO: add support for other OS (Windows)
            // TODO: add support for other editors
            // TODO: Test on Linux
            await Command.create('code', ['-c', `${textEditorPath} --goto ${basePath}/${file}:${line}`]).execute();
          } catch (e) {
            console.log(e);
          }
        }}
      />
    </ScrollArea>
  );
}

export function LogSidePanel({
  data,
  basePath,
  onClose,
}: {
  onClose: (o: boolean) => void;
  basePath: string;
  data: Log;
}) {
  const trace = data.type === 'error' ? data.str : data.trace;
  const isFeatherEvent = data.type === 'feather:finish' || data.type === 'feather:start';

  return (
    <Card className="w-[420px] rounded-none rounded-br-xl">
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>Log Details</CardTitle>
          <CardDescription>ID: {data.id}</CardDescription>
        </div>
        <div>
          <Button onClick={() => onClose(false)} variant="secondary">
            Dismiss
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Type</span>
          <BadgeType type={data.type} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Count</span>
          <span>{data.count}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Time</span>
          <span>{new Date(data.time * 1000).toLocaleString()}</span>
        </div>

        {data.type === 'output' ? (
          <>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Log</span>

                <CopyButton value={data.str} />
              </div>
              <LuaBlock code={data.str} />
            </div>

            <Separator />
          </>
        ) : null}

        {!isFeatherEvent ? (
          <div>
            <span className="text-sm font-medium">Trace</span>
            <TraceBlock basePath={basePath} code={trace} />
          </div>
        ) : null}
      </CardContent>
      {!isFeatherEvent ? (
        <CardFooter className="justify-end">
          <CopyButton value={trace} />
        </CardFooter>
      ) : null}
    </Card>
  );
}

export default function Page() {
  const { data } = useConfig();
  const { data: logs } = useLogs();

  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const onClose = () => {
    setSelectedLog(null);
  };

  return (
    <PageLayout
      right={selectedLog && <LogSidePanel basePath={data?.root_path || ''} data={selectedLog} onClose={onClose} />}
    >
      <DataTable
        showSearch
        onRowSelection={(id) => {
          setSelectedLog(logs.find((item) => item.id === id) || null);
        }}
        data={logs}
      />
    </PageLayout>
  );
}
