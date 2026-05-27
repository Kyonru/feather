import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LuaCodeInput, type LuaCompletionItem } from '@/components/ui/lua-code-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useConsole, type ConsoleEntry } from '@/hooks/use-console';
import { useEffectiveApiKey } from '@/hooks/use-session-api-key';
import { usePluginControl } from '@/hooks/use-plugin-control';
import type { EvalResponse } from '@/hooks/use-ws-connection';
import { useSessionStore } from '@/store/session';
import { type ConsoleSnippet, useConsoleHistoryStore } from '@/store/console-history';
import {
  CheckIcon,
  ClipboardIcon,
  CornerDownLeftIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  SaveIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react';
import { cn } from '@/utils/styles';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { useTheme } from '@/hooks/use-theme';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';
import { copyToClipboardWithMeta } from '@/utils/strings';
import { toast } from 'sonner';

const BUILT_IN_SNIPPETS: Array<Pick<ConsoleSnippet, 'id' | 'name' | 'code'>> = [
  {
    id: 'builtin-graphics-stats',
    name: 'Graphics stats',
    code: 'return love.graphics.getStats()',
  },
  {
    id: 'builtin-memory',
    name: 'Memory usage',
    code: 'return collectgarbage("count") .. " KB"',
  },
  {
    id: 'builtin-frame',
    name: 'FPS / frame time',
    code: 'return { fps = love.timer.getFPS(), dt = love.timer.getDelta() }',
  },
  {
    id: 'builtin-window',
    name: 'Window size',
    code: 'return { width = love.graphics.getWidth(), height = love.graphics.getHeight() }',
  },
];

const LONG_OUTPUT_LIMIT = 900;

const BUILT_IN_COMPLETIONS: LuaCompletionItem[] = [
  { label: '_G', detail: 'table' },
  { label: 'love', detail: 'table' },
  { label: 'print', detail: 'function' },
  { label: 'pairs', detail: 'function' },
  { label: 'ipairs', detail: 'function' },
  { label: 'require', detail: 'function' },
  { label: 'collectgarbage', detail: 'function' },
  { label: 'table', detail: 'table' },
  { label: 'string', detail: 'table' },
  { label: 'math', detail: 'table' },
  { label: 'coroutine', detail: 'table' },
  { label: 'debug', detail: 'table' },
  { label: 'return', detail: 'keyword' },
  { label: 'local', detail: 'keyword' },
  { label: 'function', detail: 'keyword' },
  { label: 'graphics', detail: 'module', scope: 'love' },
  { label: 'timer', detail: 'module', scope: 'love' },
  { label: 'window', detail: 'module', scope: 'love' },
  { label: 'filesystem', detail: 'module', scope: 'love' },
  { label: 'audio', detail: 'module', scope: 'love' },
  { label: 'keyboard', detail: 'module', scope: 'love' },
  { label: 'mouse', detail: 'module', scope: 'love' },
  { label: 'event', detail: 'module', scope: 'love' },
  { label: 'getStats', detail: 'function', scope: 'love.graphics' },
  { label: 'getWidth', detail: 'function', scope: 'love.graphics' },
  { label: 'getHeight', detail: 'function', scope: 'love.graphics' },
  { label: 'getDimensions', detail: 'function', scope: 'love.graphics' },
  { label: 'setColor', detail: 'function', scope: 'love.graphics' },
  { label: 'setBlendMode', detail: 'function', scope: 'love.graphics' },
  { label: 'draw', detail: 'function', scope: 'love.graphics' },
  { label: 'print', detail: 'function', scope: 'love.graphics' },
  { label: 'rectangle', detail: 'function', scope: 'love.graphics' },
  { label: 'circle', detail: 'function', scope: 'love.graphics' },
  { label: 'line', detail: 'function', scope: 'love.graphics' },
  { label: 'push', detail: 'function', scope: 'love.graphics' },
  { label: 'pop', detail: 'function', scope: 'love.graphics' },
  { label: 'getFPS', detail: 'function', scope: 'love.timer' },
  { label: 'getDelta', detail: 'function', scope: 'love.timer' },
  { label: 'getTime', detail: 'function', scope: 'love.timer' },
  { label: 'getWidth', detail: 'function', scope: 'love.window' },
  { label: 'getHeight', detail: 'function', scope: 'love.window' },
  { label: 'getMode', detail: 'function', scope: 'love.window' },
  { label: 'setMode', detail: 'function', scope: 'love.window' },
  { label: 'isDown', detail: 'function', scope: 'love.keyboard' },
  { label: 'isDown', detail: 'function', scope: 'love.mouse' },
  { label: 'getPosition', detail: 'function', scope: 'love.mouse' },
  { label: 'getX', detail: 'function', scope: 'love.mouse' },
  { label: 'getY', detail: 'function', scope: 'love.mouse' },
  { label: 'abs', detail: 'function', scope: 'math' },
  { label: 'floor', detail: 'function', scope: 'math' },
  { label: 'ceil', detail: 'function', scope: 'math' },
  { label: 'min', detail: 'function', scope: 'math' },
  { label: 'max', detail: 'function', scope: 'math' },
  { label: 'random', detail: 'function', scope: 'math' },
  { label: 'sin', detail: 'function', scope: 'math' },
  { label: 'cos', detail: 'function', scope: 'math' },
  { label: 'sqrt', detail: 'function', scope: 'math' },
  { label: 'insert', detail: 'function', scope: 'table' },
  { label: 'remove', detail: 'function', scope: 'table' },
  { label: 'sort', detail: 'function', scope: 'table' },
  { label: 'concat', detail: 'function', scope: 'table' },
  { label: 'format', detail: 'function', scope: 'string' },
  { label: 'find', detail: 'function', scope: 'string' },
  { label: 'match', detail: 'function', scope: 'string' },
  { label: 'gsub', detail: 'function', scope: 'string' },
  { label: 'lower', detail: 'function', scope: 'string' },
  { label: 'upper', detail: 'function', scope: 'string' },
];

function formatTime(value?: number) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function copyText(value: string, label: string) {
  copyToClipboardWithMeta(value);
  toast.success(`Copied ${label}`);
}

function buildResultText(response?: EvalResponse) {
  if (!response) return '';
  const parts = [...(response.prints ?? [])];
  if (response.result != null) parts.push(response.result);
  if (response.status === 'success' && response.result == null && response.prints?.length === 0) parts.push('nil');
  return parts.join('\n');
}

function displayOutput(value: string, expanded: boolean) {
  if (expanded || value.length <= LONG_OUTPUT_LIMIT) return value;
  return `${value.slice(0, LONG_OUTPUT_LIMIT)}\n...`;
}

function ConsoleOutput({
  entry,
  response,
  completedAt,
  onRerun,
  onUseInput,
}: {
  entry: ConsoleEntry;
  response?: EvalResponse;
  completedAt?: number;
  onRerun: (code: string) => void;
  onUseInput: (code: string) => void;
}) {
  const theme = useTheme();
  const highlightTheme = theme === 'dark' ? onDark : oneLight;
  const [expanded, setExpanded] = useState(false);
  const resultText = buildResultText(response);
  const hasLongOutput = resultText.length > LONG_OUTPUT_LIMIT;
  const status = response?.status ?? 'waiting';
  const statusClass =
    status === 'error'
      ? 'border-destructive/40 text-destructive'
      : status === 'success'
        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
        : 'border-amber-500/40 text-amber-600';

  return (
    <div
      className={cn(
        'border-b border-border/50 py-2 font-mono text-sm',
        response?.status === 'error' && 'bg-destructive/5',
      )}
    >
      <div className="mb-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className={cn('h-5 font-mono text-[11px]', statusClass)}>
          {status}
        </Badge>
        <span title={new Date(entry.timestamp).toLocaleString()}>{formatTime(entry.timestamp)}</span>
        {completedAt && <span title={new Date(completedAt).toLocaleString()}>done {formatTime(completedAt)}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            title="Copy command"
            onClick={() => copyText(entry.input, 'command')}
          >
            <ClipboardIcon className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            title={resultText ? 'Copy result' : 'No result to copy yet'}
            disabled={!resultText}
            onClick={() => copyText(resultText, 'result')}
          >
            <CheckIcon className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            title="Use as input"
            onClick={() => onUseInput(entry.input)}
          >
            <CornerDownLeftIcon className="size-3" />
          </Button>
          <Button size="icon" variant="ghost" className="size-6" title="Run again" onClick={() => onRerun(entry.input)}>
            <RotateCcwIcon className="size-3" />
          </Button>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="select-none text-blue-500">&gt;</span>
        <div className="flex-1 min-w-0">
          <SyntaxHighlighter
            language="lua"
            style={{
              ...highlightTheme,
              hljs: {
                ...(highlightTheme as Record<string, React.CSSProperties>).hljs,
                background: 'transparent',
                padding: 0,
              },
            }}
            customStyle={{
              background: 'transparent',
              padding: 0,
              margin: 0,
              fontSize: 'inherit',
              fontFamily: 'inherit',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
            showLineNumbers={false}
            wrapLines
          >
            {entry.input}
          </SyntaxHighlighter>
        </div>
      </div>

      {response?.prints?.map((line, i) => (
        <div key={i} className="flex items-start gap-2 pl-4 text-muted-foreground">
          <pre className="whitespace-pre-wrap break-all">{displayOutput(line, expanded)}</pre>
        </div>
      ))}

      {response?.result != null && (
        <div className="flex items-start gap-2 pl-4">
          <span className="select-none text-muted-foreground">←</span>
          <pre
            className={cn(
              'flex-1 whitespace-pre-wrap break-all',
              response.status === 'error' ? 'text-red-500' : 'text-green-600 dark:text-green-400',
            )}
          >
            {displayOutput(response.result, expanded)}
          </pre>
        </div>
      )}

      {response?.status === 'success' && response.result == null && response.prints?.length === 0 && (
        <div className="pl-4 text-muted-foreground italic">nil</div>
      )}

      {!response && <div className="pl-4 text-muted-foreground italic">waiting...</div>}
      {hasLongOutput && (
        <Button
          size="sm"
          variant="ghost"
          className="ml-4 mt-1 h-6 px-2 text-xs"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </div>
  );
}

export default function ConsolePage() {
  const { responses, globals, execute, clear, refreshGlobals } = useConsole();
  const sessionId = useSessionStore((state) => state.sessionId);
  const apiKey = useEffectiveApiKey();
  const consolePlugin = usePluginControl('console');
  const [input, setInput] = useState('');
  const emptyRef = useRef([]);
  // storedHistory: persisted string[], most-recent last, deduplicated, scoped to the active session
  const storedHistory = useConsoleHistoryStore((state) =>
    sessionId ? (state.historyBySession[sessionId] ?? emptyRef.current) : emptyRef.current,
  );
  const persistedOutputs = useConsoleHistoryStore((state) =>
    sessionId ? (state.outputBySession[sessionId] ?? emptyRef.current) : emptyRef.current,
  );
  const savedSnippets = useConsoleHistoryStore((state) =>
    sessionId ? (state.snippetsBySession[sessionId] ?? emptyRef.current) : emptyRef.current,
  );
  const pushHistory = useConsoleHistoryStore((state) => state.push);
  const pushOutput = useConsoleHistoryStore((state) => state.pushOutput);
  const clearOutput = useConsoleHistoryStore((state) => state.clearOutput);
  const saveSnippet = useConsoleHistoryStore((state) => state.saveSnippet);
  const updateSnippet = useConsoleHistoryStore((state) => state.updateSnippet);
  const deleteSnippet = useConsoleHistoryStore((state) => state.deleteSnippet);
  const clearSnippets = useConsoleHistoryStore((state) => state.clearSnippets);
  // sessionEntries: current session only, ConsoleEntry[] for response tracking
  const [sessionEntries, setSessionEntries] = useState<ConsoleEntry[]>([]);
  // Track which response IDs have already been persisted to avoid duplicates
  const persistedIds = useRef(new Set<string>());
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchListRef = useRef<HTMLDivElement>(null);
  const snippets = savedSnippets.length > 0 ? savedSnippets : BUILT_IN_SNIPPETS;
  const completionItems = useMemo(() => {
    const runtimeItems: LuaCompletionItem[] =
      globals?.ok && globals.globals
        ? globals.globals.map((item) => ({
            label: item.name,
            detail: `${item.type} runtime`,
          }))
        : [];
    const byLabel = new Map<string, LuaCompletionItem>();
    for (const item of [...runtimeItems, ...BUILT_IN_COMPLETIONS]) {
      const key = `${item.scope ?? 'global'}:${item.label}`;
      if (!byLabel.has(key)) byLabel.set(key, item);
    }
    return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [globals]);
  const globalsLabel = globals?.ok
    ? `Globals: ${globals.globals?.length ?? 0}`
    : globals?.error === 'Loading globals...'
      ? 'Globals: loading'
      : globals?.error
        ? 'Globals failed'
        : 'Globals: not loaded';

  // storedHistory is most-recent-last; reverse for most-recent-first display/nav
  const historyNewestFirst = useMemo(() => [...storedHistory].reverse(), [storedHistory]);

  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return q ? historyNewestFirst.filter((s) => s.toLowerCase().includes(q)) : historyNewestFirst;
  }, [historyNewestFirst, searchQuery]);

  // Build merged view: session entries + their responses
  const responseMap = useMemo(() => {
    const map = new Map<string, EvalResponse>();
    for (const r of responses) map.set(r.id, r);
    return map;
  }, [responses]);

  // Keep searchIndex in bounds when results change
  useEffect(() => {
    setSearchIndex(0);
  }, [searchQuery]);

  // Scroll selected search item into view
  useEffect(() => {
    if (!isSearching) return;
    const list = searchListRef.current;
    if (!list) return;
    const selected = list.querySelector('[data-selected="true"]') as HTMLElement | null;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [searchIndex, isSearching]);

  // Persist responses as they arrive so output survives page navigation
  useEffect(() => {
    for (const entry of sessionEntries) {
      if (persistedIds.current.has(entry.id)) continue;
      const response = responseMap.get(entry.id);
      if (!response) continue;
      persistedIds.current.add(entry.id);
      if (sessionId) {
        pushOutput(sessionId, {
          id: entry.id,
          input: entry.input,
          timestamp: entry.timestamp,
          completedAt: Date.now(),
          status: response.status,
          result: response.result,
          prints: response.prints ?? [],
        });
      }
    }
  }, [responseMap, sessionEntries, pushOutput, sessionId]);

  // Auto-scroll output to bottom on new entries or responses
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [sessionEntries.length, responses.length]);

  const openSearch = () => {
    setSearchQuery('');
    setSearchIndex(0);
    setIsSearching(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
  };

  const selectSearchResult = (value: string) => {
    setInput(value);
    closeSearch();
  };

  const runCode = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      const entry = execute(trimmed);
      setSessionEntries((prev) => [...prev, entry]);
      if (sessionId) pushHistory(sessionId, trimmed);
      setHistoryIndex(-1);
    },
    [execute, pushHistory, sessionId],
  );

  const handleSubmit = useCallback(() => {
    const code = input.trim();
    if (!code) return;
    runCode(code);
    setInput('');
  }, [input, runCode]);

  const handleClear = useCallback(() => {
    setSessionEntries([]);
    if (sessionId) clearOutput(sessionId);
    clear();
  }, [clear, clearOutput, sessionId]);

  const handleSaveSnippet = useCallback(() => {
    const code = input.trim();
    if (!sessionId || !code) return;
    const firstLine =
      code
        .split('\n')
        .find((line) => line.trim())
        ?.trim() ?? 'Console snippet';
    const name = window.prompt('Snippet name', firstLine.slice(0, 48));
    if (!name?.trim()) return;
    saveSnippet(sessionId, { name: name.trim(), code });
    toast.success('Saved console snippet');
  }, [input, saveSnippet, sessionId]);

  const handleRenameSnippet = useCallback(
    (snippet: Pick<ConsoleSnippet, 'id' | 'name' | 'code'>) => {
      if (!sessionId || snippet.id.startsWith('builtin-')) return;
      const nextName = window.prompt('Snippet name', snippet.name);
      if (!nextName?.trim()) return;
      updateSnippet(sessionId, snippet.id, { name: nextName.trim() });
    },
    [sessionId, updateSnippet],
  );

  const handleConsoleEnabledChange = useCallback(
    (enabled: boolean) => {
      consolePlugin.setEnabled(enabled, enabled ? { apiKey } : undefined);
    },
    [apiKey, consolePlugin],
  );

  const consoleReady = !!sessionId && consolePlugin.available && consolePlugin.enabled;
  const canEnableConsole = !!sessionId && consolePlugin.available && !consolePlugin.plugin?.incompatible && !!apiKey;
  const consoleUnavailableReason = !sessionId
    ? 'Connect a game session to use the Console.'
    : !consolePlugin.available
      ? 'The console plugin is not installed in this session.'
      : consolePlugin.plugin?.incompatible
        ? consolePlugin.plugin.incompatibilityReason || 'The console plugin is incompatible with this session.'
        : !apiKey
          ? 'Set the session API key before enabling Console eval.'
          : !consolePlugin.enabled
            ? 'Enable the Console plugin to execute Lua.'
            : null;
  const sandboxLabel =
    consolePlugin.available && consolePlugin.plugin?.sandbox === false
      ? 'Unsandboxed'
      : consolePlugin.available
        ? 'Sandboxed'
        : 'Sandbox unknown';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openSearch();
    }
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      if (storedHistory.length === 0) return;
      e.preventDefault();
      const newIndex = historyIndex === -1 ? storedHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setInput(storedHistory[newIndex]);
    }
    if (e.key === 'ArrowDown' && !e.shiftKey) {
      if (historyIndex === -1) return;
      e.preventDefault();
      const newIndex = historyIndex + 1;
      if (newIndex >= storedHistory.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(newIndex);
        setInput(storedHistory[newIndex]);
      }
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      closeSearch();
    } else if (e.key === 'Enter') {
      if (searchResults[searchIndex]) selectSearchResult(searchResults[searchIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchIndex((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b px-4 py-2" data-testid="console-header">
        <h2 className="shrink-0 text-sm font-semibold">Console</h2>
        <Badge variant={sessionId ? 'outline' : 'secondary'} className="h-6 shrink-0 font-mono text-xs">
          {sessionId ? 'Connected' : 'No session'}
        </Badge>
        <Badge
          variant={consolePlugin.enabled ? 'outline' : 'secondary'}
          className={cn(
            'h-6 shrink-0 font-mono text-xs',
            consolePlugin.enabled && 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
          )}
        >
          {consolePlugin.enabled ? 'Plugin enabled' : 'Plugin disabled'}
        </Badge>
        <Badge
          variant={apiKey ? 'outline' : 'destructive'}
          className="h-6 shrink-0 font-mono text-xs"
          title={apiKey ? 'The active session API key is present.' : 'Set an API key before enabling Console eval.'}
        >
          {apiKey ? 'API key set' : 'API key missing'}
        </Badge>
        {consolePlugin.available && (
          <Badge
            variant="outline"
            className={cn(
              'h-6 shrink-0 font-mono text-xs',
              sandboxLabel === 'Unsandboxed' && 'border-amber-500/40 text-amber-600',
            )}
          >
            {sandboxLabel}
          </Badge>
        )}
        <Badge
          variant={globals?.ok ? 'outline' : 'secondary'}
          className={cn('h-6 shrink-0 font-mono text-xs', globals?.ok && 'border-cyan-500/40 text-cyan-600')}
          title={globals?.error || 'Manual runtime _G autocomplete snapshot'}
        >
          {globalsLabel}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshGlobals}
          disabled={!sessionId || !consolePlugin.available || !consolePlugin.enabled}
          title={
            consolePlugin.enabled
              ? 'Refresh runtime _G names for autocomplete'
              : consoleUnavailableReason || 'Enable Console to refresh _G names'
          }
        >
          <SparklesIcon className="size-3.5" />
          Refresh _G
        </Button>
        <div className="min-w-4 flex-1" />
        <div
          className="flex shrink-0 items-center gap-2"
          title={
            consolePlugin.enabled
              ? 'Disable Console eval for this session.'
              : consoleUnavailableReason || 'Enable Console eval for this session.'
          }
        >
          <Switch
            id="console-enabled"
            size="sm"
            checked={consolePlugin.enabled}
            disabled={consolePlugin.enabled ? !sessionId : !canEnableConsole}
            onCheckedChange={handleConsoleEnabledChange}
          />
          <Label htmlFor="console-enabled" className="text-xs text-muted-foreground">
            Enabled
          </Label>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={sessionEntries.length === 0 && persistedOutputs.length === 0}
          title="Clear visible transcript for this session. Command history stays available."
        >
          <Trash2Icon className="size-3.5" />
          Clear
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex min-h-0 min-w-0 flex-col">
          <ScrollArea className="h-0 flex-1 overflow-y-auto px-4 py-3" ref={scrollRef}>
            {/* Persisted outputs from previous page visits for this session */}
            {persistedOutputs
              .filter((o) => !sessionEntries.some((e) => e.id === o.id))
              .map((o) => (
                <ConsoleOutput
                  key={o.id}
                  entry={{ id: o.id, input: o.input, timestamp: o.timestamp }}
                  completedAt={o.completedAt}
                  response={{ id: o.id, status: o.status, result: o.result, prints: o.prints }}
                  onRerun={runCode}
                  onUseInput={setInput}
                />
              ))}
            {/* Live entries for the current page visit */}
            {sessionEntries.map((entry) => (
              <ConsoleOutput
                key={entry.id}
                entry={entry}
                response={responseMap.get(entry.id)}
                onRerun={runCode}
                onUseInput={setInput}
              />
            ))}
            {persistedOutputs.length === 0 && sessionEntries.length === 0 && historyNewestFirst.length === 0 && (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <p className="text-sm">
                  {consoleUnavailableReason ?? 'Type Lua code below and press Enter to execute.'}
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </ScrollArea>

          <div className="relative shrink-0 border-t px-4 py-3">
            <div className="relative flex items-center gap-2">
              {isSearching && (
                <div className="absolute bottom-full left-0 right-10 mb-1 z-50 rounded-md border bg-popover shadow-lg overflow-hidden">
                  <div className="flex items-center gap-2 border-b px-3 py-2">
                    <span className="text-xs text-muted-foreground select-none font-mono">search:</span>
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      className="flex-1 bg-transparent font-mono text-sm focus:outline-none"
                      placeholder="filter history..."
                      spellCheck={false}
                    />
                    <span className="text-xs text-muted-foreground select-none">Esc to close</span>
                  </div>
                  <div ref={searchListRef} className="max-h-52 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-muted-foreground italic">No matches</div>
                    ) : (
                      searchResults.map((entry, i) => (
                        <button
                          key={i}
                          data-selected={i === searchIndex}
                          className={cn(
                            'w-full text-left px-3 py-1.5 font-mono text-xs truncate hover:bg-accent',
                            i === searchIndex && 'bg-accent',
                          )}
                          onClick={() => selectSearchResult(entry)}
                          onMouseEnter={() => setSearchIndex(i)}
                        >
                          {entry}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <LuaCodeInput
                className="flex-1"
                value={input}
                onChange={setInput}
                onKeyDown={handleKeyDown}
                completions={completionItems}
                placeholder={
                  consoleReady
                    ? 'return 1 + 1  (Ctrl+R to search history)'
                    : 'Prepare Lua here; enable Console to run it...'
                }
                disabled={!sessionId}
              />
              <Button
                size="icon"
                variant="outline"
                onClick={handleSaveSnippet}
                disabled={!sessionId || !input.trim()}
                title="Save current input as a snippet"
              >
                <SaveIcon className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={openSearch}
                disabled={!sessionId || storedHistory.length === 0}
                title="Search command history"
              >
                <SearchIcon className="size-4" />
              </Button>
              <Button
                size="icon"
                onClick={handleSubmit}
                disabled={!consoleReady || !input.trim()}
                title={consoleReady ? 'Execute Lua' : consoleUnavailableReason || 'Console unavailable'}
              >
                <SendIcon className="size-4" />
              </Button>
            </div>
          </div>
        </section>

        <aside className="flex max-h-72 min-h-0 shrink-0 flex-col border-t bg-muted/20 lg:h-auto lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
          <div className="flex h-10 items-center gap-2 border-b px-3">
            <TerminalIcon className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">Snippets</span>
            <Badge variant="secondary" className="ml-auto h-5 font-mono text-[11px]">
              {savedSnippets.length > 0 ? savedSnippets.length : 'built-in'}
            </Badge>
            {savedSnippets.length > 0 && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="Clear saved snippets"
                onClick={() => sessionId && clearSnippets(sessionId)}
              >
                <Trash2Icon className="size-3" />
              </Button>
            )}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="grid gap-3 p-3">
              <div className="grid gap-2">
                {snippets.map((snippet) => {
                  const isBuiltIn = snippet.id.startsWith('builtin-');
                  return (
                    <div key={snippet.id} className="rounded-md border bg-background/70 p-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={snippet.name}>
                          {snippet.name}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          title="Insert snippet"
                          onClick={() => setInput(snippet.code)}
                        >
                          <CornerDownLeftIcon className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                          title={consoleReady ? 'Run snippet' : consoleUnavailableReason || 'Console unavailable'}
                          disabled={!consoleReady}
                          onClick={() => runCode(snippet.code)}
                        >
                          <PlayIcon className="size-3" />
                        </Button>
                      </div>
                      <pre className="mt-1 max-h-16 overflow-hidden whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                        {snippet.code}
                      </pre>
                      {!isBuiltIn && (
                        <div className="mt-1 flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleRenameSnippet(snippet)}
                          >
                            <PencilIcon className="size-3" /> Rename
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => sessionId && deleteSnippet(sessionId, snippet.id)}
                          >
                            <Trash2Icon className="size-3" /> Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}
