import { useState } from 'react';
import { WandSparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { GeneratedTextureResult } from '@/types/texture-lab';
import { TextureLabPanel } from './TextureLabPanel';

type TextureLabDialogProps = {
  title?: string;
  applyLabel?: string;
  disabled?: boolean;
  onApply: (texture: GeneratedTextureResult) => void;
  triggerClassName?: string;
  triggerTitle?: string;
  triggerTestId?: string;
};

export function TextureLabDialog({
  title = 'Generate Texture',
  applyLabel = 'Use texture',
  disabled = false,
  onApply,
  triggerClassName,
  triggerTitle = 'Generate texture',
  triggerTestId,
}: TextureLabDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={triggerClassName}
          title={triggerTitle}
          disabled={disabled}
          data-testid={triggerTestId}
        >
          <WandSparklesIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Create a tiny procedural PNG and send it into this texture slot.</DialogDescription>
        </DialogHeader>
        <TextureLabPanel
          compact
          applyLabel={applyLabel}
          onApply={(texture) => {
            onApply(texture);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
