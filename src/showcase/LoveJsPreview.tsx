import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/styles';

type LoveJsPreviewProps = {
  title: string;
  description: string;
  payload: Record<string, unknown>;
  className?: string;
};

export function LoveJsPreview({ title, description, payload, className }: LoveJsPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: 'feather-showcase',
        type: 'preview:update',
        payload,
      },
      '*',
    );
  }, [payload]);

  function reloadPreview() {
    if (!iframeRef.current) return;
    iframeRef.current.contentWindow?.location.reload();
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
          title={`${title} love.js preview`}
          src="/showcase-lovejs/index.html?g=showcase.love&v=11.5"
          className="h-full min-h-72 w-full border-0"
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        This iframe is the standalone preview boundary. Deployment must serve the love.js path with COOP/COEP and WASM
        CSP headers when the full 2dengine player is installed.
      </p>
    </section>
  );
}
