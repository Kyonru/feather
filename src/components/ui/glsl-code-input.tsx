import { useEffect, useRef, type CSSProperties } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { useTheme } from '@/hooks/use-theme';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';
import { cn } from '@/utils/styles';

interface GlslCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  maxHeight?: number;
}

const sharedStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.75rem',
  lineHeight: '1.55',
  padding: '10px 12px',
};

export function GlslCodeInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  maxHeight = 420,
}: GlslCodeInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const theme = useTheme();
  const highlightTheme = theme === 'dark' ? onDark : oneLight;

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  };

  useEffect(() => {
    resize();
  }, [value, maxHeight]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border bg-background shadow-sm',
        'focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-auto">
        <SyntaxHighlighter
          language="glsl"
          style={{
            ...highlightTheme,
            hljs: {
              ...(highlightTheme as Record<string, CSSProperties>).hljs,
              background: 'transparent',
              padding: 0,
            },
          }}
          customStyle={{
            ...sharedStyle,
            background: 'transparent',
            margin: 0,
            minHeight: 180,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'visible',
          }}
          showLineNumbers={false}
          wrapLines
        >
          {value + ' '}
        </SyntaxHighlighter>
      </div>
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={value}
        rows={8}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          resize();
        }}
        className={cn(
          'relative z-10 min-h-[180px] w-full resize-none bg-transparent font-mono text-xs',
          'text-transparent [caret-color:var(--foreground)]',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none',
        )}
        style={sharedStyle}
      />
    </div>
  );
}
