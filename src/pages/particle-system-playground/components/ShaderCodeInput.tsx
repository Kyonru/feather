import { useEffect, useRef } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { useTheme } from '@/hooks/use-theme';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';
import { cn } from '@/utils/styles';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.75rem',
  lineHeight: '1.5',
  padding: '8px 12px 8px 52px',
  tabSize: 2,
};

export function ShaderCodeInput({ value, onChange, placeholder, className }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const highlightTheme = theme === 'dark' ? onDark : oneLight;
  const lineCount = Math.max(1, value.split('\n').length);

  const syncScroll = () => {
    if (!textareaRef.current || !backdropRef.current) return;
    backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  useEffect(() => {
    syncScroll();
  }, [value]);

  return (
    <div
      className={cn(
        'relative min-h-48 overflow-hidden rounded-md border bg-background shadow-sm',
        'focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
    >
      <div ref={backdropRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-auto">
        <div
          className="absolute left-0 top-0 grid w-10 select-none justify-items-end pr-2 text-xs text-muted-foreground/55"
          style={{
            fontFamily: codeStyle.fontFamily,
            fontSize: codeStyle.fontSize,
            lineHeight: codeStyle.lineHeight,
            paddingTop: 8,
          }}
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <SyntaxHighlighter
          language="glsl"
          style={{
            ...highlightTheme,
            hljs: {
              ...(highlightTheme as Record<string, React.CSSProperties>).hljs,
              background: 'transparent',
              padding: 0,
            },
          }}
          customStyle={{
            ...codeStyle,
            minHeight: '12rem',
            background: 'transparent',
            margin: 0,
            whiteSpace: 'pre',
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
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        onScroll={syncScroll}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          event.preventDefault();
          const target = event.currentTarget;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const next = value.slice(0, start) + '  ' + value.slice(end);
          onChange(next);
          requestAnimationFrame(() => {
            target.selectionStart = start + 2;
            target.selectionEnd = start + 2;
          });
        }}
        className={cn(
          'relative z-10 min-h-48 w-full resize-y overflow-auto bg-transparent font-mono text-xs',
          'text-transparent [caret-color:var(--foreground)]',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none',
        )}
        style={codeStyle}
      />
    </div>
  );
}
