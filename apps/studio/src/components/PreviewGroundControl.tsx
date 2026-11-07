import { cn } from '@feather/ui';
import { useCallback, useState } from 'react';

export const PREVIEW_GROUNDS = ['dark', 'neutral', 'light', 'checker'] as const;
export type PreviewGround = (typeof PREVIEW_GROUNDS)[number];

const LABELS: Record<PreviewGround, string> = {
  dark: 'Dark',
  neutral: 'Neutral',
  light: 'Light',
  checker: 'Checker',
};

export function previewGroundClassName(ground: PreviewGround): string {
  return `preview-ground-${ground}`;
}

export function usePreviewGround(tool: string, initial: PreviewGround = 'neutral') {
  const storageKey = `feather-studio:preview-ground:${tool}`;
  const [ground, setGroundState] = useState<PreviewGround>(() => {
    try {
      const stored = globalThis.localStorage?.getItem(storageKey);
      return PREVIEW_GROUNDS.includes(stored as PreviewGround) ? (stored as PreviewGround) : initial;
    } catch {
      return initial;
    }
  });
  const setGround = useCallback(
    (next: PreviewGround) => {
      setGroundState(next);
      try {
        globalThis.localStorage?.setItem(storageKey, next);
      } catch (error) {
        console.warn(`[Feather] Could not persist ${tool} preview background:`, error);
      }
    },
    [storageKey, tool],
  );
  return [ground, setGround] as const;
}

export function PreviewGroundControl({
  value,
  onChange,
  className,
}: {
  value: PreviewGround;
  onChange: (ground: PreviewGround) => void;
  className?: string;
}) {
  return (
    <div className={cn('preview-ground-control', className)} role="group" aria-label="Preview background">
      {PREVIEW_GROUNDS.map((ground) => (
        <button
          key={ground}
          type="button"
          className={cn('preview-ground-swatch', previewGroundClassName(ground), value === ground && 'is-active')}
          aria-label={`${LABELS[ground]} preview background`}
          aria-pressed={value === ground}
          title={`${LABELS[ground]} preview background`}
          onClick={() => onChange(ground)}
        />
      ))}
    </div>
  );
}
