import { useEffect, useRef, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type ShaderPreviewShape, useShaderGraph } from '@/hooks/use-shader-graph';
import { useSessionStore } from '@/store/session';
import { useTheme } from '@/hooks/use-theme';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';
import { cn } from '@/utils/styles';
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from 'lucide-react';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

export function CodePreview() {
  const sessionId = useSessionStore((s) => s.sessionId);
  const {
    lastGeneratedGlsl,
    validationStatus,
    validationErrors,
    nodes,
    edges,
    generateAndStore,
    validateShader,
    applyToPlayground,
    previewShader,
    clearPreview,
    playgroundTarget,
  } = useShaderGraph();
  const theme = useTheme();
  const hlTheme = theme === 'dark' ? onDark : oneLight;
  const [copied, setCopied] = useState(false);
  const [previewShape, setPreviewShape] = useState<ShaderPreviewShape>('circle');
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const previewShaderRef = useRef(previewShader);
  const debouncedNodes = useDebouncedValue(nodes, 180);
  const debouncedEdges = useDebouncedValue(edges, 180);
  const debouncedPreviewShape = useDebouncedValue(previewShape, 180);

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

  async function handlePreviewToggle() {
    if (!sessionId) return;
    if (previewEnabled) {
      await clearPreview();
      setPreviewEnabled(false);
      return;
    }
    setPreviewEnabled(true);
  }

  function handlePreviewShapeChange(value: string) {
    const nextShape = value as ShaderPreviewShape;
    setPreviewShape(nextShape);
  }

  useEffect(() => {
    previewShaderRef.current = previewShader;
  }, [previewShader]);

  useEffect(() => {
    if (!sessionId) {
      setPreviewEnabled(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !previewEnabled) return;
    void previewShaderRef.current(debouncedPreviewShape);
  }, [debouncedEdges, debouncedNodes, debouncedPreviewShape, previewEnabled, sessionId]);

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

      <div className="border-t px-3 py-2 flex items-center gap-2 shrink-0">
        <Select
          value={previewShape}
          onValueChange={handlePreviewShapeChange}
          disabled={!sessionId}
        >
          <SelectTrigger className="h-7 min-w-0 flex-1 text-xs">
            <SelectValue aria-label={previewShape} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="circle">Circle</SelectItem>
            <SelectItem value="line">Line</SelectItem>
            <SelectItem value="rectangle">Rectangle</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={previewEnabled ? 'default' : 'outline'}
          className="h-7 text-xs px-2 min-w-24"
          disabled={!sessionId}
          onClick={() => void handlePreviewToggle()}
          title="Toggle shader preview on a temporary shape in the running game"
        >
          {previewEnabled ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
          {previewEnabled ? 'Preview Off' : 'Preview On'}
        </Button>
      </div>
    </div>
  );
}
