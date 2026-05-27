import { useEffect, useMemo, useRef, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { useTheme } from '@/hooks/use-theme';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';
import { cn } from '@/utils/styles';

export type LuaCompletionItem = {
  label: string;
  detail?: string;
  insertText?: string;
  scope?: string;
};

interface LuaCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  singleLine?: boolean;
  className?: string;
  maxHeight?: number;
  completions?: LuaCompletionItem[];
}

// Shared between the highlighted backdrop and the editable textarea so they stay pixel-aligned.
const sharedStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.875rem',
  lineHeight: '1.5',
  padding: '8px 12px',
};

export function LuaCodeInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  disabled,
  autoFocus,
  singleLine = false,
  className,
  maxHeight = 200,
  completions = [],
}: LuaCodeInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const theme = useTheme();
  const highlightTheme = theme === 'dark' ? onDark : oneLight;
  const [completionIndex, setCompletionIndex] = useState(0);
  const [completionOpen, setCompletionOpen] = useState(false);

  const completionContext = useMemo(() => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/((?:[A-Za-z_][A-Za-z0-9_]*[.:])*)([A-Za-z_][A-Za-z0-9_]*)?$/);
    if (!match) return null;
    const prefix = match[1] ?? '';
    const query = match[2] ?? '';
    if (!prefix && query.length === 0) return null;
    const contextStart = cursor - prefix.length - query.length;
    const previousChar = contextStart > 0 ? value[contextStart - 1] : '';
    if (previousChar && /[A-Za-z0-9_]/.test(previousChar)) return null;
    const scope = prefix ? prefix.replace(/[.:]$/, '').replace(/[:]/g, '.') : null;
    return {
      value: query,
      start: cursor - query.length,
      end: cursor,
      scope,
    };
  }, [value]);

  const completionItems = useMemo(() => {
    if (!completionContext) return [];
    const query = completionContext.value.toLowerCase();
    const scopedCompletions =
      completionContext.scope === '_G'
        ? completions.filter((item) => !item.scope)
        : completions.filter((item) => (item.scope ?? null) === completionContext.scope);
    return scopedCompletions
      .filter((item) => {
        const label = item.label.toLowerCase();
        if (!query) return true;
        return label.includes(query) && item.label !== completionContext.value;
      })
      .sort((a, b) => {
        const aLabel = a.label.toLowerCase();
        const bLabel = b.label.toLowerCase();
        const aStarts = query && aLabel.startsWith(query);
        const bStarts = query && bLabel.startsWith(query);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        const aRuntime = a.detail?.includes('runtime');
        const bRuntime = b.detail?.includes('runtime');
        if (aRuntime !== bRuntime) return aRuntime ? -1 : 1;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 10);
  }, [completionContext, completions]);

  const resize = () => {
    const el = textareaRef.current;
    if (!el || singleLine) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  };

  useEffect(() => {
    resize();
  }, [value, singleLine]);

  useEffect(() => {
    setCompletionIndex(0);
    setCompletionOpen(completionItems.length > 0);
  }, [completionItems.length, completionContext?.scope, completionContext?.value]);

  const acceptCompletion = (item: LuaCompletionItem) => {
    if (!completionContext) return;
    const insertText = item.insertText ?? item.label;
    const next = `${value.slice(0, completionContext.start)}${insertText}${value.slice(completionContext.end)}`;
    onChange(next);
    setCompletionOpen(false);
    window.requestAnimationFrame(() => {
      const cursor = completionContext.start + insertText.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
      resize();
    });
  };

  return (
    <div
      className={cn(
        'relative overflow-visible rounded-md border bg-background shadow-sm',
        'focus-within:ring-1 focus-within:ring-ring',
        singleLine && 'h-9',
        className,
      )}
    >
      {/* Syntax-highlighted backdrop — sits behind the transparent textarea */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
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
            ...sharedStyle,
            background: 'transparent',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            overflow: 'visible',
          }}
          showLineNumbers={false}
          wrapLines
        >
          {/* Trailing space ensures the backdrop has height even when value is empty */}
          {value + ' '}
        </SyntaxHighlighter>
      </div>

      {/* Editable layer — transparent text reveals the highlighted backdrop */}
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={value}
        rows={1}
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          const v = singleLine ? e.target.value.replace(/\n/g, '') : e.target.value;
          onChange(v);
          if (!singleLine) resize();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={() => {
          if (completionItems.length > 0) setCompletionOpen(true);
        }}
        onKeyDownCapture={(e) => {
          if (!completionOpen || completionItems.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setCompletionIndex((index) => Math.min(index + 1, completionItems.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setCompletionIndex((index) => Math.max(index - 1, 0));
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            acceptCompletion(completionItems[completionIndex]);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setCompletionOpen(false);
          }
        }}
        className={cn(
          'relative z-10 w-full resize-none bg-transparent font-mono text-sm',
          'text-transparent [caret-color:var(--foreground)]',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          singleLine && 'h-full overflow-hidden',
        )}
        style={sharedStyle}
      />
      {completionOpen && completionItems.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-1 max-h-52 min-w-56 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {completionItems.map((item, index) => (
            <button
              key={`${item.label}-${item.detail ?? ''}`}
              type="button"
              data-selected={index === completionIndex}
              className={cn(
                'flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-xs hover:bg-accent',
                index === completionIndex && 'bg-accent',
              )}
              onMouseEnter={() => setCompletionIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                acceptCompletion(item);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.detail && <span className="shrink-0 text-[10px] text-muted-foreground">{item.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
