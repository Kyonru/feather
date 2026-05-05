import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageLayout } from '@/components/page-layout';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConsole, type ConsoleEntry } from '@/hooks/use-console';
import type { EvalResponse } from '@/hooks/use-ws-connection';
import { useSessionStore } from '@/store/session';
import { Trash2Icon, SendIcon } from 'lucide-react';
import { cn } from '@/utils/styles';

function ConsoleOutput({ entry, response }: { entry: ConsoleEntry; response?: EvalResponse }) {
  return (
    <div className="border-b border-border/50 py-2 font-mono text-sm">
      <div className="flex items-start gap-2">
        <span className="select-none text-blue-500">&gt;</span>
        <pre className="flex-1 whitespace-pre-wrap break-all text-foreground">{entry.input}</pre>
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
  const [history, setHistory] = useState<ConsoleEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Build merged view: entries + their responses
  const responseMap = useMemo(() => {
    const map = new Map<string, EvalResponse>();
    for (const r of responses) {
      map.set(r.id, r);
    }
    return map;
  }, [responses]);

  // Auto-scroll to bottom on new entries/responses
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length, responses.length]);

  const handleSubmit = useCallback(() => {
    const code = input.trim();
    if (!code) return;

    const entry = execute(code);
    setHistory((prev) => [...prev, entry]);
    setInput('');
    setHistoryIndex(-1);

    // Auto-resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, execute]);

  const handleClear = useCallback(() => {
    setHistory([]);
    clear();
  }, [clear]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }

    // Arrow up/down for command history
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      if (history.length === 0) return;
      e.preventDefault();
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setInput(history[newIndex].input);
    }

    if (e.key === 'ArrowDown' && !e.shiftKey) {
      if (historyIndex === -1) return;
      e.preventDefault();
      const newIndex = historyIndex + 1;
      if (newIndex >= history.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(newIndex);
        setInput(history[newIndex].input);
      }
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  return (
    <PageLayout>
      <div className="flex flex-1 flex-col min-h-0 px-4">
        {/* Toolbar */}
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Console</h2>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleClear} disabled={history.length === 0}>
            <Trash2Icon className="size-4" />
            Clear
          </Button>
        </div>

        {/* Output area */}
        <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-3 min-h-0" ref={scrollRef}>
          {history.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p className="text-sm">
                {sessionId
                  ? 'Type Lua code below and press Enter to execute.'
                  : 'No active session. Connect a game to use the console.'}
              </p>
            </div>
          ) : (
            history.map((entry) => <ConsoleOutput key={entry.id} entry={entry} response={responseMap.get(entry.id)} />)
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="mt-2 mb-2 flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={sessionId ? 'return 1 + 1' : 'No session connected...'}
            disabled={!sessionId}
            rows={1}
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 font-mono text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button size="icon" onClick={handleSubmit} disabled={!sessionId || !input.trim()}>
            <SendIcon className="size-4" />
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
