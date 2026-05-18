import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HOT_PARTICLES_TEMPLATES, type HotParticlesTemplate } from '@/types/hot-particles';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

type Props = {
  composites: string[];
  activeComposite: string | null;
  compositeType?: 'scratch' | 'game';
  onSelect: (name: string) => void;
  onCreate: (name?: string, template?: HotParticlesTemplate) => void;
  onDelete: () => void;
};

export function CompositeSelector({ composites, activeComposite, compositeType, onSelect, onCreate, onDelete }: Props) {
  const [name, setName] = useState('');

  return (
    <div className="grid gap-2 border-b p-3">
      <div className="flex gap-2">
        <Select value={activeComposite ?? ''} onValueChange={onSelect}>
          <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
            <SelectValue placeholder="No composites" />
          </SelectTrigger>
          <SelectContent>
            {composites.map((composite) => (
              <SelectItem key={composite} value={composite}>
                {composite}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="outline"
          className="size-8 shrink-0"
          title="Delete scratch composite"
          disabled={compositeType !== 'scratch'}
          onClick={onDelete}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs"
          placeholder="New composite"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          size="icon"
          className="size-8 shrink-0"
          title="New composite"
          onClick={() => {
            onCreate(name.trim() || undefined);
            setName('');
          }}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {HOT_PARTICLES_TEMPLATES.map((template) => (
          <Button
            key={template.value}
            size="sm"
            variant="outline"
            className="h-7 justify-start px-2 text-xs"
            onClick={() => {
              onCreate(name.trim() || undefined, template.value);
              setName('');
            }}
          >
            {template.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
