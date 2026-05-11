import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog';
import { useDebugger } from '@/hooks/use-debugger';
import { pathToLuaModule, useHotReload } from '@/hooks/use-hot-reload';
import { usePluginControl } from '@/hooks/use-plugin-control';
import { useTimeTravel } from '@/hooks/use-time-travel';
import { useConfigStore } from '@/store/config';
import { useDebuggerStore } from '@/store/debugger';
import { useSessionStore } from '@/store/session';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LuaCodeInput } from '@/components/ui/lua-code-input';
import { isWeb } from '@/utils/platform';
import { cn } from '@/utils/styles';
import {
  PlayIcon,
  PauseIcon,
  SkipForwardIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CircleDotIcon,
  ClockIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  CopyIcon,
  CheckIcon,
  SearchIcon,
  XIcon,
  ChevronUpIcon,
  RefreshCwIcon,
  RotateCcwIcon,
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

function scrollViewportToTarget(viewport: HTMLElement, target: HTMLElement) {
  const targetRect = target.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const newTop =
    viewport.scrollTop + (targetRect.top - viewportRect.top) - viewport.clientHeight / 2 + targetRect.height / 2;
  viewport.scrollTo({ top: Math.max(0, newTop), behavior: 'smooth' });
}

function SourceView({
  content,
  currentLine,
  scrollToLine,
  breakpointLines,
  conditionalLines,
  onToggleBreakpoint,
  onRightClickBreakpoint,
}: {
  content: string | null;
  currentLine: number | null;
  scrollToLine: number | null;
  breakpointLines: Set<number>;
  conditionalLines: Set<number>;
  onToggleBreakpoint: (line: number) => void;
  onRightClickBreakpoint: (line: number, e: React.MouseEvent) => void;
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const matchTargetRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const theme = useTheme();
  const style = theme === 'dark' ? onDark : oneLight;
  const language = useLanguage();

  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);

  const activeScrollLine = scrollToLine ?? currentLine;

  const matchLines = useMemo(() => {
    if (!search.trim() || !content) return [];
    const q = search.toLowerCase();
    return content.split('\n').reduce<number[]>((acc, line, i) => {
      if (line.toLowerCase().includes(q)) acc.push(i + 1);
      return acc;
    }, []);
  }, [search, content]);

  const safeIndex =
    matchLines.length > 0 ? ((matchIndex % matchLines.length) + matchLines.length) % matchLines.length : 0;
  const currentMatchLine = matchLines[safeIndex] ?? null;

  // Cmd/Ctrl+F → open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 0);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearch('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  // Scroll to active line (breakpoint hit / callstack click)
  useEffect(() => {
    if (activeScrollLine === null || !scrollTargetRef.current) return;
    const viewport = scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (viewport) {
      scrollViewportToTarget(viewport, scrollTargetRef.current);
    } else {
      scrollTargetRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    // Re-run when content loads (async file read) so the ref is populated.
  }, [activeScrollLine, content]);

  // Scroll to current search match
  useEffect(() => {
    if (currentMatchLine === null || !matchTargetRef.current) return;
    const viewport = scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (viewport) {
      scrollViewportToTarget(viewport, matchTargetRef.current);
    } else {
      matchTargetRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [currentMatchLine, safeIndex]);

  if (!content) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
        Select a .lua file from the tree
      </div>
    );
  }

  const lines = content.split('\n');
  const goNext = () => setMatchIndex((i) => i + 1);
  const goPrev = () => setMatchIndex((i) => i - 1);

  return (
    <div ref={scrollAreaRef} className="relative h-0 flex-1">
      {/* Floating search bar (Cmd+F) */}
      {searchOpen && (
        <div className="absolute right-3 top-2 z-10 flex items-center gap-1 rounded-md border bg-background px-2 py-1 shadow-lg">
          <SearchIcon className="size-3 shrink-0 text-muted-foreground" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setMatchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                  goPrev();
                } else {
                  goNext();
                }
              }
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setSearch('');
              }
            }}
            placeholder="Find in file…"
            className="h-5 w-40 bg-transparent text-xs focus:outline-none"
          />
          {search.trim() && (
            <span
              className={cn(
                'shrink-0 font-mono text-xs tabular-nums',
                matchLines.length === 0 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {matchLines.length === 0 ? 'No results' : `${safeIndex + 1}/${matchLines.length}`}
            </span>
          )}
          <button
            onClick={goPrev}
            disabled={matchLines.length === 0}
            className="flex size-5 items-center justify-center rounded hover:bg-accent disabled:opacity-30"
            title="Previous (Shift+Enter)"
          >
            <ChevronUpIcon className="size-3" />
          </button>
          <button
            onClick={goNext}
            disabled={matchLines.length === 0}
            className="flex size-5 items-center justify-center rounded hover:bg-accent disabled:opacity-30"
            title="Next (Enter)"
          >
            <ChevronDownIcon className="size-3" />
          </button>
          <button
            onClick={() => {
              setSearchOpen(false);
              setSearch('');
            }}
            className="flex size-5 items-center justify-center rounded hover:bg-accent"
            title="Close (Escape)"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      )}

      <ScrollArea className="size-full">
        <div className="min-w-0 font-mono text-xs">
          {lines.map((line, i) => {
            const lineNum = i + 1;
            const isCurrent = lineNum === currentLine;
            const isScrollTarget = lineNum === scrollToLine && !isCurrent;
            const isMatch = searchOpen && search.trim() !== '' && matchLines.includes(lineNum);
            const isCurrentMatch = isMatch && lineNum === currentMatchLine;
            const hasBp = breakpointLines.has(lineNum);

            let lineRef: React.Ref<HTMLDivElement> | undefined;
            if (lineNum === activeScrollLine) lineRef = scrollTargetRef;
            else if (isCurrentMatch) lineRef = matchTargetRef;

            return (
              <div
                key={lineNum}
                ref={lineRef}
                className={cn(
                  'group flex cursor-pointer items-start hover:bg-accent/50',
                  isCurrent && 'bg-yellow-500/15 hover:bg-yellow-500/20',
                  isScrollTarget && !isCurrent && 'bg-blue-500/10 hover:bg-blue-500/15',
                  isCurrentMatch && !isCurrent && !isScrollTarget && 'bg-orange-500/20 hover:bg-orange-500/25',
                  isMatch && !isCurrentMatch && !isCurrent && !isScrollTarget && 'bg-orange-500/8',
                )}
                onClick={() => onToggleBreakpoint(lineNum)}
                title={hasBp ? 'Remove breakpoint' : 'Add breakpoint'}
              >
                {/* Breakpoint gutter */}
                <div
                  className="flex w-6 shrink-0 items-center justify-center self-center"
                  onContextMenu={
                    hasBp
                      ? (e) => {
                          e.preventDefault();
                          onRightClickBreakpoint(lineNum, e);
                        }
                      : undefined
                  }
                >
                  {hasBp ? (
                    <CircleDotIcon
                      className={cn('size-2.5', conditionalLines.has(lineNum) ? 'text-orange-400' : 'text-red-500')}
                    />
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
    </div>
  );
}

type LuaValueType = 'nil' | 'boolean' | 'number' | 'table' | 'function' | 'userdata' | 'thread' | 'string';

function detectLuaType(value: string): LuaValueType {
  if (value === 'nil') return 'nil';
  if (value === 'true' || value === 'false') return 'boolean';
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$|^-?inf$|^nan$/.test(value)) return 'number';
  if (value.startsWith('{') && value.endsWith('}')) return 'table';
  if (/^table \{\d+\}$/.test(value)) return 'table';
  if (/^table: 0x[0-9a-f]+$/.test(value)) return 'table';
  if (/^function: 0x[0-9a-f]+$/.test(value)) return 'function';
  if (/^userdata: 0x[0-9a-f]+$/.test(value)) return 'userdata';
  if (/^thread: 0x[0-9a-f]+$/.test(value)) return 'thread';
  return 'string';
}

const typeColor: Record<LuaValueType, string> = {
  nil: 'text-muted-foreground',
  boolean: 'text-purple-400',
  number: 'text-green-400',
  string: 'text-orange-400',
  table: 'text-sky-400',
  function: 'text-muted-foreground italic',
  userdata: 'text-muted-foreground italic',
  thread: 'text-muted-foreground italic',
};

function formatLuaValue(value: string, type: LuaValueType): string {
  if (type === 'string') return value; // already quoted by Lua: "..."
  if (type === 'function') return value.replace('function: ', 'fn ');
  if (type === 'userdata') return value.replace('userdata: ', 'ud ');
  if (type === 'thread') return value.replace('thread: ', 'co ');
  return value;
}

// Parse a Lua table string like `{x = 1, y = "hi", z = {a = 2}}` into entries.
// Returns null if the value is not a Lua table literal.
function parseLuaTable(s: string): Array<{ key: string; value: string }> | null {
  if (!s.startsWith('{') || !s.endsWith('}')) return null;
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];

  const rawParts: string[] = [];
  let depth = 0;
  let inStr = false;
  let start = 0;

  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (c === '"' && inner[i - 1] !== '\\') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
    } else if (c === ',' && depth === 0) {
      const part = inner.slice(start, i).trim();
      if (part) rawParts.push(part);
      start = i + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last) rawParts.push(last);

  const isTruncated = rawParts.at(-1) === '…';
  const parts = isTruncated ? rawParts.slice(0, -1) : rawParts;

  const entries = parts.map((part, idx) => {
    const eqIdx = part.indexOf(' = ');
    if (eqIdx === -1) return { key: `[${idx + 1}]`, value: part };
    return { key: part.slice(0, eqIdx).trim(), value: part.slice(eqIdx + 3).trim() };
  });

  if (isTruncated) entries.push({ key: '…', value: '' });
  return entries;
}

function VarNode({ name, value, indent = 0 }: { name: string; value: string; indent?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // `table {N}` is Lua's compact form for nested tables (depth ≥ 1) — we have no data to expand.
  const children = indent < 4 ? parseLuaTable(value) : null;
  const isExpandable = children !== null && children.length > 0 && !value.startsWith('table {');

  const type = detectLuaType(value);
  const realChildren = children?.filter((c) => c.key !== '…') ?? [];
  const isTruncated = children?.at(-1)?.key === '…';

  const display = isExpandable
    ? `{${realChildren.length}${isTruncated ? '+' : ''} ${realChildren.length === 1 ? 'entry' : 'entries'}}`
    : formatLuaValue(value, type);
  const truncated = display.length > 52 ? display.slice(0, 52) + '…' : display;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const pl = 12 + indent * 14;

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-baseline gap-1.5 py-0.5 pr-3 font-mono text-xs hover:bg-accent/50',
          isExpandable && 'cursor-pointer',
        )}
        style={{ paddingLeft: `${pl}px` }}
        onClick={isExpandable ? () => setExpanded((v) => !v) : undefined}
      >
        <span className="w-3 shrink-0 text-muted-foreground">
          {isExpandable && <ChevronRightIcon className={cn('size-3 transition-transform', expanded && 'rotate-90')} />}
        </span>
        <span className="shrink-0 text-blue-400">{name}</span>
        <span className="shrink-0 text-muted-foreground">=</span>
        <span
          className={cn('min-w-0 flex-1 break-all', isExpandable ? 'text-sky-400' : typeColor[type])}
          title={display !== truncated ? display : undefined}
        >
          {truncated}
        </span>
        <button onClick={handleCopy} className="ml-1 shrink-0">
          {copied ? (
            <CheckIcon className="size-3 text-green-500" />
          ) : (
            <CopyIcon className="size-3 text-muted-foreground opacity-0 group-hover:opacity-60" />
          )}
        </button>
      </div>
      {isExpandable && expanded && (
        <div>
          {realChildren.map(({ key, value: val }) => (
            <VarNode key={key} name={key} value={val} indent={indent + 1} />
          ))}
          {isTruncated && (
            <div
              className="py-0.5 font-mono text-xs text-muted-foreground italic"
              style={{ paddingLeft: `${pl + 14 + 12}px` }}
            >
              … more entries
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VarsSection({ title, vars, filter }: { title: string; vars: Record<string, string>; filter: string }) {
  const [open, setOpen] = useState(true);
  const allEntries = Object.entries(vars);
  const entries = filter
    ? allEntries.filter(([name]) => name.toLowerCase().includes(filter.toLowerCase()))
    : allEntries;

  if (allEntries.length === 0) return null;

  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-accent/30"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRightIcon
          className={cn('size-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{allEntries.length}</span>
      </button>
      {open &&
        (entries.length === 0 ? (
          <p className="px-3 py-1 text-xs text-muted-foreground italic">No matches</p>
        ) : (
          entries.map(([name, value]) => <VarNode key={name} name={name} value={value} />)
        ))}
    </div>
  );
}

export default function DebuggerPage() {
  const dbg = useDebugger();
  const { state: hotReloadState, sendModule, restoreOriginals } = useHotReload();
  const hotReloadPlugin = usePluginControl('hot-reload');
  const navigate = useNavigate();
  const { frames } = useTimeTravel();
  const configRootPath = useConfigStore((state) => state.config?.sourceDir || state.config?.root_path || '');
  const sessionId = useSessionStore((state) => state.sessionId);
  const rootPaths = useDebuggerStore((state) => state.rootPaths);
  const setRootPath = useDebuggerStore((state) => state.setRootPath);
  const clearRootPath = useDebuggerStore((state) => state.clearRootPath);
  const manualRootPath = sessionId ? (rootPaths[sessionId] ?? '') : '';
  const rootPath = manualRootPath || configRootPath;

  const pickFolder = async () => {
    const selected = await openFolderDialog({ directory: true, multiple: false });
    if (typeof selected === 'string' && sessionId) setRootPath(sessionId, selected);
  };

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const fileContentRef = useRef<string | null>(null);
  const [watchHotReload, setWatchHotReload] = useState(false);
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number>(0);
  const [varFilter, setVarFilter] = useState('');

  // Auto-navigate to the paused file when a breakpoint is hit
  const pausedFile = dbg.currentPaused?.file;
  useEffect(() => {
    if (pausedFile) {
      setSelectedFile(pausedFile);
      setScrollToLine(null);
      setSelectedFrameIndex(0);
    }
  }, [pausedFile]);

  // Read file content whenever the selection or root changes
  useEffect(() => {
    fileContentRef.current = fileContent;
  }, [fileContent]);

  useEffect(() => {
    if ((!hotReloadState.enabled || !hotReloadPlugin.enabled) && watchHotReload) {
      setWatchHotReload(false);
    }
  }, [hotReloadPlugin.enabled, hotReloadState.enabled, watchHotReload]);

  const selectedModule = useMemo(() => (selectedFile ? pathToLuaModule(selectedFile) : null), [selectedFile]);
  const selectedAbsPath = selectedFile && rootPath ? `${rootPath.replace(/\/$/, '')}/${selectedFile}` : null;

  const reloadSelectedModule = useCallback(() => {
    if (!selectedAbsPath || !selectedModule || !hotReloadState.enabled || isWeb()) return;
    readTextFile(selectedAbsPath)
      .then((source) => {
        fileContentRef.current = source;
        setFileContent(source);
        sendModule(selectedModule, source);
      })
      .catch(() => {});
  }, [hotReloadState.enabled, selectedAbsPath, selectedModule, sendModule]);

  useEffect(() => {
    if (!watchHotReload || !selectedAbsPath || !selectedModule || !hotReloadState.enabled || isWeb()) return;
    const timer = window.setInterval(() => {
      readTextFile(selectedAbsPath)
        .then((source) => {
          const previous = fileContentRef.current;
          if (previous === null) {
            fileContentRef.current = source;
            setFileContent(source);
            return;
          }
          if (source !== previous) {
            fileContentRef.current = source;
            setFileContent(source);
            sendModule(selectedModule, source);
          }
        })
        .catch(() => {});
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hotReloadState.enabled, selectedAbsPath, selectedModule, sendModule, watchHotReload]);

  // Read file content whenever the selection or root changes
  useEffect(() => {
    if (!selectedFile || !rootPath || isWeb()) {
      setFileContent(null);
      fileContentRef.current = null;
      return;
    }
    const absPath = `${rootPath.replace(/\/$/, '')}/${selectedFile}`;
    readTextFile(absPath)
      .then((content) => {
        fileContentRef.current = content;
        setFileContent(content);
      })
      .catch(() => {
        fileContentRef.current = null;
        setFileContent(null);
      });
  }, [selectedFile, rootPath]);

  const [conditionDialog, setConditionDialog] = useState<{ file: string; line: number; value: string } | null>(null);

  const breakpointFiles = new Set(dbg.breakpoints.map((b) => b.file));
  const breakpointLines = new Set(
    dbg.breakpoints.filter((b) => b.file === selectedFile && b.enabled).map((b) => b.line),
  );
  const conditionalLines = new Set(
    dbg.breakpoints.filter((b) => b.file === selectedFile && b.enabled && !!b.condition).map((b) => b.line),
  );
  const currentLine = dbg.currentPaused?.file === selectedFile ? dbg.currentPaused.line : null;
  const canHotReload =
    !isWeb() && hotReloadPlugin.enabled && hotReloadState.enabled && !!selectedModule && !!selectedAbsPath;
  const latestHotReload = hotReloadState.history.at(-1);

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

        {dbg.isPaused && frames.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-5" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate('/time-travel')}
              title="View frame history leading up to this breakpoint"
            >
              <ClockIcon className="size-3" /> Time Travel ({frames.length} frames)
            </Button>
          </>
        )}

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 px-1">
            <Switch
              id="hot-reload-enabled"
              checked={hotReloadPlugin.enabled}
              disabled={!sessionId || !hotReloadPlugin.available || hotReloadPlugin.plugin?.incompatible}
              onCheckedChange={hotReloadPlugin.setEnabled}
            />
            <Label htmlFor="hot-reload-enabled" className="text-xs text-muted-foreground">
              Hot Reload
            </Label>
          </div>
          {hotReloadState.active && (
            <Badge variant="outline" className="gap-1 font-mono text-xs text-orange-500">
              Hot Reload
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!canHotReload}
            onClick={reloadSelectedModule}
            title={
              hotReloadState.enabled
                ? !hotReloadPlugin.enabled
                  ? 'Hot reload plugin is disabled. Enable it with the switch first.'
                  : selectedModule
                  ? `Development only: send Lua source for ${selectedModule} into the running game`
                  : 'Select an allowlisted Lua module. Hot reload is development-only remote code execution.'
                : 'Hot reload is disabled. Include the hot-reload plugin and configure debugger.hotReload only for trusted development sessions.'
            }
          >
            <RefreshCwIcon className="size-3" /> Reload
          </Button>
          <div className="flex items-center gap-1 px-1">
            <Switch
              id="hot-reload-watch"
              checked={watchHotReload}
              disabled={!canHotReload}
              onCheckedChange={setWatchHotReload}
            />
            <Label htmlFor="hot-reload-watch" className="text-xs text-muted-foreground">
              Watch
            </Label>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            disabled={!hotReloadState.active}
            onClick={restoreOriginals}
            title="Restore modules that were replaced by Feather hot reload"
          >
            <RotateCcwIcon className="size-3" /> Restore
          </Button>
        </div>

        {latestHotReload && (
          <span
            className={cn(
              'min-w-0 truncate text-xs',
              latestHotReload.ok ? 'text-muted-foreground' : 'text-destructive',
            )}
            title={latestHotReload.error || latestHotReload.module}
          >
            {latestHotReload.ok
              ? latestHotReload.restored
                ? 'Runtime restored'
                : `Reloaded ${latestHotReload.module}`
              : `Failed ${latestHotReload.module}`}
          </span>
        )}
      </div>

      {/* 3-column body */}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* Col 1 — File tree */}
        <ResizablePanel defaultSize={'20%'} minSize={'10%'} maxSize={'30%'} className="flex flex-col">
          <div className="border-b px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Files</span>
              {!isWeb() && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={pickFolder}>
                    Open folder
                  </Button>
                </div>
              )}
            </div>
            {rootPath && (
              <div className="text-muted-foreground mt-0.5 truncate text-xs" title={rootPath}>
                {rootPath.split('/').pop()}
                {manualRootPath && sessionId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => clearRootPath(sessionId)}
                    title="Remove manual folder"
                  >
                    ×
                  </Button>
                )}
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
                {isWeb() ? 'Requires desktop app' : 'No game connected — open a folder to browse files'}
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
                scrollToLine={scrollToLine}
                breakpointLines={breakpointLines}
                conditionalLines={conditionalLines}
                onToggleBreakpoint={(line) => {
                  if (breakpointLines.has(line)) {
                    dbg.removeBreakpoint(selectedFile, line);
                  } else {
                    dbg.addBreakpoint(selectedFile, line);
                  }
                }}
                onRightClickBreakpoint={(line) => {
                  const bp = dbg.breakpoints.find((b) => b.file === selectedFile && b.line === line);
                  setConditionDialog({ file: selectedFile, line, value: bp?.condition ?? '' });
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
            <ResizablePanel defaultSize={'40%'} minSize={'20%'} className="flex flex-col">
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
                          i === selectedFrameIndex && 'bg-accent',
                        )}
                        onClick={() => {
                          setSelectedFile(frame.file);
                          setScrollToLine(frame.line);
                          setSelectedFrameIndex(i);
                        }}
                      >
                        <span className="text-muted-foreground w-3 shrink-0 text-right">{i}</span>
                        <div className="flex min-w-0 flex-col">
                          <span className={cn('truncate', i === selectedFrameIndex && 'font-semibold')}>
                            {frame.name}
                          </span>
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
              <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
                <span className="text-sm font-semibold">Variables</span>
                <div className="relative ml-auto">
                  <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    value={varFilter}
                    onChange={(e) => setVarFilter(e.target.value)}
                    placeholder="filter…"
                    className="h-6 w-28 rounded border bg-background pl-6 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <ScrollArea className="h-0 flex-1">
                {dbg.currentPaused ? (
                  <div className="flex flex-col py-1">
                    <VarsSection title="Locals" vars={dbg.currentPaused.locals} filter={varFilter} />
                    <VarsSection title="Upvalues" vars={dbg.currentPaused.upvalues} filter={varFilter} />
                  </div>
                ) : (
                  <div className="text-muted-foreground px-3 py-3 text-xs">No active frame</div>
                )}
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog
        open={conditionDialog !== null}
        onOpenChange={(open) => {
          if (!open) setConditionDialog(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">Breakpoint condition — line {conditionDialog?.line}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-xs">
            Enter a Lua expression. The breakpoint pauses only when it evaluates to true. Locals and upvalues from the
            paused frame are in scope.
          </p>
          <LuaCodeInput
            autoFocus
            singleLine
            placeholder="e.g. player.health < 10"
            value={conditionDialog?.value ?? ''}
            onChange={(v) => setConditionDialog((prev) => (prev ? { ...prev, value: v } : null))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && conditionDialog) {
                dbg.setCondition(conditionDialog.file, conditionDialog.line, conditionDialog.value || undefined);
                setConditionDialog(null);
              }
            }}
          />
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                if (conditionDialog) dbg.setCondition(conditionDialog.file, conditionDialog.line, undefined);
                setConditionDialog(null);
              }}
            >
              Clear condition
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (conditionDialog)
                  dbg.setCondition(conditionDialog.file, conditionDialog.line, conditionDialog.value || undefined);
                setConditionDialog(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
