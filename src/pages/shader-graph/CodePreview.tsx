import { useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useShaderGraph } from '@/hooks/use-shader-graph';
import { useSessionStore } from '@/store/session';
import { useTheme } from '@/hooks/use-theme';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';
import { cn } from '@/utils/styles';
import { CheckIcon, CopyIcon } from 'lucide-react';

export function CodePreview() {
  const sessionId = useSessionStore((s) => s.sessionId);
  const {
    lastGeneratedGlsl,
    validationStatus,
    validationErrors,
    generateAndStore,
    validateShader,
    applyToPlayground,
    playgroundTarget,
  } = useShaderGraph();
  const theme = useTheme();
  const hlTheme = theme === 'dark' ? onDark : oneLight;
  const [copied, setCopied] = useState(false);

  const glsl = lastGeneratedGlsl ?? generateAndStore();
  const fullSource = glsl.vertex
    ? `${glsl.pixel}\n\n// ── Vertex ──\n${glsl.vertex}`
    : glsl.pixel;

  function handleCopy() {
    navigator.clipboard.writeText(fullSource).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const statusColor = {
    idle: 'bg-muted text-muted-foreground',
    validating: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    ok: 'bg-green-500/20 text-green-600 dark:text-green-400',
    error: 'bg-red-500/20 text-red-600 dark:text-red-400',
  }[validationStatus];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          GLSL Output
        </span>
        <div className="flex items-center gap-2">
          <Badge className={cn('text-[9px] h-4 px-1.5 rounded-full', statusColor)}>
            {validationStatus}
          </Badge>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center size-5 rounded hover:bg-muted text-muted-foreground transition-colors"
            title="Copy GLSL"
          >
            {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <SyntaxHighlighter
          language="glsl"
          style={{
            ...hlTheme,
            hljs: {
              ...(hlTheme as Record<string, React.CSSProperties>).hljs,
              background: 'transparent',
              padding: 0,
            },
          }}
          customStyle={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '0.625rem',
            lineHeight: '1.6',
            padding: '12px',
            background: 'transparent',
            margin: 0,
          }}
          showLineNumbers
          wrapLines
        >
          {fullSource}
        </SyntaxHighlighter>
      </ScrollArea>

      {(validationErrors.pixelError || validationErrors.vertexError) && (
        <div className="border-t px-3 py-2 shrink-0 bg-red-500/10">
          {validationErrors.pixelError && (
            <p className="text-[10px] text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-all">
              {validationErrors.pixelError}
            </p>
          )}
          {validationErrors.vertexError && (
            <p className="text-[10px] text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-all">
              {validationErrors.vertexError}
            </p>
          )}
        </div>
      )}

      <div className="border-t px-3 py-2 flex gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs flex-1"
          onClick={() => generateAndStore()}
        >
          Generate
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs flex-1"
          disabled={!sessionId || validationStatus === 'validating'}
          onClick={() => validateShader()}
        >
          Validate
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs flex-1"
          disabled={!sessionId || !playgroundTarget}
          onClick={() => applyToPlayground()}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
