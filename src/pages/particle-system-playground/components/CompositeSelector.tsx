import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { PARTICLE_SYSTEM_PLAYGROUND_TEMPLATES, type ParticleSystemPlaygroundTemplate } from '@/types/particle-system-playground';

type Props = {
  composites: string[];
  activeComposite: string | null;
  compositeType?: 'scratch' | 'game';
  onSelect: (name: string) => void;
  onCreate: (name?: string, template?: ParticleSystemPlaygroundTemplate) => void;
  onDelete: () => void;
};

export function CompositeSelector({ composites, activeComposite, compositeType, onSelect, onCreate, onDelete }: Props) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<ParticleSystemPlaygroundTemplate>('fire');
  const [createOpen, setCreateOpen] = useState(false);

  const createComposite = () => {
    const trimmed = name.trim();
    onCreate(trimmed || undefined, template);
    setName('');
    setCreateOpen(false);
  };

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
          className="size-8 shrink-0"
          title="New composite"
          onClick={() => setCreateOpen(true)}
        >
          <PlusIcon className="size-4" />
        </Button>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Composite</DialogTitle>
            <DialogDescription>Name the particle effect you want to create.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              createComposite();
            }}
          >
            <Input
              autoFocus
              className="h-9 text-sm"
              placeholder="Explosion"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label className="grid gap-1 text-xs text-muted-foreground">
              Template
              <Select
                value={template}
                onValueChange={(value) => setTemplate(value as ParticleSystemPlaygroundTemplate)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTICLE_SYSTEM_PLAYGROUND_TEMPLATES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
