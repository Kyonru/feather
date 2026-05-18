import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/styles';
import type { HotParticlesSystem } from '@/types/hot-particles';
import { PlusIcon, Trash2Icon } from 'lucide-react';

type Props = {
  systems: HotParticlesSystem[];
  activeIndex: number;
  isGameComposite: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

export function EmitterList({ systems, activeIndex, isGameComposite, onSelect, onAdd, onRemove }: Props) {
  return (
    <div className="grid gap-1 p-2">
      {systems.map((system) => {
        const active = system.index === activeIndex;
        return (
          <button
            key={system.index}
            className={cn(
              'group grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-2 text-left text-xs',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => onSelect(system.index)}
          >
            <span className="flex size-6 items-center justify-center rounded border bg-background/20 font-mono text-[10px]">
              {system.index}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{system.title}</span>
              <span className={cn('block truncate text-[10px]', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                {system.properties.count ?? 0} / {system.properties.bufferSize ?? 0}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', active && 'border-primary-foreground/40')}>
                {system.blendMode}
              </Badge>
              {!isGameComposite && systems.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 opacity-0 group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(system.index);
                  }}
                >
                  <Trash2Icon className="size-3" />
                </Button>
              )}
            </span>
          </button>
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
