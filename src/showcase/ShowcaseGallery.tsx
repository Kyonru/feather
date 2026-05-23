import { useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/utils/styles';

type GalleryItem = {
  src: string;
  alt: string;
  caption?: string;
};

const GALLERY: GalleryItem[] = [
  { src: '/previews/shader-graph.png', alt: 'Shader Graph', caption: 'Shader Graph — visual GLSL node editor' },
  { src: '/previews/particles.png', alt: 'Particle Playground', caption: 'Particle System Playground' },
  { src: '/previews/assets.png', alt: 'Assets', caption: 'Asset browser' },
  { src: '/previews/observability.png', alt: 'Observability', caption: 'Observability dashboard' },
  { src: '/previews/performance.png', alt: 'Performance', caption: 'Performance profiler' },
  { src: '/previews/debug.png', alt: 'Debug', caption: 'Debug tools' },
  { src: '/previews/logs.png', alt: 'Logs', caption: 'Log viewer' },
  { src: '/previews/session-replay.png', alt: 'Session Replay', caption: 'Session replay' },
  { src: '/previews/bookmarks.png', alt: 'Bookmarks', caption: 'Bookmarks' },
  { src: '/previews/screenshots.png', alt: 'Screenshots', caption: 'Screenshot tools' },
];

export function ShowcaseGallery() {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = GALLERY.length;

  const go = (next: number) => {
    setIndex(((next % total) + total) % total);
  };

  useEffect(() => {
    if (total <= 1) return;
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % total), 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(index - 1);
      if (e.key === 'ArrowRight') go(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, total]);

  if (total === 0) return null;

  const item = GALLERY[index];

  return (
    <section className="grid gap-3">
      <div className="relative overflow-hidden rounded-lg border bg-card">
        <div className="aspect-video relative">
          {GALLERY.map((slide, i) => (
            <img
              key={slide.src}
              src={slide.src}
              alt={slide.alt}
              className={cn(
                'absolute inset-0 h-full w-full object-contain transition-opacity duration-400',
                i === index ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            />
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              aria-label="Previous screenshot"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow transition-colors hover:bg-background"
              onClick={() => go(index - 1)}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              aria-label="Next screenshot"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow transition-colors hover:bg-background"
              onClick={() => go(index + 1)}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-xs text-muted-foreground">{item.caption ?? item.alt}</span>
        {total > 1 && (
          <div className="flex shrink-0 gap-1.5">
            {GALLERY.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to screenshot ${i + 1}`}
                onClick={() => go(i)}
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  i === index ? 'bg-foreground' : 'bg-muted-foreground/30 hover:bg-muted-foreground/60',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
