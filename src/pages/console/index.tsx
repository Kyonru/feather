import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LuaCodeInput } from '@/components/ui/lua-code-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConsole, type ConsoleEntry } from '@/hooks/use-console';
import type { EvalResponse } from '@/hooks/use-ws-connection';
import { useSessionStore } from '@/store/session';
import { useConsoleHistoryStore } from '@/store/console-history';
import { Trash2Icon, SendIcon } from 'lucide-react';
import { cn } from '@/utils/styles';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { useTheme } from '@/hooks/use-theme';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';

function ConsoleOutput({ entry, response }: { entry: ConsoleEntry; response?: EvalResponse }) {
  const theme = useTheme();
  const highlightTheme = theme === 'dark' ? onDark : oneLight;

  return (
    <div className="border-b border-border/50 py-2 font-mono text-sm">
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
          >
            {entry.input}
          </SyntaxHighlighter>
        </div>
      </div>

      {response?.prints?.map((line, i) => (
        <div key={i} className="flex items-start gap-2 pl-4 text-muted-foreground">
          <pre className="whitespace-pre-wrap break-all">{line}</pre>
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
            {response.result}
          </pre>
        </div>
      )}

      {response?.status === 'success' && response.result == null && response.prints?.length === 0 && (
        <div className="pl-4 text-muted-foreground italic">nil</div>
      )}

      {!response && <div className="pl-4 text-muted-foreground italic">waiting...</div>}
    </div>
  );
}

export default function ConsolePage() {
  const { responses, execute, clear } = useConsole();
  const sessionId = useSessionStore((state) => state.sessionId);
  const [input, setInput] = useState('');
  // storedHistory: persisted string[], most-recent last, already deduplicated by the store
  const storedHistory = useConsoleHistoryStore((state) => state.history);
  const pushHistory = useConsoleHistoryStore((state) => state.push);
  const clearHistory = useConsoleHistoryStore((state) => state.clear);
  // sessionEntries: current session only, ConsoleEntry[] for response tracking
  const [sessionEntries, setSessionEntries] = useState<ConsoleEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchListRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = useCallback(() => {
    const code = input.trim();
    if (!code) return;
    const entry = execute(code);
    setSessionEntries((prev) => [...prev, entry]);
    pushHistory(code);
    setInput('');
    setHistoryIndex(-1);
  }, [input, execute, pushHistory]);

  const handleClear = useCallback(() => {
    setSessionEntries([]);
    clearHistory();
    clear();
  }, [clear, clearHistory]);

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
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <h2 className="text-sm font-semibold">Console</h2>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={sessionEntries.length === 0 && storedHistory.length === 0}
        >
          <Trash2Icon className="size-3.5" />
          Clear
        </Button>
      </div>

      {/* Output — fills remaining space and scrolls */}
      <ScrollArea className="h-0 flex-1 overflow-y-auto px-4 py-3" ref={scrollRef}>
        {sessionEntries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm">
              {sessionId
                ? 'Type Lua code below and press Enter to execute.'
                : 'No active session. Connect a game to use the console.'}
            </p>
          </div>
        ) : (
          sessionEntries.map((entry) => (
            <ConsoleOutput key={entry.id} entry={entry} response={responseMap.get(entry.id)} />
          ))
        )}
        <div ref={bottomRef} />
      </ScrollArea>

      {/* Input — fixed at bottom */}
      <div className="relative shrink-0 border-t px-4 py-3">
        <div className="relative flex items-end gap-2">
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
                  placeholder="filter history…"
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
            placeholder={sessionId ? 'return 1 + 1  (Ctrl+R to search history)' : 'No session connected...'}
            disabled={!sessionId}
          />
          <Button size="icon" onClick={handleSubmit} disabled={!sessionId || !input.trim()}>
            <SendIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
