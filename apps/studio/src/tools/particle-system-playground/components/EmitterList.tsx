import { useState } from 'react';
import { Badge } from '@feather/ui/badge';
import { Button } from '@feather/ui/button';
import { cn } from '@feather/ui';
import type { ParticleSystemPlaygroundSystem } from '@studio/types/particle-system-playground';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, PlusIcon, Trash2Icon } from 'lucide-react';

const DND_KEY = 'emitter-index';

type Props = {
  systems: ParticleSystemPlaygroundSystem[];
  activeIndex: number;
  isGameComposite: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

export function EmitterList({ systems, activeIndex, isGameComposite, onSelect, onAdd, onRemove, onReorder }: Props) {
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  function reorder(fromIndex: number, toIndex: number) {
    const fromPosition = systems.findIndex((system) => system.index === fromIndex);
    const toPosition = systems.findIndex((system) => system.index === toIndex);
    if (fromPosition < 0 || toPosition < 0 || fromPosition === toPosition) return;
    const moved = systems[fromPosition];
    onReorder(fromIndex, toIndex);
    onSelect(toIndex);
    setAnnouncement(`Moved ${moved.title} to emitter ${toPosition + 1} of ${systems.length}.`);
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DND_KEY, String(index));
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    if (!e.dataTransfer.types.includes(DND_KEY)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIndex(index);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear when leaving the row entirely, not when entering a child element
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
      setOverIndex(null);
    }
  }

  function handleDrop(e: React.DragEvent, toSystemIndex: number) {
    e.preventDefault();
    setOverIndex(null);
    const raw = e.dataTransfer.getData(DND_KEY);
    if (!raw) return;
    const fromSystemIndex = Number(raw);
    if (fromSystemIndex !== toSystemIndex) {
      reorder(fromSystemIndex, toSystemIndex);
    }
  }

  function handleDragEnd() {
    setOverIndex(null);
  }

  return (
    <div className="grid gap-1 p-2">
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      {systems.map((system, position) => {
        const active = system.index === activeIndex;
        const isDragTarget = overIndex === system.index;
        const disabled = system.enabled === false;
        return (
          <div
            key={system.index}
            data-testid={`particle-emitter-row-${system.index}`}
            draggable={!isGameComposite}
            onDragStart={(e) => handleDragStart(e, system.index)}
            onDragOver={(e) => handleDragOver(e, system.index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, system.index)}
            onDragEnd={handleDragEnd}
            className={cn(
              'group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded text-xs transition-colors',
              active
                ? 'bg-muted text-foreground ring-1 ring-inset ring-border'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              isDragTarget && 'ring-2 ring-primary ring-offset-1',
              disabled && !active && 'opacity-55',
            )}
          >
            {!isGameComposite && (
              <span
                aria-hidden="true"
                className={cn(
                  'ml-1 flex size-5 shrink-0 cursor-grab items-center justify-center rounded opacity-0 group-hover:opacity-60 active:cursor-grabbing',
                  active && 'opacity-60',
                )}
              >
                <GripVerticalIcon className="size-3.5" />
              </span>
            )}
            {isGameComposite && <span className="ml-1 w-1" />}
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 text-left"
              aria-label={`Select emitter ${system.index}: ${system.title}${disabled ? ', disabled' : ''}`}
              onClick={() => onSelect(system.index)}
            >
              <span className="flex size-6 items-center justify-center rounded border bg-background/20 font-mono text-[10px]">
                {system.index}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{system.title}</span>
                <span
                  className={cn(
                    'block truncate text-[10px]',
                    'text-muted-foreground',
                  )}
                >
                  {disabled ? 'Disabled' : `${system.properties.count ?? 0} / ${system.properties.bufferSize ?? 0}`}
                </span>
              </span>
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-[10px]"
              >
                {system.blendMode}
              </Badge>
            </button>
            {!isGameComposite && (
              <div className="mr-1 flex shrink-0 items-center">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Move ${system.title} up`}
                  title="Move emitter up"
                  disabled={position === 0}
                  onClick={() => reorder(system.index, systems[position - 1]!.index)}
                >
                  <ArrowUpIcon className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Move ${system.title} down`}
                  title="Move emitter down"
                  disabled={position === systems.length - 1}
                  onClick={() => reorder(system.index, systems[position + 1]!.index)}
                >
                  <ArrowDownIcon className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${system.title}`}
                  title={systems.length > 1 ? 'Delete emitter' : 'A composite needs at least one emitter'}
                  disabled={systems.length <= 1}
                  onClick={() => onRemove(system.index)}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {!isGameComposite && (
        <Button variant="ghost" size="sm" className="mt-1 h-8 justify-start gap-2 text-xs" onClick={onAdd}>
          <PlusIcon className="size-4" />
          Add Emitter
        </Button>
      )}
    </div>
  );
}
