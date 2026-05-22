import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/styles';
import { ChevronDownIcon, ChevronUpIcon, RefreshCwIcon } from 'lucide-react';

const DEFAULT_W = 288;
const DEFAULT_H = 176;
const ASPECT = DEFAULT_H / DEFAULT_W; // locked height/width ratio
const MIN_W = 180;
const MAX_W = 720;

type LoveJsPreviewProps = {
  title: string;
  description: string;
  payload: Record<string, unknown>;
  className?: string;
  floating?: boolean;
};

export function LoveJsPreview({ title, description, payload, className, floating = false }: LoveJsPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadedRef = useRef(false);
  const payloadRef = useRef(payload);
  const [minimized, setMinimized] = useState(false);

  // Drag
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startMouseX: number; startMouseY: number; startTx: number; startTy: number } | null>(null);

  // Resize
  const [size, setSize] = useState({ w: 288, h: 176 });
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  payloadRef.current = payload;

  function sendPayload(p: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(
      { source: 'feather-showcase', type: 'preview:update', payload: p },
      '*',
    );
  }

  useEffect(() => {
    if (loadedRef.current) sendPayload(payload);
  }, [payload]);

  function handleLoad() {
    loadedRef.current = true;
    sendPayload(payloadRef.current);
  }

  function reloadPreview() {
    if (!iframeRef.current) return;
    loadedRef.current = false;
    iframeRef.current.contentWindow?.location.reload();
  }

  function onDragStart(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = { startMouseX: e.clientX, startMouseY: e.clientY, startTx: translate.x, startTy: translate.y };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setTranslate({
        x: dragRef.current.startTx + ev.clientX - dragRef.current.startMouseX,
        y: dragRef.current.startTy + ev.clientY - dragRef.current.startMouseY,
      });
    }
    function onUp() {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function onResizeStart(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };

    function onMove(ev: MouseEvent) {
      if (!resizeRef.current) return;
      const w = Math.max(MIN_W, Math.min(MAX_W, resizeRef.current.startW + ev.clientX - resizeRef.current.startX));
      setSize({ w, h: Math.round(w * ASPECT) });
    }
    function onUp() {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  if (floating) {
    return (
      <div
        className="absolute bottom-4 right-4 z-20 overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-sm"
        style={{ width: size.w, transform: `translate(${translate.x}px, ${translate.y}px)` }}
      >
        {/* drag handle / header */}
        <div
          className="flex cursor-grab items-center gap-2 border-b px-3 py-2 select-none active:cursor-grabbing"
          onMouseDown={onDragStart}
        >
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</span>
          <Badge variant="secondary" className="h-4 shrink-0 rounded-full px-1.5 text-[9px]">
            live
          </Badge>
          <Button size="icon" variant="ghost" className="size-5 shrink-0" title="Reload preview" onClick={reloadPreview}>
            <RefreshCwIcon className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-5 shrink-0"
            title={minimized ? 'Expand' : 'Minimise'}
            onClick={() => setMinimized((v) => !v)}
          >
            {minimized ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
          </Button>
        </div>

        {!minimized && (
          <div className="relative" style={{ height: size.h }}>
            <iframe
              ref={iframeRef}
              title={title}
              src="/showcase-lovejs/index.html?g=showcase.love&v=11.5"
              className="block h-full w-full border-0"
              onLoad={handleLoad}
            />
            {/* resize handle — bottom-right corner */}
            <div
              className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-se-resize"
              onMouseDown={onResizeStart}
            >
              <svg viewBox="0 0 16 16" className="h-full w-full text-foreground/30" fill="none">
                <line x1="5" y1="14" x2="14" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="14" x2="14" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="13" y1="14" x2="14" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className={cn('grid min-h-0 gap-3 rounded-md border bg-card p-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px]">
              love.js bridge
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={reloadPreview}>
          Reload
        </Button>
      </div>
      <div className="min-h-72 overflow-hidden rounded-md border bg-black">
        <iframe
          ref={iframeRef}
          title={title}
          src="/showcase-lovejs/index.html?g=showcase.love&v=11.5"
          className="h-full min-h-72 w-full border-0"
          onLoad={handleLoad}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        This iframe is the standalone preview boundary. Deployment must serve the love.js path with COOP/COEP and WASM
        CSP headers when the full 2dengine player is installed.
      </p>
    </section>
  );
}
