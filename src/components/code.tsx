import SyntaxHighlighter from 'react-syntax-highlighter';
import { ScrollArea } from '@/components/ui/scroll-area';
import oneLight from '@/assets/theme/light';
import { cn } from '@/lib/utils';

export function LuaBlock({ code, className }: { code: string; className?: string }) {
  return (
    <ScrollArea className="mt-2 w-full rounded border bg-muted p-2 font-mono text-xs">
      <div className={cn('max-h-64', className)}>
        <SyntaxHighlighter
          wrapLines
          language="lua"
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          style={oneLight}
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
  basePath,
}: {
  onFileClick?: (file: string, line?: number) => void;
  trace: string;
  basePath: string;
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
          `<a href="vscode://file/${basePath}/${file}:${lineNum}" class="text-blue-500 underline">${file}:${lineNum}</a>`,
      )
      .replace(inFunctionPattern, `<span class="text-purple-500 font-medium">in function</span>`)
      .replace(quotedPattern, `<span class="text-green-500">'$1'</span>`);

    return (
      <div
        key={index}
        className="whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'A' && target.dataset.file) {
            e.preventDefault();
            onFileClick?.(target.dataset.file, target.dataset.line ? parseInt(target.dataset.line) : undefined);
          }
        }}
      />
    );
  };

  return <div className="font-mono text-xs space-y-1">{trace.split('\n').map(highlightLine)}</div>;
}
