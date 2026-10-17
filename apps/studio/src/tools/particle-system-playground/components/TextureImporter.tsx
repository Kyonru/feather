import { Button } from '@feather/ui/button';
import { Input } from '@feather/ui/input';
import { Label } from '@feather/ui/label';
import { TEXTURE_PRESETS } from '@studio/types/particle-system-playground';
import { useHost } from '@feather/host';
import { FolderOpenIcon } from 'lucide-react';
import { TextureLabDialog } from '@studio/tools/texture-lab/TextureLabDialog';
import type { TextureLabAtlasMetadata } from '@studio/types/texture-lab';

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

type Props = {
  texturePath: string;
  texturePreset: string;
  textureFilename: string;
  onPreset: (preset: string) => void;
  onPath: (path: string) => void;
  onUpload: (filename: string, dataBase64: string, atlas?: TextureLabAtlasMetadata) => void;
};

export function TextureImporter({ texturePath, texturePreset, textureFilename, onPreset, onPath, onUpload }: Props) {
  const host = useHost();
  const current = texturePath || textureFilename || (texturePreset ? `preset:${texturePreset}` : 'No texture');

  // Previously refused on web ("available in the desktop app"). The host makes
  // the browser path work, so the refusal is gone.
  const pickFile = async () => {
    const file = await host.openBinaryFile({
      filterName: 'Images',
      extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tga'],
      testId: 'particle-texture-upload-input',
    });
    if (!file) return;
    onUpload(file.name, bytesToBase64(file.bytes));
  };

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Input className="h-8 min-w-0 flex-1 font-mono text-xs" value={current} readOnly />
        <Button size="icon" variant="outline" className="size-8" title="Import texture" onClick={pickFile}>
          <FolderOpenIcon className="size-4" />
        </Button>
        <TextureLabDialog
          triggerClassName="size-8"
          triggerTitle="Generate texture"
          triggerTestId="particle-texture-generate"
          applyLabel="Use for emitter"
          onApply={(texture) => onUpload(texture.filename, texture.dataBase64, texture.atlas)}
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-[10px] text-muted-foreground font-semibold">Game path</Label>
        <Input
          className="h-8 font-mono text-xs"
          placeholder="gfx/fire.png"
          defaultValue={texturePath}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value && value !== texturePath) onPath(value);
          }}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {TEXTURE_PRESETS.map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={texturePreset === preset && !texturePath ? 'default' : 'outline'}
            className="h-7 px-2 text-xs capitalize"
            onClick={() => onPreset(preset)}
          >
            {preset}
          </Button>
        ))}
      </div>
    </div>
  );
}
