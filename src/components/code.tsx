import SyntaxHighlighter from 'react-syntax-highlighter';
import { ScrollArea } from '@/components/ui/scroll-area';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';

import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';

export function LuaBlock({ code, className }: { code: string; className?: string }) {
  const theme = useTheme();
  const style = theme === 'dark' ? onDark : oneLight;

  return (
    <ScrollArea className="mt-2 w-full rounded border bg-muted p-2 font-mono text-xs">
      <div className={cn('max-h-64', className)}>
        <SyntaxHighlighter
          wrapLines
          language="lua"
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          style={style}
          showLineNumbers
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </ScrollArea>
  );
}

export function TraceViewer({
  onFileClick,
  trace,
}: {
  onFileClick?: (file: string, line?: number) => void;
  trace: string;
}) {
  const highlightLine = (line: string, index: number) => {
    // Clickable file:line pattern
    const filePattern = /([\w./\\-]+\.lua):(\d+)/g;
    // "in function"
    const inFunctionPattern = /\bin function\b/g;
    // 'functionName'
    const quotedPattern = /'([^']+)'/g;

    const html = line
      .replace(
        filePattern,
        (_, file, lineNum) =>
          `<a href="${file}:${lineNum}" data-file="${file}" data-line="${lineNum}" style="cursor: pointer;" class="text-blue-500 underline hover:cursor-pointer">${file}:${lineNum}</a>`,
      )
      .replace(inFunctionPattern, `<span class="text-purple-500 font-medium">in function</span>`)
      .replace(quotedPattern, `<span class="text-green-500">'$1'</span>`);

    return (
      <div
        key={index}
        className="whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          e.preventDefault();
          const target = e.target as HTMLElement;

          if (target.tagName === 'A' && target.dataset.file) {
            onFileClick?.(target.dataset.file, target.dataset.line ? parseInt(target.dataset.line) : 1);
          }
        }}
      />
    );
  };

  return <div className="font-mono text-xs space-y-1">{trace.split('\n').map(highlightLine)}</div>;
}
