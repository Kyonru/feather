import { useEffect, useMemo, useRef, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type ShaderPreviewColor, useShaderGraph } from '@/hooks/use-shader-graph';
import type { ShaderParameter, ShaderPreviewShape } from '@/types/shader-graph';
import { useSessionStore } from '@/store/session';
import { useShaderGraphStore } from '@/store/shader-graph';
import { useTheme } from '@/hooks/use-theme';
import oneLight from '@/assets/theme/light';
import onDark from '@/assets/theme/dark';
import { cn } from '@/utils/styles';
import { toast } from 'sonner';
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, FolderOpenIcon, XIcon } from 'lucide-react';
import { codegen } from './codegen';
import { pickShaderTexture } from './textureUpload';
import type { ShaderGraphDiagnostic } from '@/types/shader-graph';

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

function colorFromHex(value: string): ShaderPreviewColor {
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return [1, 1, 1, 1];
  const int = Number.parseInt(match[1], 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255, 1];
}

type PreviewParams = {
  shape: ShaderPreviewShape;
  color: string;
  baseTexture: { filename: string; dataBase64: string } | null;
  parameters: ShaderParameter[];
  textures: { filename: string; dataBase64: string; uniform: string }[];
};

const diagnosticStyles: Record<ShaderGraphDiagnostic['severity'], string> = {
  error: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

function DiagnosticPanel({
  diagnostics,
  onSelectNode,
}: {
  diagnostics: ShaderGraphDiagnostic[];
  onSelectNode: (nodeId: string) => void;
}) {
  if (diagnostics.length === 0) return null;
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;

  return (
    <div className="border-b bg-muted/20 px-3 py-2 shrink-0" data-testid="shader-diagnostics">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Graph Diagnostics</span>
        <div className="flex items-center gap-1">
          {errorCount > 0 && <Badge className="h-4 rounded-full bg-red-500/15 px-1.5 text-[9px] text-red-600 dark:text-red-300">{errorCount} error{errorCount === 1 ? '' : 's'}</Badge>}
          {warningCount > 0 && <Badge className="h-4 rounded-full bg-yellow-500/15 px-1.5 text-[9px] text-yellow-700 dark:text-yellow-300">{warningCount} warning{warningCount === 1 ? '' : 's'}</Badge>}
        </div>
      </div>
      <div className="grid max-h-28 gap-1 overflow-y-auto">
        {diagnostics.map((diagnostic, index) => {
          const content = (
            <>
              <span className={cn('rounded border px-1 py-0.5 text-[9px] font-semibold uppercase', diagnosticStyles[diagnostic.severity])}>
                {diagnostic.severity}
              </span>
              {diagnostic.stage && <span className="text-[10px] uppercase text-muted-foreground">{diagnostic.stage}</span>}
              <span className="min-w-0 truncate text-[10px] text-foreground">{diagnostic.message}</span>
            </>
          );

          if (diagnostic.nodeId) {
            return (
              <button
                key={`${diagnostic.message}-${index}`}
                type="button"
                className="flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-muted"
                onClick={() => onSelectNode(diagnostic.nodeId!)}
              >
                {content}
              </button>
            );
          }

          return (
            <div key={`${diagnostic.message}-${index}`} className="flex min-w-0 items-center gap-1.5 rounded px-1 py-1">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CodePreview({
  standalone,
  onPreviewParamsChange,
}: {
  standalone?: boolean;
  onPreviewParamsChange?: (params: PreviewParams) => void;
} = {}) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const previewAvailable = !!sessionId || !!standalone;
  const {
    lastGeneratedGlsl,
    validationStatus,
    validationErrors,
    nodes,
    edges,
    subgraphs,
    textureUploads,
    diagnostics,
    hasBlockingGraphDiagnostics,
    selectNode,
    generateAndStore,
    validateShader,
    applyToPlayground,
    sendShaderPreview,
    clearPreview,
    playgroundTarget,
  } = useShaderGraph();
  const theme = useTheme();
  const hlTheme = theme === 'dark' ? onDark : oneLight;
  const [copied, setCopied] = useState(false);
  const previewShape = useShaderGraphStore((s) => s.previewShape);
  const previewColor = useShaderGraphStore((s) => s.previewColor);
  const baseTexture = useShaderGraphStore((s) => s.previewBaseTexture);
  const setPreviewShape = useShaderGraphStore((s) => s.setPreviewShape);
  const setPreviewColor = useShaderGraphStore((s) => s.setPreviewColor);
  const setBaseTexture = useShaderGraphStore((s) => s.setPreviewBaseTexture);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const sendShaderPreviewRef = useRef(sendShaderPreview);
  const onPreviewParamsChangeRef = useRef(onPreviewParamsChange);
  const debouncedNodes = useDebouncedValue(nodes, 180);
  const debouncedEdges = useDebouncedValue(edges, 180);
  const debouncedPreviewShape = useDebouncedValue(previewShape, 180);
  const debouncedPreviewColor = useDebouncedValue(previewColor, 180);

  const glsl = useMemo(
    () => lastGeneratedGlsl ?? codegen(nodes, edges, subgraphs),
    [edges, lastGeneratedGlsl, nodes, subgraphs],
  );
  const textureUniforms = useMemo(() => glsl.textures ?? [], [glsl.textures]);
  const uploadedUniformTextures = useMemo(
    () =>
      textureUniforms
        .map((texture) => {
          const upload = textureUploads[texture.nodeId];
          return upload ? { ...upload, uniform: texture.uniform } : null;
        })
        .filter((texture): texture is { filename: string; dataBase64: string; uniform: string } => !!texture),
    [textureUniforms, textureUploads],
  );
  const hasMissingTextureUploads = textureUniforms.some((texture) => !textureUploads[texture.nodeId]);
  const applyDisabledReason = hasBlockingGraphDiagnostics
    ? 'Fix blocking graph diagnostics before applying this shader'
    : hasMissingTextureUploads
      ? 'Upload all texture inputs in the node inspector before applying this shader'
      : undefined;
  const fullSource = glsl.vertex ? `${glsl.pixel}\n\n// -- Vertex \n${glsl.vertex}` : glsl.pixel;
  const rawValidationErrors = [validationErrors.pixelError, validationErrors.vertexError].filter(Boolean).join('\n\n');

  function handleCopy() {
    navigator.clipboard.writeText(fullSource).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handlePreviewToggle() {
    if (!previewAvailable || hasBlockingGraphDiagnostics) return;
    if (previewEnabled) {
      if (sessionId) await clearPreview();
      setPreviewEnabled(false);
      return;
    }
    setPreviewEnabled(true);
  }

  function handlePreviewShapeChange(value: string) {
    const nextShape = value as ShaderPreviewShape;
    setPreviewShape(nextShape);
  }

  async function uploadBaseTexture() {
    const texture = await pickShaderTexture();
    if (!texture) return;
    setBaseTexture(texture);
    toast.success(`Preview texture loaded: ${texture.filename}`);
  }

  function copyValidationErrors() {
    if (!rawValidationErrors) return;
    navigator.clipboard.writeText(rawValidationErrors).then(() => toast.success('Shader error copied'));
  }

  useEffect(() => {
    sendShaderPreviewRef.current = sendShaderPreview;
  }, [sendShaderPreview]);

  useEffect(() => {
    onPreviewParamsChangeRef.current = onPreviewParamsChange;
  }, [onPreviewParamsChange]);

  useEffect(() => {
    if (!sessionId && !standalone) {
      setPreviewEnabled(false);
    }
  }, [sessionId, standalone]);

  useEffect(() => {
    if (!standalone) return;
    onPreviewParamsChangeRef.current?.({
      shape: previewShape,
      color: previewColor,
      baseTexture,
      parameters: glsl.parameters ?? [],
      textures: uploadedUniformTextures,
    });
  }, [previewShape, previewColor, baseTexture, glsl.parameters, standalone, uploadedUniformTextures]);

  useEffect(() => {
    if (!sessionId || !previewEnabled) return;
    const nextGlsl = codegen(debouncedNodes, debouncedEdges, subgraphs);
    void sendShaderPreviewRef.current(nextGlsl, debouncedPreviewShape, colorFromHex(debouncedPreviewColor), {
      baseTexture,
      textures: uploadedUniformTextures,
    });
  }, [
    baseTexture,
    debouncedEdges,
    debouncedNodes,
    debouncedPreviewColor,
    debouncedPreviewShape,
    previewEnabled,
    sessionId,
    subgraphs,
    uploadedUniformTextures,
  ]);

  const statusColor = {
    idle: 'bg-muted text-muted-foreground',
    validating: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    ok: 'bg-green-500/20 text-green-600 dark:text-green-400',
    error: 'bg-red-500/20 text-red-600 dark:text-red-400',
  }[validationStatus];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GLSL Output</span>
        <div className="flex items-center gap-2">
          <Badge className={cn('text-[9px] h-4 px-1.5 rounded-full', statusColor)}>{validationStatus}</Badge>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center size-5 rounded hover:bg-muted text-muted-foreground transition-colors"
            title="Copy GLSL"
          >
            {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
          </button>
        </div>
      </div>

      <DiagnosticPanel diagnostics={diagnostics} onSelectNode={selectNode} />

      <ScrollArea className="flex-1 min-h-0">
        <SyntaxHighlighter
          language="glsl"
          breakLines
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
            width: '100%',
          }}
          showLineNumbers
          wrapLines
        >
          {fullSource}
        </SyntaxHighlighter>
      </ScrollArea>

      {(validationErrors.pixelError || validationErrors.vertexError) && (
        <div className="border-t px-3 py-2 shrink-0 bg-red-500/10">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
              Runtime Compile Error
            </span>
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-red-700 transition-colors hover:bg-red-500/10 dark:text-red-300"
              title="Copy raw shader error"
              onClick={copyValidationErrors}
            >
              <CopyIcon className="size-3" />
            </button>
          </div>
          {validationErrors.pixelError && (
            <p className="mb-1 text-[10px] font-semibold text-red-700 dark:text-red-300">Pixel stage failed</p>
          )}
          {validationErrors.pixelError && (
            <p className="text-[10px] text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-all">
              {validationErrors.pixelError}
            </p>
          )}
          {validationErrors.vertexError && (
            <p className="mb-1 mt-2 text-[10px] font-semibold text-red-700 dark:text-red-300">Vertex stage failed</p>
          )}
          {validationErrors.vertexError && (
            <p className="text-[10px] text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-all">
              {validationErrors.vertexError}
            </p>
          )}
        </div>
      )}

      <div className="border-t px-3 py-2 flex gap-2 shrink-0">
        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => generateAndStore()}>
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
          disabled={!sessionId || !playgroundTarget || hasMissingTextureUploads || hasBlockingGraphDiagnostics}
          title={applyDisabledReason}
          onClick={() => applyToPlayground(uploadedUniformTextures)}
        >
          Apply
        </Button>
      </div>

      <div className="border-t px-3 py-2 flex items-center gap-2 shrink-0">
        <Select value={previewShape} onValueChange={handlePreviewShapeChange} disabled={!previewAvailable}>
          <SelectTrigger className="h-7 min-w-0 flex-1 text-xs">
            <SelectValue aria-label={previewShape} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="circle">Circle</SelectItem>
            <SelectItem value="line">Line</SelectItem>
            <SelectItem value="rectangle">Rectangle</SelectItem>
          </SelectContent>
        </Select>
        <label
          className="relative size-7 shrink-0 overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-colors hover:bg-muted"
          title="Preview element color"
        >
          <span className="sr-only">Preview element color</span>
          <span className="absolute inset-1 rounded-sm" style={{ backgroundColor: previewColor }} />
          <input
            type="color"
            value={previewColor}
            disabled={!previewAvailable}
            onChange={(event) => setPreviewColor(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </label>
        <Button
          size="sm"
          variant={previewEnabled ? 'default' : 'outline'}
          className="h-7 text-xs px-2 min-w-24"
          disabled={!previewAvailable || hasBlockingGraphDiagnostics}
          onClick={() => void handlePreviewToggle()}
          title={
            hasBlockingGraphDiagnostics
              ? 'Fix blocking graph diagnostics before previewing this shader'
              : standalone
              ? 'Toggle shader preview in the isolated preview frame'
              : 'Toggle shader preview on a temporary shape in the running game'
          }
        >
          {previewEnabled ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
          {previewEnabled ? 'Preview Off' : 'Preview On'}
        </Button>
      </div>

      <div className="border-t px-3 py-2 grid gap-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preview Texture
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {baseTexture?.filename ?? 'Temporary shape texture'}
            </div>
          </div>
          <div className="flex gap-1">
            {baseTexture && (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="Clear preview texture"
                onClick={() => setBaseTexture(null)}
              >
                <XIcon className="size-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              title="Upload preview texture"
              disabled={!previewAvailable}
              onClick={() => void uploadBaseTexture()}
            >
              <FolderOpenIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
