import { useState, useEffect, useRef, useCallback } from 'react';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { useDebugger } from '@/hooks/use-debugger';
import { useConfigStore } from '@/store/config';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { isWeb } from '@/utils/platform';
import { cn } from '@/utils/styles';
import {
  PlayIcon,
  PauseIcon,
  SkipForwardIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CircleDotIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from 'lucide-react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { useLanguage } from '@/hooks/use-config';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';
import { useTheme } from '@/hooks/use-theme';

interface FileEntry {
  name: string;
  relativePath: string;
  isDir: boolean;
}

function FileTree({
  rootPath,
  selectedFile,
  breakpointFiles,
  onSelectFile,
}: {
  rootPath: string;
  selectedFile: string | null;
  breakpointFiles: Set<string>;
  onSelectFile: (relativePath: string) => void;
}) {
  const [tree, setTree] = useState<Map<string, FileEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));

  const loadDir = useCallback(
    async (relativePath: string) => {
      const absPath = relativePath === '' ? rootPath : `${rootPath}/${relativePath}`;
      try {
        const entries = await readDir(absPath);
        const fileEntries: FileEntry[] = entries
          .filter((e) => e.isDirectory || (e.isFile && e.name?.endsWith('.lua')))
          .sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return (a.name ?? '').localeCompare(b.name ?? '');
          })
          .map((e) => ({
            name: e.name ?? '',
            relativePath: relativePath === '' ? (e.name ?? '') : `${relativePath}/${e.name}`,
            isDir: e.isDirectory,
          }));
        setTree((prev) => new Map(prev).set(relativePath, fileEntries));
      } catch {
        // directory may be inaccessible
      }
    },
    [rootPath],
  );

  useEffect(() => {
    if (rootPath) {
      setTree(new Map());
      setExpanded(new Set(['']));
      loadDir('');
    }
  }, [rootPath, loadDir]);

  const toggleDir = (relativePath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
        if (!tree.has(relativePath)) loadDir(relativePath);
      }
      return next;
    });
  };

  const renderEntries = (entries: FileEntry[], depth: number): React.ReactNode => {
    return entries.map((entry) => {
      if (entry.isDir) {
        const isExpanded = expanded.has(entry.relativePath);
        const children = tree.get(entry.relativePath);
        return (
          <div key={entry.relativePath}>
            <button
              className="flex w-full items-center gap-1 py-0.5 text-left text-xs hover:bg-accent"
              style={{ paddingLeft: `${6 + depth * 12}px` }}
              onClick={() => toggleDir(entry.relativePath)}
            >
              {isExpanded ? (
                <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
              )}
              {isExpanded ? (
                <FolderOpenIcon className="size-3 shrink-0 text-yellow-500" />
              ) : (
                <FolderIcon className="size-3 shrink-0 text-yellow-500" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
            {isExpanded && children && renderEntries(children, depth + 1)}
          </div>
        );
      }

      const hasBp = breakpointFiles.has(entry.relativePath);
      const isSelected = selectedFile === entry.relativePath;
      return (
        <button
          key={entry.relativePath}
          className={cn(
            'flex w-full items-center gap-1 py-0.5 text-left text-xs hover:bg-accent',
            isSelected && 'bg-accent font-medium',
          )}
          style={{ paddingLeft: `${6 + depth * 12 + 14}px` }}
          onClick={() => onSelectFile(entry.relativePath)}
        >
          <FileIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{entry.name}</span>
          {hasBp && <CircleDotIcon className="ml-auto mr-1 size-2.5 shrink-0 text-red-500" />}
        </button>
      );
    });
  };

  const rootEntries = tree.get('') ?? [];
  if (rootEntries.length === 0) {
    return <div className="text-muted-foreground px-3 py-4 text-xs">{rootPath ? 'Loading…' : 'No game connected'}</div>;
  }

  return <div className="flex flex-col py-1">{renderEntries(rootEntries, 0)}</div>;
}

function SourceView({
  content,
  currentLine,
  breakpointLines,
  onToggleBreakpoint,
}: {
  content: string | null;
  currentLine: number | null;
  breakpointLines: Set<number>;
  onToggleBreakpoint: (line: number) => void;
}) {
  const currentLineRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const style = theme === 'dark' ? onDark : oneLight;
  const language = useLanguage();

  useEffect(() => {
    if (currentLine !== null) {
      currentLineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [currentLine]);

  if (!content) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
        Select a .lua file from the tree
      </div>
    );
  }

  const lines = content.split('\n');

  return (
    <ScrollArea className="h-0 flex-1">
      <div className="min-w-0 font-mono text-xs">
        {lines.map((line, i) => {
          const lineNum = i + 1;
          const isCurrent = lineNum === currentLine;
          const hasBp = breakpointLines.has(lineNum);
          return (
            <div
              key={lineNum}
              ref={isCurrent ? currentLineRef : undefined}
              className={cn(
                'group flex cursor-pointer items-start hover:bg-accent/50',
                isCurrent && 'bg-yellow-500/15 hover:bg-yellow-500/20',
              )}
              onClick={() => onToggleBreakpoint(lineNum)}
              title={hasBp ? 'Remove breakpoint' : 'Add breakpoint'}
            >
              {/* Breakpoint gutter */}
              <div className="flex w-6 shrink-0 items-center justify-center self-center">
                {hasBp ? (
                  <CircleDotIcon className="size-2.5 text-red-500" />
                ) : (
                  <div className="size-2 rounded-full opacity-0 group-hover:bg-red-400 group-hover:opacity-60" />
                )}
              </div>
              {/* Line number */}
              <span
                className={cn(
                  'w-9 shrink-0 select-none py-px pr-3 text-right',
                  isCurrent ? 'text-yellow-400' : 'text-muted-foreground/40',
                )}
              >
                {lineNum}
              </span>
              {/* Code */}
              <pre className={cn('flex-1 py-px pr-4 whitespace-pre', isCurrent && 'font-semibold')}>
                {isCurrent && <span className="mr-1 text-yellow-400">→</span>}

                <SyntaxHighlighter
                  wrapLines
                  language={language}
                  style={{
                    ...style,
                    // @ts-expect-error react-syntax-highlighter's types are incomplete
                    hljs: {
                      ...style.hljs,
                      background: 'transparent',
                      padding: 0,
                    },
                  }}
                  showLineNumbers={false}
                >
                  {line}
                </SyntaxHighlighter>
              </pre>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function VariablesPanel({ title, vars }: { title: string; vars: Record<string, string> }) {
  const entries = Object.entries(vars);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground px-2 text-xs font-semibold uppercase tracking-wider">{title}</span>
      {entries.map(([name, value]) => (
        <div key={name} className="flex items-start gap-2 px-2 py-0.5 font-mono text-xs">
          <span className="text-blue-400 shrink-0">{name}</span>
          <span className="text-muted-foreground">=</span>
          <span className="break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}

export default function DebuggerPage() {
  const dbg = useDebugger();
  const rootPath = useConfigStore((state) => state.config?.root_path ?? '');

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);

  // Auto-navigate to the paused file when a breakpoint is hit
  const pausedFile = dbg.currentPaused?.file;
  useEffect(() => {
    if (pausedFile) setSelectedFile(pausedFile);
  }, [pausedFile]);

  // Read file content whenever the selection or root changes
  useEffect(() => {
    if (!selectedFile || !rootPath || isWeb()) {
      setFileContent(null);
      return;
    }
    const absPath = `${rootPath.replace(/\/$/, '')}/${selectedFile}`;
    readTextFile(absPath)
      .then(setFileContent)
      .catch(() => setFileContent(null));
  }, [selectedFile, rootPath]);

  const breakpointFiles = new Set(dbg.breakpoints.map((b) => b.file));
  const breakpointLines = new Set(
    dbg.breakpoints.filter((b) => b.file === selectedFile && b.enabled).map((b) => b.line),
  );
  const currentLine = dbg.currentPaused?.file === selectedFile ? dbg.currentPaused.line : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Switch id="debugger-enabled" checked={dbg.isEnabled} onCheckedChange={dbg.toggleEnabled} />
          <Label htmlFor="debugger-enabled" className="text-sm">
            Debugger
          </Label>
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!dbg.isPaused}
            onClick={dbg.continue}
            title="Continue (F8)"
          >
            <PlayIcon className="size-3" /> Continue
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!dbg.isPaused}
            onClick={dbg.stepOver}
            title="Step Over (F10)"
          >
            <SkipForwardIcon className="size-3" /> Step Over
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!dbg.isPaused}
            onClick={dbg.stepInto}
            title="Step Into (F11)"
          >
            <ArrowDownIcon className="size-3" /> Step Into
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!dbg.isPaused}
            onClick={dbg.stepOut}
            title="Step Out (⇧F11)"
          >
            <ArrowUpIcon className="size-3" /> Step Out
          </Button>
        </div>

        {dbg.isPaused && dbg.currentPaused && (
          <>
            <Separator orientation="vertical" className="h-5" />
            <Badge variant="destructive" className="gap-1 font-mono text-xs">
              <PauseIcon className="size-3" />
              {dbg.currentPaused.file.split('/').pop()}:{dbg.currentPaused.line}
            </Badge>
          </>
        )}

        {dbg.breakpoints.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-5" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={dbg.clearBreakpoints}
              title="Clear all breakpoints"
            >
              <CircleDotIcon className="size-3" /> Clear breakpoints
            </Button>
          </>
        )}
      </div>

      {/* 3-column body */}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* Col 1 — File tree */}
        <ResizablePanel defaultSize={'20%'} minSize={'10%'} maxSize={'30%'} className="flex flex-col">
          <div className="border-b px-3 py-2">
            <span className="text-sm font-semibold">Files</span>
            {rootPath && (
              <div className="text-muted-foreground mt-0.5 truncate text-xs" title={rootPath}>
                {rootPath.split('/').pop()}
              </div>
            )}
          </div>
          <ScrollArea className="h-0 flex-1">
            {!isWeb() && rootPath ? (
              <FileTree
                rootPath={rootPath}
                selectedFile={selectedFile}
                breakpointFiles={breakpointFiles}
                onSelectFile={setSelectedFile}
              />
            ) : (
              <div className="text-muted-foreground px-3 py-3 text-xs">
                {isWeb() ? 'Requires desktop app' : 'No game connected'}
              </div>
            )}
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Col 2 — Source view */}
        <ResizablePanel defaultSize={'55%'} minSize={'30%'} className="flex min-w-0 flex-col">
          {selectedFile ? (
            <>
              <div className="flex items-center gap-2 border-b px-3 py-1.5">
                <span className="font-mono text-xs">{selectedFile}</span>
                {currentLine !== null && (
                  <Badge variant="outline" className="ml-auto font-mono text-xs">
                    :{currentLine}
                  </Badge>
                )}
              </div>
              <SourceView
                content={fileContent}
                currentLine={currentLine}
                breakpointLines={breakpointLines}
                onToggleBreakpoint={(line) => {
                  if (breakpointLines.has(line)) {
                    dbg.removeBreakpoint(selectedFile, line);
                  } else {
                    dbg.addBreakpoint(selectedFile, line);
                  }
                }}
              />
            </>
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
              Select a file from the tree
            </div>
          )}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Col 3 — Call stack + variables */}
        <ResizablePanel defaultSize={'25%'} minSize={'15%'} maxSize={'40%'} className="flex flex-col">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={40} minSize={20} className="flex flex-col">
              <div className="border-b px-3 py-2">
                <span className="text-sm font-semibold">Call Stack</span>
              </div>
              <ScrollArea className="h-0 flex-1">
                {dbg.currentPaused ? (
                  <div className="flex flex-col py-1">
                    {dbg.currentPaused.stack.map((frame, i) => (
                      <button
                        key={i}
                        className={cn(
                          'flex items-start gap-2 px-3 py-1 text-left font-mono text-xs hover:bg-accent',
                          i === 0 && 'bg-accent',
                        )}
                        onClick={() => setSelectedFile(frame.file)}
                      >
                        <span className="text-muted-foreground w-3 shrink-0 text-right">{i}</span>
                        <div className="flex min-w-0 flex-col">
                          <span className={cn('truncate', i === 0 && 'font-semibold')}>{frame.name}</span>
                          <span className="text-muted-foreground truncate">
                            {frame.file.split('/').pop()}:{frame.line}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground px-3 py-4 text-xs">
                    {dbg.isEnabled ? 'Running…' : 'Debugger disabled'}
                  </div>
                )}
              </ScrollArea>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={'60%'} minSize={'20%'} className="flex flex-col">
              <div className="border-b px-3 py-2">
                <span className="text-sm font-semibold">Variables</span>
              </div>
              <ScrollArea className="h-0 flex-1">
                {dbg.currentPaused ? (
                  <div className="flex flex-col gap-3 py-2">
                    <VariablesPanel title="Locals" vars={dbg.currentPaused.locals} />
                    <VariablesPanel title="Upvalues" vars={dbg.currentPaused.upvalues} />
                  </div>
                ) : (
                  <div className="text-muted-foreground px-3 py-3 text-xs">No active frame</div>
                )}
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
