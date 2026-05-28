import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useParticleSystemPlayground } from '@/hooks/use-particle-system-playground';
import { useSettingsStore } from '@/store/settings';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { NodeCategory, NodeType } from '@/types/shader-graph';
import { cn } from '@/utils/styles';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_COLORS, CATEGORY_ORDER, CATEGORY_TOP_COLORS, NODE_DEFS } from './nodeDefs';

function categorySlug(category: NodeCategory): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function NodePalette() {
  const [search, setSearch] = useState('');
  const { playgroundTarget, setPlaygroundTarget } = useShaderGraphStore();
  const collapsedCategories = useSettingsStore((state) => state.collapsedShaderGraphNodeCategories);
  const toggleCategory = useSettingsStore((state) => state.toggleShaderGraphNodeCategory);
  const setCollapsedCategories = useSettingsStore((state) => state.setCollapsedShaderGraphNodeCategories);
  const { data } = useParticleSystemPlayground();

  const composites = data?.composites ?? [];

  const filtered = search.trim().toLowerCase();
  const isSearching = filtered.length > 0;
  const allCategories = CATEGORY_ORDER.map(({ category }) => category);
  const categoryRows = CATEGORY_ORDER
    .map(({ category, nodes }) => {
      const visible = nodes.filter((nodeType) => {
        const def = NODE_DEFS[nodeType];
        if (!filtered) return true;
        return (
          def.label.toLowerCase().includes(filtered) ||
          nodeType.toLowerCase().includes(filtered) ||
          category.toLowerCase().includes(filtered)
        );
      });

      return { category, nodes: visible, total: nodes.length };
    })
    .filter((row) => row.nodes.length > 0);

  function handleDragStart(event: React.DragEvent, nodeType: NodeType) {
    event.dataTransfer.setData('application/shader-node-type', nodeType);
    event.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <div data-testid="shader-node-palette" className="flex h-full flex-col gap-0 overflow-hidden">
      <div className="grid gap-2 p-3">
        <Input
          className="h-7 text-xs"
          placeholder="Search nodes…"
          aria-label="Search shader nodes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={() => setCollapsedCategories([])}
          >
            <ChevronDownIcon className="size-3" />
            Expand all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={() => setCollapsedCategories(allCategories)}
          >
            <ChevronRightIcon className="size-3" />
            Collapse all
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {categoryRows.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            No shader nodes match this search.
          </div>
        ) : (
          categoryRows.map(({ category, nodes, total }) => {
            const savedCollapsed = collapsedCategories.includes(category);
            const open = isSearching || !savedCollapsed;
            const colorClass = CATEGORY_COLORS[category];
            const topColorClass = CATEGORY_TOP_COLORS[category];
            const slug = categorySlug(category);
            const countLabel = nodes.length === total ? String(total) : `${nodes.length}/${total}`;

            return (
              <Collapsible
                key={category}
                open={open}
                onOpenChange={(nextOpen) => {
                  if (isSearching) return;
                  if (nextOpen === open) return;
                  toggleCategory(category);
                }}
                className={cn(
                  'mb-2 rounded-md border bg-background/70',
                  open ? 'border-t-2' : 'border-l-2',
                  open ? topColorClass : colorClass,
                )}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    data-testid={`shader-node-category-toggle-${slug}`}
                    className="flex h-8 w-full items-center gap-2 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={
                      isSearching
                        ? 'Search keeps matching categories open'
                        : open
                          ? 'Collapse node category'
                          : 'Expand node category'
                    }
                  >
                    {open ? (
                      <ChevronDownIcon className="size-3.5 shrink-0" />
                    ) : (
                      <ChevronRightIcon className="size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{category}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {countLabel}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent data-testid={`shader-node-category-content-${slug}`}>
                  <div className="grid gap-0.5 px-1 pb-1">
                    {nodes.map((nodeType) => {
                      const def = NODE_DEFS[nodeType];
                      return (
                        <button
                          type="button"
                          key={nodeType}
                          draggable
                          onDragStart={(e) => handleDragStart(e, nodeType)}
                          className={cn(
                            'cursor-grab rounded border border-l-2 bg-card px-2 py-1 text-xs select-none hover:bg-muted/50 active:cursor-grabbing',
                            colorClass,
                          )}
                        >
                          {def.label}
                        </button>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })
        )}
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
