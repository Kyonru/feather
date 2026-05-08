import { useEffect, useRef } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { useTheme } from '@/hooks/use-theme';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';
import { cn } from '@/utils/styles';

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
}: LuaCodeInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const theme = useTheme();
  const highlightTheme = theme === 'dark' ? onDark : oneLight;

  const resize = () => {
    const el = textareaRef.current;
    if (!el || singleLine) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  };

  useEffect(() => {
    resize();
  }, [value, singleLine]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border bg-background shadow-sm',
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
    </div>
  );
}
