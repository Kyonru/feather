import { useEffect, useMemo, useRef, useState } from 'react';
import { MonitorOffIcon, MonitorPlayIcon, PinIcon, PinOffIcon, RefreshCwIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/store/session';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { ShaderTextureUpload } from '@/types/shader-graph';
import { stripLovePreviewUploads } from '@/utils/love-preview-upload-bridge';
import { previewProbeCodegen, type PreviewProbeGlsl } from './codegen';
import { shaderGraphGamePreviewController } from './gamePreviewController';

type Status = 'idle' | 'sending' | 'live' | 'error';

type Props = {
  nodeId: string;
  active: boolean;
  pinned: boolean;
};

const NODE_PREVIEW_ASPECT_CLASS = 'aspect-video w-full';
const PREVIEW_ASSET_VERSION = 'shader-node-preview-v10';

function colorFromHex(value: string): [number, number, number, number] {
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return [1, 1, 1, 1];
  const int = Number.parseInt(match[1], 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255, 1];
}

function missingTextures(
  probe: PreviewProbeGlsl | null,
  textureUploads: Record<string, ShaderTextureUpload>,
): string[] {
  if (!probe?.textures) return [];
  return probe.textures.filter((texture) => !textureUploads[texture.nodeId]).map((texture) => texture.label);
}

function texturePayload(
  probe: PreviewProbeGlsl | null,
  textureUploads: Record<string, ShaderTextureUpload>,
) {
  return probe?.textures
    ?.map((texture) => {
      const upload = textureUploads[texture.nodeId];
      return upload ? { ...upload, uniform: texture.uniform } : null;
    })
    .filter((texture): texture is ShaderTextureUpload & { uniform: string } => Boolean(texture)) ?? [];
}

function InactiveLoveNodePreview({ pinned, onTogglePin }: Pick<Props, 'pinned'> & { onTogglePin: () => void }) {
  return (
    <div className="nodrag nopan mt-2 overflow-hidden rounded border bg-black/95" data-testid="shader-preview-probe">
      <div className="flex h-6 items-center gap-1 border-b border-white/10 bg-card/95 px-1.5">
        <span className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground">paused</span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5 shrink-0 text-muted-foreground"
          title={pinned ? 'Unpin this preview' : 'Pin this preview open'}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onTogglePin();
          }}
        >
          {pinned ? <PinOffIcon className="size-3" /> : <PinIcon className="size-3" />}
        </Button>
      </div>
      <div className={`grid ${NODE_PREVIEW_ASPECT_CLASS} place-items-center bg-black/80 p-2 text-center text-[10px] text-muted-foreground`}>
        Select or pin this probe to render its love.js preview.
      </div>
    </div>
  );
}

function ActiveLoveNodePreview({ nodeId, pinned }: Pick<Props, 'nodeId' | 'pinned'>) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const nodes = useShaderGraphStore((s) => s.nodes);
  const edges = useShaderGraphStore((s) => s.edges);
  const subgraphs = useShaderGraphStore((s) => s.subgraphs);
  const activeSubgraphId = useShaderGraphStore((s) => s.activeSubgraphId);
  const textureUploads = useShaderGraphStore((s) => s.textureUploads);
  const previewShape = useShaderGraphStore((s) => s.previewShape);
  const previewColor = useShaderGraphStore((s) => s.previewColor);
  const baseTexture = useShaderGraphStore((s) => s.previewBaseTexture);
  const previewZoom = useShaderGraphStore((s) => s.previewZoom);
  const setPreviewZoom = useShaderGraphStore((s) => s.setPreviewZoom);
  const togglePinnedPreviewNode = useShaderGraphStore((s) => s.togglePinnedPreviewNode);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadedRef = useRef(false);
  const payloadRef = useRef<Record<string, unknown>>({ tool: 'idle' });
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const previewSrc = `${import.meta.env.BASE_URL}showcase-lovejs/webgl.html?featherPreview=${PREVIEW_ASSET_VERSION}`;
  const activeSubgraph = activeSubgraphId ? subgraphs.find((subgraph) => subgraph.id === activeSubgraphId) : null;
  const graphNodes = activeSubgraph?.nodes ?? nodes;
  const graphEdges = activeSubgraph?.edges ?? edges;
  const probe = useMemo(
    () => previewProbeCodegen(graphNodes, graphEdges, subgraphs, nodeId),
    [graphEdges, graphNodes, nodeId, subgraphs],
  );
  const missing = missingTextures(probe, textureUploads);
  const textures = useMemo(() => texturePayload(probe, textureUploads), [probe, textureUploads]);
  const canPreview = Boolean(probe?.connected && missing.length === 0);
  const payload = useMemo(() => ({
    tool: 'shader-graph',
    shaderName: probe?.nodeLabel ?? 'Preview',
    pixel: canPreview ? probe?.pixel : '',
    vertex: canPreview ? (probe?.vertex ?? '') : '',
    previewShape,
    previewColor,
    baseTexture,
    textureUniforms: probe?.textures ?? [],
    parameters: probe?.parameters ?? [],
    textures,
    previewZoom,
  }), [baseTexture, canPreview, previewColor, previewShape, previewZoom, probe, textures]);

  payloadRef.current = payload;

  function sendPayload(nextPayload = payloadRef.current) {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: 'feather-showcase',
        type: 'preview:update',
        payload: stripLovePreviewUploads(nextPayload, { stripBaseTexture: false, stripTextures: false }),
      },
      '*',
    );
  }

  useEffect(() => {
    if (loadedRef.current) sendPayload(payload);
  }, [payload]);

  useEffect(() => {
    function handlePreviewMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.source !== 'feather-showcase' || event.data?.type !== 'preview:ready') return;
      loadedRef.current = true;
      sendPayload();
    }

    window.addEventListener('message', handlePreviewMessage);
    return () => window.removeEventListener('message', handlePreviewMessage);
  }, []);

  useEffect(() => {
    if (!sessionId) setStatus('idle');
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || status !== 'live') return;
    const activeSession = sessionId;
    return () => {
      void shaderGraphGamePreviewController.clear(activeSession);
    };
  }, [sessionId, status]);

  function handleLoad() {
    loadedRef.current = true;
    sendPayload();
  }

  function reloadPreview() {
    if (!iframeRef.current) return;
    loadedRef.current = false;
    iframeRef.current.contentWindow?.location.reload();
  }

  function zoomOut() {
    setPreviewZoom(previewZoom - 0.25);
  }

  function zoomIn() {
    setPreviewZoom(previewZoom + 0.25);
  }

  async function toggleGamePreview() {
    if (!sessionId) return;
    setStatus('sending');
    setError(null);
    try {
      if (status === 'live') {
        await shaderGraphGamePreviewController.clear(sessionId);
        setStatus('idle');
        return;
      }

      if (!probe || !canPreview) {
        setStatus('idle');
        return;
      }

      await shaderGraphGamePreviewController.preview(sessionId, {
        pixelSource: probe.pixel,
        vertexSource: probe.vertex ?? '',
        shape: previewShape,
        color: colorFromHex(previewColor),
        baseTexture,
        textureUniforms: probe.textures ?? [],
        parameters: probe.parameters ?? [],
        textures,
        previewZoom,
      });
      setStatus('live');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to send preview to LÖVE runtime.');
    }
  }

  const fallback = !probe?.connected
    ? (probe?.message ?? 'Connect an RGBA input.')
    : missing.length > 0
      ? `Upload texture: ${missing[0]}`
      : null;

  return (
    <div className="nodrag nopan mt-2 overflow-hidden rounded border bg-black/95" data-testid="shader-preview-probe">
      <div className="flex h-6 items-center gap-1 border-b border-white/10 bg-card/95 px-1.5">
        <span className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground">
          {status === 'error' ? (error ?? 'Runtime preview failed.') : status === 'live' ? 'Sent to game' : 'love.js'}
        </span>
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
          {Math.round(previewZoom * 100)}%
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5 shrink-0 text-muted-foreground"
          title="Zoom preview out"
          disabled={previewZoom <= 0.4}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            zoomOut();
          }}
        >
          <ZoomOutIcon className="size-3" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5 shrink-0 text-muted-foreground"
          title="Zoom preview in"
          disabled={previewZoom >= 2.5}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            zoomIn();
          }}
        >
          <ZoomInIcon className="size-3" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5 shrink-0 text-muted-foreground"
          title={pinned ? 'Unpin this preview' : 'Pin this preview open'}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePinnedPreviewNode(nodeId);
          }}
        >
          {pinned ? <PinOffIcon className="size-3" /> : <PinIcon className="size-3" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5 shrink-0 text-muted-foreground"
          title="Reload node preview"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            reloadPreview();
          }}
        >
          <RefreshCwIcon className="size-3" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5 shrink-0 text-muted-foreground"
          title={
            sessionId
              ? status === 'live'
                ? 'Turn off this probe preview in the connected game'
                : 'Preview this probe in the connected game'
              : 'Connect a LÖVE session to preview in game'
          }
          disabled={!sessionId || (status !== 'live' && !canPreview) || status === 'sending'}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void toggleGamePreview();
          }}
        >
          {status === 'live' ? <MonitorOffIcon className="size-3" /> : <MonitorPlayIcon className="size-3" />}
        </Button>
      </div>
      <div className={`relative ${NODE_PREVIEW_ASPECT_CLASS}`}>
        {canPreview && (
          <iframe
            ref={iframeRef}
            title={`${probe?.nodeLabel ?? 'Preview'} love.js preview`}
            src={previewSrc}
            className="block h-full w-full border-0"
            onLoad={handleLoad}
          />
        )}
        {fallback && (
          <div className="absolute inset-0 grid place-items-center bg-black/80 p-2 text-center text-[10px] text-muted-foreground">
            {fallback}
          </div>
        )}
      </div>
    </div>
  );
}

export function LoveNodePreview({ nodeId, active, pinned }: Props) {
  const togglePinnedPreviewNode = useShaderGraphStore((s) => s.togglePinnedPreviewNode);
  if (!active) {
    return <InactiveLoveNodePreview pinned={pinned} onTogglePin={() => togglePinnedPreviewNode(nodeId)} />;
  }
  return <ActiveLoveNodePreview nodeId={nodeId} pinned={pinned} />;
}
