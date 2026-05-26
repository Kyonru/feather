import { ColumnDef } from '@tanstack/react-table';
import { readFile } from '@tauri-apps/plugin-fs';
import { BadgeType, DataTable } from '@/components/data-table';
import { PageLayout } from '@/components/page-layout';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, CopyButton } from '@/components/ui/button';
import { useConfig } from '@/hooks/use-config';
import { Log, LogType, useLogs } from '@/hooks/use-logs';
import { LuaBlock, TraceViewer } from '@/components/code';
import { isWeb } from '@/utils/platform';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/store/settings';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { useQueryClient } from '@tanstack/react-query';
import { sessionQueryKey } from '@/hooks/use-ws-connection';
import { toast } from 'sonner';

export const columns: ColumnDef<Log>[] = [
  {
    accessorKey: 'type',
    header: 'Type',
  },
  {
    accessorKey: 'str',
    header: () => 'Log',
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="flex items-center gap-2">
          <span className="truncate">{row.str}</span>
          {row.count > 1 && (
            <span className="shrink-0 rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {row.count}
            </span>
          )}
        </div>
      );
    },
    size: 250,
    maxSize: 250,
  },
  {
    accessorKey: 'time',
    header: 'Timestamp',
  },
];

function stripPrefix(trace: string, dir: string): string {
  const prefix = dir.replace(/[/\\]+$/, '') + '/';
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const result = trace.replace(new RegExp(escaped, 'g'), '');
  if (result !== trace) return result;
  // Handle macOS /Users ↔ /private/Users symlink mismatch
  const alt = prefix.startsWith('/private/') ? prefix.slice('/private'.length) : '/private' + prefix;
  return trace.replace(new RegExp(alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
}

function stripBasePath(trace: string, sourceDir: string, rootPath: string): string {
  if (sourceDir) {
    const r = stripPrefix(trace, sourceDir);
    if (r !== trace) return r;
  }
  if (rootPath && rootPath !== sourceDir) {
    const r = stripPrefix(trace, rootPath);
    if (r !== trace) return r;
  }
  return trace;
}

export function TraceBlock({ code, basePath, sourceDir }: { code: string; basePath: string; sourceDir?: string }) {
  const textEditorPath = useSettingsStore((state) => state.textEditorPath);
  const stripped = stripBasePath(code, sourceDir ?? '', basePath);

  return (
    <ScrollArea className="mt-2 h-52 rounded border bg-muted p-2 font-mono text-xs">
      <TraceViewer
        trace={stripped}
        onFileClick={async (file, line) => {
          try {
            if (isWeb()) {
              open(`vscode://file/${basePath}/${file}:${line}`);
              return;
            }

            const roots = [basePath, sourceDir].filter(Boolean) as string[];
            let lastError: string | null = null;
            for (const root of roots) {
              try {
                await invoke('open_source_location', {
                  editorPath: textEditorPath,
                  projectRoot: root,
                  relativeFile: file,
                  line,
                });
                return;
              } catch (e) {
                lastError = e instanceof Error ? e.message : String(e);
              }
            }
            if (lastError) toast.error(lastError, { position: 'bottom-center' });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e), { position: 'bottom-center' });
          }
        }}
      />
    </ScrollArea>
  );
}

export function LogImage({ src }: { src?: string }) {
  const [screenshot, setScreenshot] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;

    // Data URI from WS (base64-encoded PNG) — use directly
    if (src.startsWith('data:')) {
      setScreenshot(src);
      return;
    }

    // Legacy: file path — read from disk via Tauri FS
    const readImage = async () => {
      try {
        const uint8 = await readFile(src);
        const blob = new Blob([uint8], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        setScreenshot(url);
      } catch {
        // File not available (remote device, etc.)
      }
    };

    readImage();
  }, [src]);

  if (!screenshot) {
    return null;
  }

  return (
    <CardFooter className="flex-col items-start gap-1.5 text-sm">
      <span className="text-sm font-medium">Screenshot</span>

      <Dialog>
        <DialogTrigger>
          <img src={screenshot} className="h-full w-full" />
        </DialogTrigger>
        <DialogContent className="h-[90vh] w-full sm:max-w-1/2">
          <DialogHeader>
            <DialogTitle>Screenshot</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center sm:px-12 p-8 h-[90vh]">
            <img src={screenshot} className="object-scale-down max-h-full drop-shadow-md rounded-md m-auto" />
          </div>
        </DialogContent>
      </Dialog>
    </CardFooter>
  );
}

export function LogSidePanel({
  data,
  basePath,
  sourceDir,
  onClose,
}: {
  onClose: (o: boolean) => void;
  basePath: string;
  sourceDir?: string;
  data: Log;
}) {
  const trace = data.type === 'error' ? data.str : data.trace;
  const screenshot = data.screenshot;
  const isFeatherEvent = data.type === LogType.FEATHER_FINISH || data.type === LogType.FEATHER_START;

  return (
    <Card className="w-[420px] shrink-0 overflow-y-auto rounded-none">
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
          <span className="text-sm font-medium">Time</span>
          <span>{new Date(data.time * 1000).toLocaleString()}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Count</span>
          <span className="tabular-nums">{data.count}</span>
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

        {!isFeatherEvent && trace ? (
          <div>
            <span className="text-sm font-medium">Trace</span>
            <TraceBlock basePath={basePath} sourceDir={sourceDir} code={trace} />
          </div>
        ) : null}
      </CardContent>
      {!isFeatherEvent && trace ? (
        <CardFooter className="justify-end">
          <CopyButton value={stripBasePath(trace, sourceDir ?? '', basePath)} />
        </CardFooter>
      ) : null}
      {screenshot ? <LogImage src={screenshot} /> : null}
    </Card>
  );
}

export default function Page() {
  const { data } = useConfig();
  const { data: logsData, clear, onScreenshotChange } = useLogs();
  const pausedLogs = useSettingsStore((state) => state.pausedLogs);
  const setPausedLogs = useSettingsStore((state) => state.setPausedLogs);
  const setFilePath = useConfigStore((state) => state.setLogOverride);
  const addSession = useSessionStore((state) => state.addSession);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const queryClient = useQueryClient();

  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const onClose = () => {
    setSelectedLogId(null);
  };

  const onClear = () => {
    clear();
  };

  const logs = logsData.logs;
  const screenshotEnabled = logsData.screenshotEnabled;
  const selectedLog = useMemo(
    () => logs.find((item) => item.id === selectedLogId) ?? null,
    [logs, selectedLogId],
  );
  const selectLog = useCallback(
    (id: string) => {
      setSelectedLogId(id || null);
    },
    [],
  );

  return (
    <PageLayout
      right={
        selectedLog && (
          <LogSidePanel
            basePath={data?.root_path || ''}
            sourceDir={data?.sourceDir}
            data={selectedLog}
            onClose={onClose}
          />
        )
      }
    >
      <DataTable
        screenshotEnabled={screenshotEnabled}
        onScreenshotChange={onScreenshotChange}
        isPaused={pausedLogs}
        onPlayPause={() => {
          if (pausedLogs) {
            setFilePath(undefined);
          }

          setPausedLogs(!pausedLogs);
        }}
        onClear={onClear}
        showSearch
        onRowSelection={selectLog}
        data={logs}
        onUpload={(filename) => {
          if (filename) {
            // Create a file-based session using the filename
            const name = filename.split('/').pop()?.replace('.featherlog', '') || filename;
            const fileSessionId = `file:${filename}`;

            addSession({
              id: fileSessionId,
              name: `📄 ${name}`,
              kind: 'log-file',
              filePath: filename,
              connected: false,
              connectedAt: Date.now(),
            });

            setActiveSession(fileSessionId);
            setFilePath(filename);

            // Seed empty logs cache so useLogs live path has a key to subscribe to
            queryClient.setQueryData(sessionQueryKey.logs(fileSessionId), []);
          }
        }}
      />
    </PageLayout>
  );
}
