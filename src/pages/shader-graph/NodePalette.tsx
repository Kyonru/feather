import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useParticleSystemPlayground } from '@/hooks/use-particle-system-playground';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { NodeType } from '@/types/shader-graph';
import { useState } from 'react';
import { CATEGORY_COLORS, CATEGORY_ORDER, NODE_DEFS } from './nodeDefs';

export function NodePalette() {
  const [search, setSearch] = useState('');
  const { playgroundTarget, setPlaygroundTarget } = useShaderGraphStore();
  const { data } = useParticleSystemPlayground();

  const composites = data?.composites ?? [];

  const filtered = search.trim().toLowerCase();

  function handleDragStart(event: React.DragEvent, nodeType: NodeType) {
    event.dataTransfer.setData('application/shader-node-type', nodeType);
    event.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <div className="flex h-full flex-col gap-0 overflow-hidden">
      <div className="p-3">
        <Input
          className="h-7 text-xs"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {CATEGORY_ORDER.map(({ category, nodes }) => {
          const visible = nodes.filter((n) => {
            const def = NODE_DEFS[n];
            return !filtered || def.label.toLowerCase().includes(filtered);
          });
          if (visible.length === 0) return null;
          return (
            <div key={category} className="mb-3">
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </div>
              <div className="grid gap-0.5">
                {visible.map((nodeType) => {
                  const def = NODE_DEFS[nodeType];
                  const colorClass = CATEGORY_COLORS[category] ?? 'border-l-gray-500';
                  return (
                    <button
                      type="button"
                      key={nodeType}
                      draggable
                      onDragStart={(e) => handleDragStart(e, nodeType)}
                      className={`cursor-grab rounded border border-l-2 bg-card px-2 py-1 text-xs select-none hover:bg-muted/50 active:cursor-grabbing ${colorClass}`}
                    >
                      {def.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {composites.length > 0 && (
        <>
          <Separator />
          <div className="p-3 grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Apply Target
            </span>
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">Composite</Label>
              <Select
                value={playgroundTarget?.composite ?? 'none'}
                onValueChange={(value) =>
                  setPlaygroundTarget(
                    value !== 'none'
                      ? { composite: value, systemIndex: playgroundTarget?.systemIndex ?? 1 }
                      : null,
                  )
                }
              >
                <SelectTrigger className="h-7 w-full text-xs">
                  <SelectValue placeholder="Select composite" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {composites.map((composite) => (
                    <SelectItem key={composite} value={composite}>
                      {composite}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {playgroundTarget?.composite && (
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Emitter Index</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  min={1}
                  value={playgroundTarget.systemIndex}
                  onChange={(e) =>
                    setPlaygroundTarget({
                      ...playgroundTarget,
                      systemIndex: Number(e.target.value),
                    })
                  }
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
