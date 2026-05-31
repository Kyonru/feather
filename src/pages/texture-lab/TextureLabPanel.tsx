import { useMemo } from 'react';
import {
  Dice5Icon,
  DownloadIcon,
  ImageIcon,
  RefreshCwIcon,
  SendIcon,
  SparklesIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettingsStore } from '@/store/settings';
import {
  TEXTURE_LAB_ALPHA_MODES,
  TEXTURE_LAB_COLOR_RAMPS,
  TEXTURE_LAB_SIZES,
  type GeneratedTextureResult,
  type TextureLabRecipe,
} from '@/types/texture-lab';
import { cn } from '@/utils/styles';
import { downloadFile } from '@/utils/file';
import {
  generateTextureLabTexture,
  renderTextureLabPixels,
  textureLabPixelsToDataUrl,
  TEXTURE_LAB_GENERATORS,
} from './generator';

type TextureLabPanelProps = {
  compact?: boolean;
  applyLabel?: string;
  applyDisabled?: boolean;
  onApply?: (texture: GeneratedTextureResult) => void;
};

const NUMBER_CONTROLS: Array<{
  key: keyof Pick<TextureLabRecipe, 'softness' | 'falloff' | 'contrast' | 'threshold' | 'scale' | 'distortion'>;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'softness', label: 'Softness', min: 0, max: 1, step: 0.01 },
  { key: 'falloff', label: 'Falloff', min: 0.1, max: 6, step: 0.1 },
  { key: 'contrast', label: 'Contrast', min: 0.1, max: 4, step: 0.1 },
  { key: 'threshold', label: 'Threshold', min: 0, max: 1, step: 0.01 },
  { key: 'scale', label: 'Scale', min: 1, max: 32, step: 1 },
  { key: 'distortion', label: 'Distortion', min: 0, max: 1, step: 0.01 },
];

function formatLabel(value: string): string {
  return value
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function randomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return (values[0] % 999_999) + 1;
  }
  return Math.floor(Math.random() * 999_999) + 1;
}

function useTextureLabRecipe() {
  const recipe = useSettingsStore((state) => state.textureLabRecipe);
  const setRecipe = useSettingsStore((state) => state.setTextureLabRecipe);
  return {
    recipe,
    setRecipe,
    patch: (patch: Partial<TextureLabRecipe>) => setRecipe({ ...recipe, ...patch }),
  };
}

export function TextureLabPanel({ compact = false, applyLabel = 'Use texture', applyDisabled = false, onApply }: TextureLabPanelProps) {
  const { recipe, patch } = useTextureLabRecipe();
  const pixels = useMemo(() => renderTextureLabPixels(recipe), [recipe]);
  const dataUrl = useMemo(() => textureLabPixelsToDataUrl(pixels), [pixels]);
  const selectedGenerator = TEXTURE_LAB_GENERATORS.find((item) => item.id === recipe.generator) ?? TEXTURE_LAB_GENERATORS[0];
  const groupedGenerators = useMemo(
    () =>
      TEXTURE_LAB_GENERATORS.reduce<Record<string, typeof TEXTURE_LAB_GENERATORS>>((groups, generator) => {
        groups[generator.category] = [...(groups[generator.category] ?? []), generator];
        return groups;
      }, {}),
    [],
  );

  const createTexture = () => generateTextureLabTexture(recipe);

  const exportTexture = () => {
    const texture = createTexture();
    void downloadFile(texture.filename, texture.dataBase64, 'base64');
  };

  const applyTexture = () => {
    if (!onApply) return;
    const texture = createTexture();
    onApply(texture);
    toast.success(`${texture.filename} applied`);
  };

  return (
    <div className={cn('grid min-h-0 gap-4', compact ? 'text-xs' : 'lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]')}>
      <section className="grid min-h-0 gap-3 rounded-md border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <SparklesIcon className="size-3.5" />
              Texture Lab
            </div>
            <h2 className={cn('truncate font-semibold', compact ? 'text-sm' : 'text-xl')}>{selectedGenerator.label}</h2>
            <p className="text-xs text-muted-foreground">{selectedGenerator.description}</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            title="Randomize seed"
            onClick={() => patch({ seed: randomSeed() })}
          >
            <Dice5Icon className="size-4" />
          </Button>
        </div>

        <div className="grid gap-2">
          <Label className="text-[10px] text-muted-foreground">Generator</Label>
          <Select value={recipe.generator} onValueChange={(generator) => patch({ generator: generator as TextureLabRecipe['generator'] })}>
            <SelectTrigger size="sm" className="w-full" aria-label="Texture generator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(groupedGenerators).map(([category, generators]) => (
                <SelectGroup key={category}>
                  <SelectLabel>{category}</SelectLabel>
                  {generators.map((generator) => (
                    <SelectItem key={generator.id} value={generator.id}>
                      {generator.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Size</Label>
            <Select value={String(recipe.size)} onValueChange={(size) => patch({ size: Number(size) as TextureLabRecipe['size'] })}>
              <SelectTrigger size="sm" className="w-full" aria-label="Texture size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEXTURE_LAB_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} x {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Seed</Label>
            <Input
              aria-label="Texture seed"
              className="h-8 text-xs"
              type="number"
              value={recipe.seed}
              min={1}
              onChange={(event) => patch({ seed: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
            />
          </div>
        </div>

        <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2')}>
          {NUMBER_CONTROLS.map((control) => (
            <div key={control.key} className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">{control.label}</Label>
              <Input
                aria-label={`Texture ${control.label.toLowerCase()}`}
                className="h-8 text-xs"
                type="number"
                value={recipe[control.key]}
                min={control.min}
                max={control.max}
                step={control.step}
                onChange={(event) => patch({ [control.key]: Number(event.target.value) } as Partial<TextureLabRecipe>)}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Color ramp</Label>
            <Select value={recipe.colorRamp} onValueChange={(colorRamp) => patch({ colorRamp: colorRamp as TextureLabRecipe['colorRamp'] })}>
              <SelectTrigger size="sm" className="w-full" aria-label="Texture color ramp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEXTURE_LAB_COLOR_RAMPS.map((ramp) => (
                  <SelectItem key={ramp} value={ramp}>
                    {formatLabel(ramp)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Alpha</Label>
            <Select value={recipe.alphaMode} onValueChange={(alphaMode) => patch({ alphaMode: alphaMode as TextureLabRecipe['alphaMode'] })}>
              <SelectTrigger size="sm" className="w-full" aria-label="Texture alpha mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEXTURE_LAB_ALPHA_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {formatLabel(mode)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded border border-border/70 p-2">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={recipe.tileable} onCheckedChange={(checked) => patch({ tileable: checked === true })} />
            Tileable
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={recipe.pixelated} onCheckedChange={(checked) => patch({ pixelated: checked === true })} />
            Pixelated
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => patch({ ...recipe })}>
            <RefreshCwIcon className="size-3.5" />
            Regenerate
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportTexture}>
            <DownloadIcon className="size-3.5" />
            Export PNG
          </Button>
          {onApply && (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={applyDisabled}
              onClick={applyTexture}
              data-testid="texture-lab-apply"
            >
              <SendIcon className="size-3.5" />
              {applyLabel}
            </Button>
          )}
        </div>
      </section>

      <section className="grid min-h-0 gap-3 rounded-md border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preview</div>
            <div className="text-xs text-muted-foreground">{recipe.size} x {recipe.size} PNG</div>
          </div>
          <ImageIcon className="size-4 text-muted-foreground" />
        </div>
        <div className="grid min-h-64 place-items-center rounded border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-4">
          <img
            data-testid="texture-lab-preview"
            alt="Generated texture preview"
            src={dataUrl}
            className={cn(
              'aspect-square max-h-[48vh] w-full max-w-[32rem] object-contain drop-shadow-sm',
              recipe.pixelated && '[image-rendering:pixelated]',
            )}
          />
        </div>
        {!compact && (
          <div className="grid gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Presets</div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {TEXTURE_LAB_GENERATORS.map((generator) => (
                <button
                  key={generator.id}
                  type="button"
                  className={cn(
                    'grid gap-1 rounded-md border p-2 text-left text-xs transition-colors hover:bg-muted/50',
                    generator.id === recipe.generator && 'border-primary bg-primary/10',
                  )}
                  onClick={() => patch({ generator: generator.id })}
                >
                  <span className="font-medium">{generator.label}</span>
                  <span className="line-clamp-2 text-[10px] text-muted-foreground">{generator.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
