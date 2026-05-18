import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangleIcon, EraserIcon, PlayIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  shaderPath: string;
  shaderFilename: string;
  shaderSource: string;
  error?: string;
  onApply: (params: { shaderPath?: string; shaderSource?: string; filename?: string; clearShader?: boolean }) => void;
};

export function ShaderEditor({ shaderPath, shaderFilename, shaderSource, error, onApply }: Props) {
  const [path, setPath] = useState(shaderPath);
  const [source, setSource] = useState(shaderSource);
  const [filename, setFilename] = useState(shaderFilename || 'shader.glsl');

  useEffect(() => {
    setPath(shaderPath);
    setSource(shaderSource);
    setFilename(shaderFilename || 'shader.glsl');
  }, [shaderFilename, shaderPath, shaderSource]);

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[1fr_10rem] gap-2">
        <div className="grid gap-1">
          <Label className="text-[10px] text-muted-foreground">Shader path</Label>
          <Input className="h-8 font-mono text-xs" value={path} onChange={(event) => setPath(event.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px] text-muted-foreground">Export file</Label>
          <Input className="h-8 font-mono text-xs" value={filename} onChange={(event) => setFilename(event.target.value)} />
        </div>
      </div>
      <Textarea
        className="min-h-36 resize-y font-mono text-xs"
        placeholder="vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) { return Texel(tex, texture_coords) * color; }"
        value={source}
        onChange={(event) => setSource(event.target.value)}
      />
      {error && (
        <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="h-8 gap-2 text-xs" onClick={() => onApply({ shaderSource: source, filename })}>
          <PlayIcon className="size-4" />
          Apply Source
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => path && onApply({ shaderPath: path })}>
          Apply Path
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-2 text-xs" onClick={() => onApply({ clearShader: true })}>
          <EraserIcon className="size-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}
