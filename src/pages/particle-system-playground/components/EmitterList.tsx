import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/styles';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { GripVerticalIcon, PlusIcon, Trash2Icon } from 'lucide-react';

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
      onReorder(fromSystemIndex, toSystemIndex);
      onSelect(toSystemIndex);
      setTimeout(() => {
        onSelect(toSystemIndex);
      }, 0); // Delay to allow state update before selecting
    }
  }

  function handleDragEnd() {
    setOverIndex(null);
  }

  return (
    <div className="grid gap-1 p-2">
      {systems.map((system) => {
        const active = system.index === activeIndex;
        const isDragTarget = overIndex === system.index;
        return (
          <div
            key={system.index}
            draggable={!isGameComposite}
            onDragStart={(e) => handleDragStart(e, system.index)}
            onDragOver={(e) => handleDragOver(e, system.index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, system.index)}
            onDragEnd={handleDragEnd}
            className={cn(
              'group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded text-xs transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              isDragTarget && 'ring-2 ring-primary ring-offset-1',
            )}
          >
            {!isGameComposite && (
              <span
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
              className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 text-left"
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
                    active ? 'text-primary-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {system.properties.count ?? 0} / {system.properties.bufferSize ?? 0}
                </span>
              </span>
              <Badge
                variant="outline"
                className={cn('h-5 px-1.5 text-[10px]', active && 'border-primary-foreground/40')}
              >
                {system.blendMode}
              </Badge>
            </button>
            {!isGameComposite && (
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  'mr-1 size-7 shrink-0',
                  active
                    ? 'text-primary-foreground/80 hover:text-primary-foreground'
                    : 'text-muted-foreground hover:text-destructive',
                )}
                title={systems.length > 1 ? 'Delete emitter' : 'A composite needs at least one emitter'}
                disabled={systems.length <= 1}
                onClick={() => onRemove(system.index)}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
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
