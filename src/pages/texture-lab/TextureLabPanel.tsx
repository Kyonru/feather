import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { zipSync, strToU8 } from 'fflate';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookmarkIcon,
  CopyIcon,
  Dice5Icon,
  DownloadIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  FilmIcon,
  ImageIcon,
  MousePointer2Icon,
  PlusIcon,
  RotateCcwIcon,
  RefreshCwIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  TEXTURE_LAB_ATLAS_MODES,
  TEXTURE_LAB_ATLAS_PLAYBACK_MODES,
  TEXTURE_LAB_COLOR_RAMPS,
  TEXTURE_LAB_SHAPE_BLEND_MODES,
  TEXTURE_LAB_SHAPE_ELEMENT_KINDS,
  TEXTURE_LAB_SHAPE_REPEAT_MODES,
  TEXTURE_LAB_SPLINE_OVERLAP_MODES,
  TEXTURE_LAB_SIZES,
  type GeneratedTextureResult,
  type TextureLabAtlasCustomFrame,
  type TextureLabAtlasMetadata,
  type TextureLabAtlasPreset,
  type TextureLabAtlasSettings,
  type TextureLabAtlasPixels,
  type TextureLabGeneratedPixels,
  type TextureLabImageMaskRecipe,
  type TextureLabRecipe,
  type TextureLabShapeElement,
  type TextureLabShapeElementKind,
  type TextureLabShapeRecipe,
  type TextureLabShapeRepeat,
  type TextureLabShapeRepeatMode,
  type TextureLabSplineOverlapMode,
  type TextureLabSplinePoint,
  type TextureLabSplineRecipe,
} from '@/types/texture-lab';
import { cn } from '@/utils/styles';
import { downloadFile } from '@/utils/file';
import {
  defaultTextureLabRecipeForGenerator,
  generateTextureLabAtlasBundleAsync,
  generateTextureLabTextureAsync,
  isTextureLabCustomAtlas,
  isTextureLabImageMaskGenerator,
  isTextureLabSplineGenerator,
  normalizeTextureLabAtlasSettings,
  renderTextureLabAtlasPixelsAsync,
  renderTextureLabCustomAtlasPixels,
  renderTextureLabPixels,
  renderTextureLabPixelsAsync,
  textureLabPixelsToDataUrl,
  textureLabRecipeWithoutAtlas,
  textureLabAtlasFrameFromRecipe,
  textureLabMaterializeAtlasFrames,
  TEXTURE_LAB_ATLAS_LIFETIME_FRAME_LIMIT,
  TEXTURE_LAB_ATLAS_FILL_PRESETS,
  TEXTURE_LAB_MAX_DIMENSION,
  TEXTURE_LAB_MIN_DIMENSION,
  TEXTURE_LAB_ATLAS_PRESET_LABELS,
  TEXTURE_LAB_ATLAS_VARIANT_FRAME_LIMIT,
  TEXTURE_LAB_GENERATORS,
  TEXTURE_LAB_SHAPE_PRESETS,
  TEXTURE_LAB_SPLINE_PRESETS,
  TEXTURE_LAB_SAVED_RECIPE_LIMIT,
  textureLabShapeElement,
  textureLabShapePreset,
  textureLabRecipeDimensions,
  textureLabSplinePreset,
} from './generator';

type TextureLabPanelProps = {
  compact?: boolean;
  applyLabel?: string;
  applyDisabled?: boolean;
  onApply?: (texture: GeneratedTextureResult) => void;
};

type TextureLabActionControlsProps = Pick<TextureLabPanelProps, 'applyLabel' | 'applyDisabled' | 'onApply'> & {
  className?: string;
  showAtlasAction?: boolean;
};

type AtlasConfirmAction = 'copy-selected-to-all' | 'empty-all-frames';

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

const SPLINE_NUMBER_CONTROLS: Array<{
  key: keyof Pick<
    TextureLabSplineRecipe,
    'strokeWidth' | 'feather' | 'taperStart' | 'taperEnd' | 'tension' | 'jitter' | 'samples'
  >;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'strokeWidth', label: 'Width', min: 0.01, max: 0.8, step: 0.01 },
  { key: 'feather', label: 'Feather', min: 0, max: 1, step: 0.01 },
  { key: 'taperStart', label: 'Taper start', min: 0, max: 1, step: 0.01 },
  { key: 'taperEnd', label: 'Taper end', min: 0, max: 1, step: 0.01 },
  { key: 'tension', label: 'Tension', min: 0, max: 1, step: 0.01 },
  { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.01 },
  { key: 'samples', label: 'Samples', min: 16, max: 192, step: 1 },
];

const SHAPE_NUMBER_CONTROLS: Array<{
  key: keyof Pick<
    TextureLabShapeElement,
    | 'x'
    | 'y'
    | 'size'
    | 'rotation'
    | 'opacity'
    | 'strokeWidth'
    | 'feather'
    | 'sides'
    | 'innerRadius'
    | 'cornerRoundness'
  >;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'x', label: 'X', min: 0, max: 1, step: 0.01 },
  { key: 'y', label: 'Y', min: 0, max: 1, step: 0.01 },
  { key: 'size', label: 'Size', min: 0.03, max: 1.5, step: 0.01 },
  { key: 'rotation', label: 'Rotation', min: -2, max: 2, step: 0.01 },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01 },
  { key: 'strokeWidth', label: 'Stroke', min: 0, max: 0.45, step: 0.01 },
  { key: 'feather', label: 'Feather', min: 0, max: 0.45, step: 0.01 },
  { key: 'sides', label: 'Sides', min: 3, max: 12, step: 1 },
  { key: 'innerRadius', label: 'Inner radius', min: 0.08, max: 0.95, step: 0.01 },
  { key: 'cornerRoundness', label: 'Roundness', min: 0, max: 1, step: 0.01 },
];

const REPEAT_NUMBER_CONTROLS: Array<{
  key: keyof Omit<TextureLabShapeRepeat, 'mode'>;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'count', label: 'Count', min: 1, max: 64, step: 1 },
  { key: 'spacing', label: 'Spacing', min: 0, max: 1, step: 0.01 },
  { key: 'radius', label: 'Radius', min: 0, max: 1, step: 0.01 },
  { key: 'seedOffset', label: 'Seed offset', min: 0, max: 9999, step: 1 },
  { key: 'rotationVariance', label: 'Rotation var', min: 0, max: 1, step: 0.01 },
  { key: 'scaleVariance', label: 'Scale var', min: 0, max: 1, step: 0.01 },
  { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.01 },
];

const SPLINE_POINT_STYLE = { fill: '#bfdbfe', stroke: '#2563eb', strokeWidth: 2 };
const SELECTED_SPLINE_POINT_STYLE = { fill: '#facc15', stroke: '#111827', strokeWidth: 3 };
const SPLINE_CONNECTOR_STYLE = { stroke: '#2563eb', shadow: '#ffffff' };

const SPLINE_OVERLAP_LABELS: Record<TextureLabSplineOverlapMode, string> = {
  merge: 'Merge',
  bridge: 'Bridge',
  additive: 'Additive',
};

function formatLabel(value: string): string {
  if (value === 'solid') return 'Solid Color';
  return value
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function textureLabGeneratorLabel(recipe: TextureLabRecipe): string {
  return (
    TEXTURE_LAB_GENERATORS.find((generator) => generator.id === recipe.generator)?.label ??
    formatLabel(recipe.generator)
  );
}

function normalizeSavedRecipeInput(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 64);
}

function randomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return (values[0] % 999_999) + 1;
  }
  return Math.floor(Math.random() * 999_999) + 1;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function textureLabAtlasZipName(texture: GeneratedTextureResult): string {
  return texture.filename.replace(/\.png$/i, '.zip');
}

function atlasPresetDefaults(preset: TextureLabAtlasPreset, current: TextureLabAtlasSettings): TextureLabAtlasSettings {
  if (preset === 'custom-frames') {
    return normalizeTextureLabAtlasSettings({
      ...current,
      enabled: true,
      preset,
      mode: 'flipbook',
      playback: 'lifetime',
      columns: 4,
      rows: 4,
      frameCount: Math.min(Math.max(current.frameCount || 4, 1), 16),
      fps: 12,
      onionSkin: true,
    });
  }
  const mode = preset === 'dissolve-loop' || preset === 'impact-ring' ? 'flipbook' : 'variations';
  const playback = mode === 'flipbook' ? 'lifetime' : 'variants';
  return normalizeTextureLabAtlasSettings({
    ...current,
    enabled: true,
    preset,
    mode,
    playback,
    columns: mode === 'flipbook' ? 8 : 4,
    rows: mode === 'flipbook' ? 4 : 4,
    frameCount: mode === 'flipbook' ? 32 : 16,
    fps: mode === 'flipbook' ? 16 : 12,
  });
}

function atlasFrameBackgroundStyle(dataUrl: string, atlas: TextureLabAtlasMetadata, index: number): CSSProperties {
  const column = index % atlas.columns;
  const row = Math.floor(index / atlas.columns);
  const x = atlas.columns <= 1 ? 0 : (column / (atlas.columns - 1)) * 100;
  const y = atlas.rows <= 1 ? 0 : (row / (atlas.rows - 1)) * 100;
  return {
    backgroundImage: `url(${dataUrl})`,
    backgroundSize: `${atlas.columns * 100}% ${atlas.rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

function customAtlasFrameDataUrl(frame?: TextureLabAtlasCustomFrame): string {
  if (!frame?.dataBase64) return '';
  return frame.dataBase64.startsWith('data:image') ? frame.dataBase64 : `data:image/png;base64,${frame.dataBase64}`;
}

function textureLabDimensionLabel(dimensions: { width: number; height: number }): string {
  return `${dimensions.width} x ${dimensions.height}`;
}

function textureLabAspectRatio(dimensions: { width: number; height: number }): string {
  return `${dimensions.width} / ${dimensions.height}`;
}

function customAtlasFramePreviewDataUrl(
  frame: TextureLabAtlasCustomFrame | undefined,
  dimensions: Pick<TextureLabRecipe, 'size' | 'width' | 'height'>,
): string {
  if (!frame) return '';
  if (frame.recipe)
    return textureLabPixelsToDataUrl(renderTextureLabPixels({ ...frame.recipe, ...dimensions, atlas: undefined }));
  return customAtlasFrameDataUrl(frame);
}

function customAtlasFrameAt(
  atlas: TextureLabAtlasSettings,
  index: number,
  fallbackToFirst = true,
): TextureLabAtlasCustomFrame | undefined {
  const frames = atlas.customFrames ?? [];
  if (index < 0 || index >= atlas.frameCount) return undefined;
  return frames[index] ?? (fallbackToFirst ? frames[0] : undefined);
}

function cloneCustomAtlasFrame(frame: TextureLabAtlasCustomFrame, index: number): TextureLabAtlasCustomFrame {
  return {
    ...frame,
    id: `custom-frame-${Date.now().toString(36)}-${index + 1}`,
    name: `Frame ${index + 1} - ${frame.name}`,
    recipe: frame.recipe ? textureLabRecipeWithoutAtlas(frame.recipe) : undefined,
  };
}

function emptyCustomAtlasFrame(
  dimensions: Pick<TextureLabRecipe, 'size' | 'width' | 'height'>,
  seed: number,
  index: number,
): TextureLabAtlasCustomFrame {
  const recipe = textureLabRecipeWithoutAtlas({
    ...defaultTextureLabRecipeForGenerator('shape-composer'),
    ...dimensions,
    seed,
    alphaMode: 'shape',
    backgroundAlpha: 0,
    shape: {
      selectedLayerId: 'empty-frame',
      layers: [
        textureLabShapeElement('dot', {
          id: 'empty-frame',
          label: 'Empty',
          enabled: false,
          opacity: 0,
          strokeWidth: 0,
        }),
      ],
    },
  });
  return {
    ...textureLabAtlasFrameFromRecipe(recipe, index),
    id: `empty-frame-${Date.now().toString(36)}-${index + 1}`,
    name: `Frame ${index + 1} - Empty`,
  };
}

function loadTextureLabFrameDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 });
    image.onerror = () => reject(new Error('Texture Lab could not read that image.'));
    image.src = dataUrl;
  });
}

async function textureLabFrameFromFile(file: File, index: number): Promise<TextureLabAtlasCustomFrame> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Texture Lab could not read that file.'));
    reader.readAsDataURL(file);
  });
  const { width, height } = await loadTextureLabFrameDimensions(dataUrl);
  return {
    id: `custom-frame-${Date.now().toString(36)}-${index + 1}`,
    name: file.name || `frame-${index + 1}.png`,
    dataBase64: dataUrl.split(',', 2)[1] ?? '',
    width,
    height,
  };
}

async function textureLabImageMaskFromFile(file: File): Promise<TextureLabImageMaskRecipe> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Texture Lab could not read that file.'));
    reader.readAsDataURL(file);
  });
  const { width, height } = await loadTextureLabFrameDimensions(dataUrl);
  return {
    dataBase64: dataUrl.split(',', 2)[1] ?? '',
    mimeType: file.type || 'image/png',
    name: file.name || 'source-image.png',
    width,
    height,
    colorKey: '#000000',
  };
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

export function TextureLabActionControls({
  applyLabel = 'Use texture',
  applyDisabled = false,
  onApply,
  className,
  showAtlasAction = false,
}: TextureLabActionControlsProps) {
  const { recipe, setRecipe, patch } = useTextureLabRecipe();
  const [isWorking, setIsWorking] = useState(false);
  const textureDimensions = textureLabRecipeDimensions(recipe);
  const textureDimensionFields = {
    size: recipe.size,
    width: textureDimensions.width,
    height: textureDimensions.height,
  };
  const atlasSettings = normalizeTextureLabAtlasSettings(recipe.atlas);
  const atlasHasFrames = (atlasSettings.customFrames?.length ?? 0) > 0;
  const atlasActive = recipe.atlas?.enabled === true;
  const atlasActionLabel = atlasActive ? 'Exit Atlas' : atlasHasFrames || recipe.atlas ? 'Enter Atlas' : 'Create Atlas';

  const createTexture = () => generateTextureLabTextureAsync(recipe);
  const toggleAtlasWorkspace = () => {
    if (atlasActive) {
      patch({ atlas: normalizeTextureLabAtlasSettings({ ...atlasSettings, enabled: false }) });
      return;
    }

    const nextAtlasBase = recipe.atlas
      ? normalizeTextureLabAtlasSettings({ ...atlasSettings, enabled: true })
      : atlasPresetDefaults('custom-frames', atlasSettings);
    const materializePreset =
      recipe.atlas && !atlasHasFrames && atlasSettings.preset !== 'custom-frames'
        ? atlasSettings.preset
        : 'custom-frames';
    const customFrames =
      atlasSettings.customFrames ??
      textureLabMaterializeAtlasFrames(
        recipe,
        normalizeTextureLabAtlasSettings({ ...nextAtlasBase, enabled: true }),
        materializePreset,
      );

    const nextAtlas = normalizeTextureLabAtlasSettings({
      ...nextAtlasBase,
      enabled: true,
      preset: 'custom-frames',
      customFrames,
    });
    const firstFrameRecipe = customFrames[0]?.recipe;
    setRecipe({
      ...(firstFrameRecipe ? { ...firstFrameRecipe, ...textureDimensionFields } : recipe),
      atlas: normalizeTextureLabAtlasSettings({
        ...nextAtlas,
      }),
    });
  };
  const resetValues = () => {
    const nextRecipe = defaultTextureLabRecipeForGenerator(recipe.generator);
    patch(
      isTextureLabImageMaskGenerator(recipe.generator) && recipe.imageMask
        ? { ...nextRecipe, imageMask: recipe.imageMask }
        : nextRecipe,
    );
  };
  const exportTexture = async () => {
    setIsWorking(true);
    try {
      if (recipe.atlas?.enabled) {
        const bundle = await generateTextureLabAtlasBundleAsync(recipe);
        const archive: Record<string, Uint8Array> = {
          'atlas.png': Uint8Array.from(atob(bundle.texture.dataBase64), (char) => char.charCodeAt(0)),
          'atlas.json': strToU8(
            JSON.stringify(
              {
                atlas: bundle.atlas,
                texture: bundle.texture.filename,
                frames: bundle.frames.map((frame) => frame.filename),
                recipe: bundle.texture.recipe,
              },
              null,
              2,
            ),
          ),
        };
        for (const frame of bundle.frames) {
          archive[`frames/${frame.filename}`] = Uint8Array.from(atob(frame.dataBase64), (char) => char.charCodeAt(0));
        }
        const bytes = zipSync(archive);
        void downloadFile(textureLabAtlasZipName(bundle.texture), bytesToBase64(bytes), 'base64');
        return;
      }
      const texture = await createTexture();
      void downloadFile(texture.filename, texture.dataBase64, 'base64');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Texture export failed');
    } finally {
      setIsWorking(false);
    }
  };
  const applyTexture = async () => {
    if (!onApply) return;
    setIsWorking(true);
    try {
      const texture = await createTexture();
      onApply(texture);
      toast.success(`${texture.filename} applied`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Texture apply failed');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      {showAtlasAction && (
        <Button
          type="button"
          size="sm"
          variant={atlasActive ? 'secondary' : 'outline'}
          className="h-8 gap-1.5 text-xs"
          onClick={toggleAtlasWorkspace}
        >
          <FilmIcon className="size-3.5" />
          {atlasActionLabel}
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={resetValues}>
        <RotateCcwIcon className="size-3.5" />
        Reset values
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        onClick={() => patch({ ...recipe })}
      >
        <RefreshCwIcon className="size-3.5" />
        Regenerate
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        disabled={isWorking}
        onClick={() => void exportTexture()}
      >
        <DownloadIcon className="size-3.5" />
        {recipe.atlas?.enabled ? 'Export Atlas ZIP' : 'Export PNG'}
      </Button>
      {onApply && (
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={applyDisabled || isWorking}
          onClick={() => void applyTexture()}
          data-testid="texture-lab-apply"
        >
          <SendIcon className="size-3.5" />
          {applyLabel}
        </Button>
      )}
    </div>
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    tagName === 'button'
  );
}

function splinePathData(points: TextureLabSplinePoint[], closed: boolean): string {
  if (points.length === 0) return '';
  const commands = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`);
  return `${commands.join(' ')}${closed ? ' Z' : ''}`;
}

type SplineEditorProps = {
  spline: TextureLabSplineRecipe;
  pixelated: boolean;
  dataUrl: string;
  aspectRatio: string;
  onChange: (spline: TextureLabSplineRecipe) => void;
};

function TextureSplineEditor({ spline, pixelated, dataUrl, aspectRatio, onChange }: SplineEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number>(0);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const canDelete = spline.points.length > 2 && selectedPoint >= 0 && selectedPoint < spline.points.length;
  const selectedPointLabel =
    selectedPoint >= 0 && selectedPoint < spline.points.length ? `Point ${selectedPoint + 1}` : 'No point';

  const pointFromClient = (clientX: number, clientY: number): TextureLabSplinePoint => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0.5, y: 0.5 };
    return {
      x: clamp01((clientX - bounds.left) / Math.max(1, bounds.width)),
      y: clamp01((clientY - bounds.top) / Math.max(1, bounds.height)),
    };
  };

  const pointFromEvent = (event: ReactPointerEvent<Element> | ReactMouseEvent<Element>): TextureLabSplinePoint =>
    pointFromClient(event.clientX, event.clientY);

  const updatePoint = (index: number, point: TextureLabSplinePoint) => {
    const points = spline.points.map((existing, pointIndex) => (pointIndex === index ? point : existing));
    onChange({ ...spline, points });
  };

  const deleteSelectedPoint = () => {
    if (!canDelete) return;
    const points = spline.points.filter((_, index) => index !== selectedPoint);
    const nextSelected = Math.min(points.length - 1, selectedPoint);
    setSelectedPoint(nextSelected);
    onChange({ ...spline, points });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (!canDelete) return;
      event.preventDefault();
      deleteSelectedPoint();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canDelete, selectedPoint, spline]);

  useEffect(() => {
    setSelectedPoint((point) => Math.min(Math.max(point, 0), spline.points.length - 1));
  }, [spline.points.length]);

  return (
    <div className="grid gap-2 rounded-md border border-border/70 p-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <MousePointer2Icon className="size-3" />
            Spline editor
          </div>
          <div className="text-xs text-muted-foreground">
            Drag points, double-click to add, Delete removes the selected point.
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8 shrink-0"
          title="Delete selected spline point"
          disabled={!canDelete}
          onClick={deleteSelectedPoint}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-sm bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]"
        style={{ aspectRatio }}
        data-testid="texture-lab-spline-editor"
        onDoubleClick={(event) => {
          const point = pointFromEvent(event);
          const nextIndex = Math.min(spline.points.length, selectedPoint + 1);
          const points = [...spline.points.slice(0, nextIndex), point, ...spline.points.slice(nextIndex)];
          setSelectedPoint(nextIndex);
          onChange({ ...spline, points });
        }}
        onPointerMove={(event) => {
          if (draggingPoint === null) return;
          updatePoint(draggingPoint, pointFromEvent(event));
        }}
        onPointerUp={(event) => {
          if (draggingPoint !== null) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDraggingPoint(null);
        }}
        onPointerCancel={() => setDraggingPoint(null)}
      >
        <img
          data-testid="texture-lab-preview"
          alt="Generated texture preview"
          src={dataUrl}
          className={cn(
            'absolute inset-0 size-full object-contain opacity-70',
            pixelated && '[image-rendering:pixelated]',
          )}
        />
        <svg className="absolute inset-0 size-full touch-none" viewBox="0 0 1 1" preserveAspectRatio="none">
          <path
            d={splinePathData(spline.points, spline.closed)}
            fill="none"
            stroke={SPLINE_CONNECTOR_STYLE.shadow}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.72}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={splinePathData(spline.points, spline.closed)}
            fill="none"
            stroke={SPLINE_CONNECTOR_STYLE.stroke}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {spline.points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={index === selectedPoint ? 0.029 : 0.022}
              fill={(index === selectedPoint ? SELECTED_SPLINE_POINT_STYLE : SPLINE_POINT_STYLE).fill}
              stroke={(index === selectedPoint ? SELECTED_SPLINE_POINT_STYLE : SPLINE_POINT_STYLE).stroke}
              strokeWidth={(index === selectedPoint ? SELECTED_SPLINE_POINT_STYLE : SPLINE_POINT_STYLE).strokeWidth}
              className="pointer-events-auto"
              vectorEffect="non-scaling-stroke"
              data-testid={`texture-lab-spline-point-${index}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                setSelectedPoint(index);
                setDraggingPoint(index);
                containerRef.current?.setPointerCapture(event.pointerId);
              }}
            />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{selectedPointLabel}</span>
        <span>{spline.points.length} points</span>
      </div>
    </div>
  );
}

function shapeLayerEditablePoints(layer: TextureLabShapeElement | undefined): TextureLabSplinePoint[] | undefined {
  if (!layer) return undefined;
  if ((layer.kind === 'polygon' || layer.kind === 'star') && Array.isArray(layer.points) && layer.points.length >= 3) {
    return layer.points;
  }
  if (layer.kind === 'spline' && layer.spline?.points && layer.spline.points.length >= 2) {
    return layer.spline.points;
  }
  return undefined;
}

function shapeLayerSupportsPoints(layer: TextureLabShapeElement | undefined): boolean {
  return !!shapeLayerEditablePoints(layer);
}

function shapeLayerMinimumPoints(layer: TextureLabShapeElement): number {
  return layer.kind === 'spline' ? 2 : 3;
}

function shapePointToWorld(layer: TextureLabShapeElement, point: TextureLabSplinePoint): TextureLabSplinePoint {
  const angle = layer.rotation * Math.PI * 2;
  const x = (point.x - 0.5) * layer.size;
  const y = (point.y - 0.5) * layer.size;
  return {
    x: clamp01(layer.x + x * Math.cos(angle) - y * Math.sin(angle)),
    y: clamp01(layer.y + x * Math.sin(angle) + y * Math.cos(angle)),
  };
}

function shapeWorldToPoint(layer: TextureLabShapeElement, point: TextureLabSplinePoint): TextureLabSplinePoint {
  const angle = -layer.rotation * Math.PI * 2;
  const dx = point.x - layer.x;
  const dy = point.y - layer.y;
  return {
    x: clamp01((dx * Math.cos(angle) - dy * Math.sin(angle)) / Math.max(0.001, layer.size) + 0.5),
    y: clamp01((dx * Math.sin(angle) + dy * Math.cos(angle)) / Math.max(0.001, layer.size) + 0.5),
  };
}

function shapeLayerPathData(layer: TextureLabShapeElement): string {
  const points = shapeLayerEditablePoints(layer);
  if (!points) return '';
  return splinePathData(
    points.map((point) => shapePointToWorld(layer, point)),
    layer.kind === 'spline' ? layer.spline?.closed === true : true,
  );
}

type ShapeEditorProps = {
  shape: TextureLabShapeRecipe;
  pixelated: boolean;
  dataUrl: string;
  aspectRatio: string;
  onChange: (shape: TextureLabShapeRecipe) => void;
};

function TextureShapeEditor({ shape, pixelated, dataUrl, aspectRatio, onChange }: ShapeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedLayer =
    shape.layers.find((layer) => layer.id === shape.selectedLayerId) ?? shape.layers.find(shapeLayerSupportsPoints);
  const editableLayer = shapeLayerSupportsPoints(selectedLayer) ? selectedLayer : undefined;
  const editablePoints = shapeLayerEditablePoints(editableLayer);
  const [selectedPoint, setSelectedPoint] = useState<number>(0);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'move' | 'size' | null>(null);
  const draggingPointRef = useRef<number | null>(null);
  const draggingHandleRef = useRef<'move' | 'size' | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const canDelete =
    !!editableLayer &&
    !!editablePoints &&
    editablePoints.length > shapeLayerMinimumPoints(editableLayer) &&
    selectedPoint >= 0 &&
    selectedPoint < editablePoints.length;

  const pointFromClient = (clientX: number, clientY: number): TextureLabSplinePoint => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0.5, y: 0.5 };
    return {
      x: clamp01((clientX - bounds.left) / Math.max(1, bounds.width)),
      y: clamp01((clientY - bounds.top) / Math.max(1, bounds.height)),
    };
  };
  const pointFromEvent = (event: ReactPointerEvent<Element> | ReactMouseEvent<Element>): TextureLabSplinePoint =>
    pointFromClient(event.clientX, event.clientY);

  const capturePointer = (pointerId: number) => {
    try {
      containerRef.current?.setPointerCapture(pointerId);
    } catch {
      // Some browsers are picky about SVG hit targets; dragging still works without capture.
    }
  };

  const releasePointer = (pointerId: number) => {
    try {
      containerRef.current?.releasePointerCapture(pointerId);
    } catch {
      // Ignore stale pointer capture during fast test/user interactions.
    }
  };

  const updateLayer = (nextLayer: TextureLabShapeElement) => {
    onChange({
      ...shape,
      selectedLayerId: nextLayer.id,
      layers: shape.layers.map((layer) => (layer.id === nextLayer.id ? nextLayer : layer)),
    });
  };

  const selectLayer = (layerId: string) => {
    onChange({
      ...shape,
      selectedLayerId: layerId,
    });
  };

  const updatePoint = (index: number, worldPoint: TextureLabSplinePoint) => {
    if (!editableLayer || !editablePoints) return;
    const localPoint = shapeWorldToPoint(editableLayer, worldPoint);
    const points = editablePoints.map((point, pointIndex) => (pointIndex === index ? localPoint : point));
    updateLayer(
      editableLayer.kind === 'spline'
        ? { ...editableLayer, spline: { ...editableLayer.spline!, points } }
        : { ...editableLayer, points },
    );
  };

  const updateShapeHandle = (handle: 'move' | 'size', worldPoint: TextureLabSplinePoint) => {
    if (!selectedLayer) return;
    if (handle === 'move') {
      updateLayer({ ...selectedLayer, x: worldPoint.x, y: worldPoint.y });
      return;
    }

    const distance = Math.hypot(worldPoint.x - selectedLayer.x, worldPoint.y - selectedLayer.y);
    updateLayer({ ...selectedLayer, size: clampRange(distance * 2, 0.03, 1.5) });
  };

  const nearestPointIndex = (worldPoint: TextureLabSplinePoint): number | null => {
    if (!editableLayer || !editablePoints) return null;
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    editablePoints.forEach((point, index) => {
      const world = shapePointToWorld(editableLayer, point);
      const distance = Math.hypot(world.x - worldPoint.x, world.y - worldPoint.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestDistance <= 0.075 ? bestIndex : null;
  };

  const clearWindowDragListeners = () => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  };

  const beginPointDrag = (index: number, pointerId?: number) => {
    clearWindowDragListeners();
    draggingPointRef.current = index;
    setSelectedPoint(index);
    setDraggingPoint(index);
    if (pointerId !== undefined) capturePointer(pointerId);

    const move = (event: PointerEvent | MouseEvent) => {
      updatePoint(index, pointFromClient(event.clientX, event.clientY));
    };
    const stop = () => {
      clearWindowDragListeners();
      draggingPointRef.current = null;
      setDraggingPoint(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('mousemove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('mouseup', stop, { once: true });
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('mouseup', stop);
    };
  };

  const beginShapeHandleDrag = (handle: 'move' | 'size', pointerId?: number) => {
    clearWindowDragListeners();
    draggingHandleRef.current = handle;
    setDraggingHandle(handle);
    if (selectedLayer) selectLayer(selectedLayer.id);
    if (pointerId !== undefined) capturePointer(pointerId);

    const move = (event: PointerEvent | MouseEvent) => {
      updateShapeHandle(handle, pointFromClient(event.clientX, event.clientY));
    };
    const stop = () => {
      clearWindowDragListeners();
      draggingHandleRef.current = null;
      setDraggingHandle(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('mousemove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('mouseup', stop, { once: true });
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('mouseup', stop);
    };
  };

  const endPointDrag = (pointerId?: number) => {
    if (
      pointerId !== undefined &&
      (draggingPointRef.current !== null ||
        draggingPoint !== null ||
        draggingHandleRef.current !== null ||
        draggingHandle !== null)
    ) {
      releasePointer(pointerId);
    }
    clearWindowDragListeners();
    draggingPointRef.current = null;
    draggingHandleRef.current = null;
    setDraggingPoint(null);
    setDraggingHandle(null);
  };

  const deleteSelectedPoint = () => {
    if (!canDelete || !editableLayer || !editablePoints) return;
    const points = editablePoints.filter((_, index) => index !== selectedPoint);
    setSelectedPoint(Math.min(points.length - 1, selectedPoint));
    updateLayer(
      editableLayer.kind === 'spline'
        ? { ...editableLayer, spline: { ...editableLayer.spline!, points } }
        : { ...editableLayer, points },
    );
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (!canDelete) return;
      event.preventDefault();
      deleteSelectedPoint();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canDelete, selectedPoint, editableLayer, shape]);

  useEffect(() => {
    setSelectedPoint((point) => Math.min(Math.max(point, 0), Math.max(0, (editablePoints?.length ?? 1) - 1)));
  }, [editablePoints?.length, editableLayer?.id]);

  useEffect(() => () => clearWindowDragListeners(), []);

  const selectedLayerSizeHandle = selectedLayer ? shapePointToWorld(selectedLayer, { x: 1, y: 0.5 }) : undefined;

  return (
    <div className="grid gap-2 rounded-md border border-border/70 p-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <MousePointer2Icon className="size-3" />
            Shape editor
          </div>
          <div className="text-xs text-muted-foreground">
            Drag layer handles to move or resize. Polygon, star, and spline points can be reshaped directly.
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8 shrink-0"
          title="Delete selected shape point"
          disabled={!canDelete}
          onClick={deleteSelectedPoint}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-sm bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]"
        style={{ aspectRatio }}
        data-testid="texture-lab-shape-editor"
        onDoubleClick={(event) => {
          if (!editableLayer || !editablePoints) return;
          const nextIndex = Math.min(editablePoints.length, selectedPoint + 1);
          const localPoint = shapeWorldToPoint(editableLayer, pointFromEvent(event));
          const points = [...editablePoints.slice(0, nextIndex), localPoint, ...editablePoints.slice(nextIndex)].slice(
            0,
            24,
          );
          setSelectedPoint(nextIndex);
          updateLayer(
            editableLayer.kind === 'spline'
              ? { ...editableLayer, spline: { ...editableLayer.spline!, points } }
              : { ...editableLayer, points },
          );
        }}
        onPointerMove={(event) => {
          const pointIndex = draggingPointRef.current ?? draggingPoint;
          const handle = draggingHandleRef.current ?? draggingHandle;
          if (pointIndex !== null) {
            updatePoint(pointIndex, pointFromEvent(event));
            return;
          }
          if (handle === null) return;
          updateShapeHandle(handle, pointFromEvent(event));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const pointIndex = nearestPointIndex(pointFromEvent(event));
          if (pointIndex === null) return;
          event.preventDefault();
          beginPointDrag(pointIndex, event.pointerId);
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const pointIndex = nearestPointIndex(pointFromEvent(event));
          if (pointIndex === null) return;
          event.preventDefault();
          beginPointDrag(pointIndex);
        }}
        onMouseMove={(event) => {
          const pointIndex = draggingPointRef.current ?? draggingPoint;
          const handle = draggingHandleRef.current ?? draggingHandle;
          if (pointIndex !== null) {
            updatePoint(pointIndex, pointFromEvent(event));
            return;
          }
          if (handle === null) return;
          updateShapeHandle(handle, pointFromEvent(event));
        }}
        onMouseUp={() => endPointDrag()}
        onPointerUp={(event) => {
          endPointDrag(event.pointerId);
        }}
        onPointerCancel={() => {
          draggingPointRef.current = null;
          setDraggingPoint(null);
        }}
      >
        <img
          data-testid="texture-lab-preview"
          alt="Generated texture preview"
          src={dataUrl}
          draggable={false}
          className={cn(
            'absolute inset-0 size-full select-none object-contain opacity-75',
            pixelated && '[image-rendering:pixelated]',
          )}
        />
        <svg className="absolute inset-0 size-full touch-none" viewBox="0 0 1 1" preserveAspectRatio="none">
          {shape.layers.filter(shapeLayerSupportsPoints).map((layer) => (
            <path
              key={layer.id}
              d={shapeLayerPathData(layer)}
              fill="none"
              stroke={layer.id === editableLayer?.id ? '#2563eb' : '#64748b'}
              strokeWidth={layer.id === editableLayer?.id ? 2.5 : 1.5}
              opacity={layer.enabled ? 0.9 : 0.35}
              className="pointer-events-auto cursor-pointer"
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => {
                event.stopPropagation();
                selectLayer(layer.id);
              }}
            />
          ))}
        </svg>
        {selectedLayer && (
          <>
            <button
              type="button"
              aria-label="Move selected shape layer"
              data-testid="texture-lab-shape-move-handle"
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow-sm cursor-move"
              style={{
                left: `${selectedLayer.x * 100}%`,
                top: `${selectedLayer.y * 100}%`,
                width: 18,
                height: 18,
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // Window-level drag listeners still handle browsers that reject capture.
                }
                beginShapeHandleDrag('move', event.pointerId);
              }}
              onPointerMove={(event) => {
                if ((draggingHandleRef.current ?? draggingHandle) !== 'move') return;
                updateShapeHandle('move', pointFromEvent(event));
              }}
              onPointerUp={(event) => {
                if ((draggingHandleRef.current ?? draggingHandle) === 'move')
                  updateShapeHandle('move', pointFromEvent(event));
                endPointDrag(event.pointerId);
              }}
              onMouseDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
                beginShapeHandleDrag('move');
              }}
              onMouseMove={(event) => {
                if ((draggingHandleRef.current ?? draggingHandle) !== 'move') return;
                updateShapeHandle('move', pointFromEvent(event));
              }}
              onMouseUp={(event) => {
                if ((draggingHandleRef.current ?? draggingHandle) === 'move')
                  updateShapeHandle('move', pointFromEvent(event));
                endPointDrag();
              }}
            />
            {selectedLayerSizeHandle && (
              <button
                type="button"
                aria-label="Resize selected shape layer"
                data-testid="texture-lab-shape-size-handle"
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white bg-emerald-500 shadow-sm cursor-nwse-resize"
                style={{
                  left: `${selectedLayerSizeHandle.x * 100}%`,
                  top: `${selectedLayerSizeHandle.y * 100}%`,
                  width: 16,
                  height: 16,
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    // Window-level drag listeners still handle browsers that reject capture.
                  }
                  beginShapeHandleDrag('size', event.pointerId);
                }}
                onPointerMove={(event) => {
                  if ((draggingHandleRef.current ?? draggingHandle) !== 'size') return;
                  updateShapeHandle('size', pointFromEvent(event));
                }}
                onPointerUp={(event) => {
                  if ((draggingHandleRef.current ?? draggingHandle) === 'size')
                    updateShapeHandle('size', pointFromEvent(event));
                  endPointDrag(event.pointerId);
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  beginShapeHandleDrag('size');
                }}
                onMouseMove={(event) => {
                  if ((draggingHandleRef.current ?? draggingHandle) !== 'size') return;
                  updateShapeHandle('size', pointFromEvent(event));
                }}
                onMouseUp={(event) => {
                  if ((draggingHandleRef.current ?? draggingHandle) === 'size')
                    updateShapeHandle('size', pointFromEvent(event));
                  endPointDrag();
                }}
              />
            )}
          </>
        )}
        {editableLayer &&
          editablePoints?.map((point, index) => {
            const world = shapePointToWorld(editableLayer, point);
            const style = index === selectedPoint ? SELECTED_SPLINE_POINT_STYLE : SPLINE_POINT_STYLE;
            const size = index === selectedPoint ? 24 : 20;
            return (
              <button
                key={index}
                type="button"
                aria-label={`Shape point ${index + 1}`}
                data-testid={`texture-lab-shape-point-${index}`}
                data-point={`${world.x}:${world.y}`}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm cursor-grab active:cursor-grabbing"
                style={{
                  left: `${world.x * 100}%`,
                  top: `${world.y * 100}%`,
                  width: size,
                  height: size,
                  backgroundColor: style.fill,
                  borderColor: style.stroke,
                  borderStyle: 'solid',
                  borderWidth: style.strokeWidth,
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    // Window-level drag listeners still handle browsers that reject capture.
                  }
                  beginPointDrag(index, event.pointerId);
                }}
                onPointerMove={(event) => {
                  if ((draggingPointRef.current ?? draggingPoint) !== index) return;
                  updatePoint(index, pointFromEvent(event));
                }}
                onPointerUp={(event) => {
                  if ((draggingPointRef.current ?? draggingPoint) === index) updatePoint(index, pointFromEvent(event));
                  endPointDrag(event.pointerId);
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  beginPointDrag(index);
                }}
                onMouseMove={(event) => {
                  if ((draggingPointRef.current ?? draggingPoint) !== index) return;
                  updatePoint(index, pointFromEvent(event));
                }}
                onMouseUp={(event) => {
                  if ((draggingPointRef.current ?? draggingPoint) === index) updatePoint(index, pointFromEvent(event));
                  endPointDrag();
                }}
              />
            );
          })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          {editableLayer && editablePoints
            ? `${editableLayer.label}: ${editablePoints.length} points`
            : 'Select a polygon, star, or spline layer'}
        </span>
        <span>{selectedLayer ? `${selectedLayer.label}: move/resize handles` : `${shape.layers.length} layers`}</span>
      </div>
    </div>
  );
}

export function TextureLabPanel({
  compact = false,
  applyLabel = 'Use texture',
  applyDisabled = false,
  onApply,
}: TextureLabPanelProps) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [customDimensionsOpen, setCustomDimensionsOpen] = useState(false);
  const [savedRecipeName, setSavedRecipeName] = useState('');
  const [selectedAtlasFrame, setSelectedAtlasFrame] = useState(0);
  const [atlasFillPreset, setAtlasFillPreset] = useState<TextureLabAtlasPreset>('seeded-spark');
  const [atlasConfirmAction, setAtlasConfirmAction] = useState<AtlasConfirmAction | null>(null);
  const [customAtlasPixels, setCustomAtlasPixels] = useState<TextureLabAtlasPixels | null>(null);
  const [customAtlasError, setCustomAtlasError] = useState<string | null>(null);
  const [asyncPreviewPixels, setAsyncPreviewPixels] = useState<TextureLabGeneratedPixels | TextureLabAtlasPixels | null>(
    null,
  );
  const [asyncPreviewError, setAsyncPreviewError] = useState<string | null>(null);
  const customFrameInputRef = useRef<HTMLInputElement | null>(null);
  const imageMaskInputRef = useRef<HTMLInputElement | null>(null);
  const { recipe, setRecipe, patch: patchRecipeStore } = useTextureLabRecipe();
  const textureDimensions = useMemo(() => textureLabRecipeDimensions(recipe), [recipe]);
  const textureDimensionFields = useMemo(
    () => ({ size: recipe.size, width: textureDimensions.width, height: textureDimensions.height }),
    [recipe.size, textureDimensions.height, textureDimensions.width],
  );
  const textureDimensionText = textureLabDimensionLabel(textureDimensions);
  const textureAspectRatio = textureLabAspectRatio(textureDimensions);
  const textureDimensionsMatchPreset =
    textureDimensions.width === textureDimensions.height &&
    TEXTURE_LAB_SIZES.some((size) => size === textureDimensions.width);
  const textureSizeSelectValue =
    customDimensionsOpen || !textureDimensionsMatchPreset ? 'custom' : String(textureDimensions.width);
  const savedRecipes = useSettingsStore((state) => state.textureLabSavedRecipes);
  const saveTextureLabRecipe = useSettingsStore((state) => state.saveTextureLabRecipe);
  const deleteTextureLabSavedRecipe = useSettingsStore((state) => state.deleteTextureLabSavedRecipe);
  const atlasSettings = useMemo(() => normalizeTextureLabAtlasSettings(recipe.atlas), [recipe.atlas]);
  const atlasEnabled = recipe.atlas?.enabled === true;
  const customAtlasEnabled = isTextureLabCustomAtlas(recipe);
  const imageMaskGenerator = isTextureLabImageMaskGenerator(recipe.generator);
  const imageMaskReady = imageMaskGenerator && !!recipe.imageMask?.dataBase64;
  const pixels = useMemo(() => renderTextureLabPixels(recipe), [recipe]);
  const visiblePixels = asyncPreviewPixels ?? pixels;
  const fallbackDataUrl = useMemo(() => textureLabPixelsToDataUrl(visiblePixels), [visiblePixels]);
  const dataUrl = useMemo(
    () => (customAtlasEnabled && customAtlasPixels ? textureLabPixelsToDataUrl(customAtlasPixels) : fallbackDataUrl),
    [customAtlasEnabled, customAtlasPixels, fallbackDataUrl],
  );
  const asyncAtlasPixels =
    asyncPreviewPixels && 'atlas' in asyncPreviewPixels ? (asyncPreviewPixels as TextureLabAtlasPixels) : null;
  const atlasPixels = customAtlasEnabled
    ? customAtlasPixels
    : atlasEnabled
      ? asyncAtlasPixels
      : null;
  const atlasFrame =
    atlasPixels?.frames[Math.min(selectedAtlasFrame, Math.max(0, atlasPixels.frames.length - 1))] ?? null;
  const atlasFrameDataUrl = useMemo(() => (atlasFrame ? textureLabPixelsToDataUrl(atlasFrame) : ''), [atlasFrame]);
  const editorDataUrl = atlasEnabled && atlasFrameDataUrl ? atlasFrameDataUrl : dataUrl;
  const customAtlasFrames = atlasSettings.customFrames ?? [];
  const selectedCustomFrame = customAtlasEnabled ? customAtlasFrameAt(atlasSettings, selectedAtlasFrame) : undefined;
  const previousCustomFrame = customAtlasEnabled
    ? customAtlasFrameAt(atlasSettings, selectedAtlasFrame - 1, false)
    : undefined;
  const nextCustomFrame = customAtlasEnabled
    ? customAtlasFrameAt(atlasSettings, selectedAtlasFrame + 1, false)
    : undefined;
  const selectedCustomFrameIsUploaded = customAtlasEnabled && !!selectedCustomFrame && !selectedCustomFrame.recipe;
  const selectedCustomFrameIsEditable = customAtlasEnabled && !!selectedCustomFrame?.recipe;
  const previousCustomFrameDataUrl = useMemo(
    () =>
      customAtlasEnabled && atlasSettings.onionSkin
        ? customAtlasFramePreviewDataUrl(previousCustomFrame, textureDimensionFields)
        : '',
    [atlasSettings.onionSkin, customAtlasEnabled, previousCustomFrame, textureDimensionFields],
  );
  const nextCustomFrameDataUrl = useMemo(
    () =>
      customAtlasEnabled && atlasSettings.onionSkin
        ? customAtlasFramePreviewDataUrl(nextCustomFrame, textureDimensionFields)
        : '',
    [atlasSettings.onionSkin, customAtlasEnabled, nextCustomFrame, textureDimensionFields],
  );
  const atlasFrameStyles = useMemo(
    () => atlasPixels?.frames.map((frame) => atlasFrameBackgroundStyle(dataUrl, atlasPixels.atlas, frame.index)) ?? [],
    [atlasPixels, dataUrl],
  );
  const selectedGenerator =
    TEXTURE_LAB_GENERATORS.find((item) => item.id === recipe.generator) ?? TEXTURE_LAB_GENERATORS[0];
  const isSpline = isTextureLabSplineGenerator(recipe.generator);
  const isShapeComposer = recipe.generator === 'shape-composer';
  const spline = recipe.spline;
  const shape = recipe.shape;
  const selectedShapeLayer = shape?.layers.find((layer) => layer.id === shape.selectedLayerId) ?? shape?.layers[0];
  const suggestedSavedRecipeName = `${selectedGenerator.label} ${textureDimensionText} ${recipe.seed}`;
  const groupedGenerators = useMemo(
    () =>
      TEXTURE_LAB_GENERATORS.reduce<Record<string, typeof TEXTURE_LAB_GENERATORS>>((groups, generator) => {
        groups[generator.category] = [...(groups[generator.category] ?? []), generator];
        return groups;
      }, {}),
    [],
  );

  const commitEditorRecipe = (nextEditorRecipe: TextureLabRecipe) => {
    if (selectedCustomFrameIsUploaded) return;

    if (!customAtlasEnabled || !selectedCustomFrame?.recipe) {
      setRecipe(nextEditorRecipe);
      return;
    }

    const frames = [...customAtlasFrames];
    const currentFrame = frames[selectedAtlasFrame] ?? selectedCustomFrame;
    frames[selectedAtlasFrame] = {
      ...currentFrame,
      recipe: textureLabRecipeWithoutAtlas(nextEditorRecipe),
    };
    setRecipe({
      ...nextEditorRecipe,
      atlas: normalizeTextureLabAtlasSettings({
        ...atlasSettings,
        enabled: true,
        preset: 'custom-frames',
        customFrames: frames,
      }),
    });
  };
  const patch = (recipePatch: Partial<TextureLabRecipe>) => {
    if (recipePatch.atlas) {
      patchRecipeStore(recipePatch);
      return;
    }
    commitEditorRecipe({ ...recipe, ...recipePatch });
  };
  const patchDimensions = (width: number, height: number) => {
    const nextWidth = Math.round(clampRange(width, TEXTURE_LAB_MIN_DIMENSION, TEXTURE_LAB_MAX_DIMENSION));
    const nextHeight = Math.round(clampRange(height, TEXTURE_LAB_MIN_DIMENSION, TEXTURE_LAB_MAX_DIMENSION));
    patch({ size: Math.max(nextWidth, nextHeight), width: nextWidth, height: nextHeight });
  };
  const selectGenerator = (generator: TextureLabRecipe['generator']) => {
    commitEditorRecipe(defaultTextureLabRecipeForGenerator(generator));
  };
  const patchAtlas = (atlasPatch: Partial<TextureLabAtlasSettings>) => {
    const nextAtlas = normalizeTextureLabAtlasSettings({
      ...atlasSettings,
      enabled: atlasEnabled,
      ...atlasPatch,
      preset: customAtlasEnabled || atlasEnabled ? 'custom-frames' : atlasSettings.preset,
    });
    if (!customAtlasEnabled) {
      patch({ atlas: nextAtlas });
      return;
    }
    const fallbackFrame = selectedCustomFrame ?? textureLabAtlasFrameFromRecipe(recipe, selectedAtlasFrame);
    const frames = Array.from({ length: nextAtlas.frameCount }, (_, index) =>
      customAtlasFrames[index] ? customAtlasFrames[index] : cloneCustomAtlasFrame(fallbackFrame, index),
    );
    patch({
      atlas: normalizeTextureLabAtlasSettings({
        ...nextAtlas,
        customFrames: frames,
      }),
    });
  };
  const selectAtlasFrame = (index: number) => {
    const nextIndex = Math.max(0, Math.min(atlasSettings.frameCount - 1, index));
    setSelectedAtlasFrame(nextIndex);
    if (!customAtlasEnabled) return;
    const frame = customAtlasFrameAt(atlasSettings, nextIndex, false);
    if (!frame?.recipe) return;
    setRecipe({
      ...frame.recipe,
      ...textureDimensionFields,
      atlas: recipe.atlas,
    });
  };
  const customFrameListWithFallback = (): TextureLabAtlasCustomFrame[] => {
    const fallback = customAtlasFrames[0] ?? textureLabAtlasFrameFromRecipe(recipe, 0);
    return Array.from({ length: atlasSettings.frameCount }, (_, index) =>
      customAtlasFrames[index] ? customAtlasFrames[index] : cloneCustomAtlasFrame(fallback, index),
    );
  };
  const fillAtlasFramesFromPreset = (preset: TextureLabAtlasPreset) => {
    const nextAtlas = atlasPresetDefaults(preset, atlasSettings);
    const customFrames = textureLabMaterializeAtlasFrames(recipe, nextAtlas, preset);
    const firstFrameRecipe = customFrames[0]?.recipe;
    setRecipe({
      ...(firstFrameRecipe ? { ...firstFrameRecipe, ...textureDimensionFields } : recipe),
      atlas: normalizeTextureLabAtlasSettings({
        ...nextAtlas,
        preset: 'custom-frames',
        customFrames,
      }),
    });
    setSelectedAtlasFrame(0);
    toast.success(`${TEXTURE_LAB_ATLAS_PRESET_LABELS[preset]} filled ${customFrames.length} editable frames`);
  };
  const clearAtlas = () => {
    setRecipe({ ...recipe, atlas: undefined });
    setSelectedAtlasFrame(0);
    toast.success('Atlas cleared');
  };
  const replaceSelectedCustomFrame = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const frame = await textureLabFrameFromFile(file, selectedAtlasFrame);
      const frames = customFrameListWithFallback();
      frames[selectedAtlasFrame] = frame;
      patch({
        atlas: normalizeTextureLabAtlasSettings({
          ...atlasSettings,
          enabled: true,
          preset: 'custom-frames',
          mode: 'flipbook',
          playback: 'lifetime',
          customFrames: frames,
        }),
      });
      toast.success(`Frame ${selectedAtlasFrame + 1} replaced`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Frame upload failed');
    }
  };
  const uploadImageMaskSource = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !imageMaskGenerator) return;
    try {
      const imageMask = await textureLabImageMaskFromFile(file);
      const width = Math.round(clampRange(imageMask.width, TEXTURE_LAB_MIN_DIMENSION, TEXTURE_LAB_MAX_DIMENSION));
      const height = Math.round(clampRange(imageMask.height, TEXTURE_LAB_MIN_DIMENSION, TEXTURE_LAB_MAX_DIMENSION));
      commitEditorRecipe({
        ...recipe,
        size: Math.max(width, height),
        width,
        height,
        imageMask,
      });
      setCustomDimensionsOpen(!TEXTURE_LAB_SIZES.some((size) => size === width && size === height));
      toast.success(`${imageMask.name} loaded for masking`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Image mask upload failed');
    }
  };
  const copySelectedCustomFrameToAll = async () => {
    const selected = selectedCustomFrame;
    if (!selected) return;
    const frames = Array.from({ length: atlasSettings.frameCount }, (_, index) =>
      cloneCustomAtlasFrame(selected, index),
    );
    patch({
      atlas: normalizeTextureLabAtlasSettings({
        ...atlasSettings,
        customFrames: frames,
      }),
    });
    toast.success(`Copied frame ${selectedAtlasFrame + 1} to every sprite-sheet frame`);
  };
  const emptyAllAtlasFrames = () => {
    const frames = Array.from({ length: atlasSettings.frameCount }, (_, index) =>
      emptyCustomAtlasFrame(textureDimensionFields, recipe.seed, index),
    );
    const firstFrameRecipe = frames[0]?.recipe;
    setRecipe({
      ...(firstFrameRecipe ? { ...firstFrameRecipe, ...textureDimensionFields } : recipe),
      atlas: normalizeTextureLabAtlasSettings({
        ...atlasSettings,
        enabled: true,
        preset: 'custom-frames',
        customFrames: frames,
      }),
    });
    setSelectedAtlasFrame(0);
    toast.success(`Emptied ${frames.length} atlas frames`);
  };
  const runAtlasConfirmedAction = () => {
    const action = atlasConfirmAction;
    setAtlasConfirmAction(null);
    if (action === 'copy-selected-to-all') {
      void copySelectedCustomFrameToAll();
      return;
    }
    if (action === 'empty-all-frames') emptyAllAtlasFrames();
  };
  const selectSplinePreset = (presetId: (typeof TEXTURE_LAB_SPLINE_PRESETS)[number]['id']) => {
    commitEditorRecipe({
      ...defaultTextureLabRecipeForGenerator(recipe.generator),
      spline: textureLabSplinePreset(presetId),
    });
  };
  const patchSpline = (splinePatch: Partial<TextureLabSplineRecipe>) => {
    if (!spline) return;
    patch({ spline: { ...spline, ...splinePatch } });
  };
  const setShape = (nextShape: TextureLabShapeRecipe) => {
    patch({ shape: nextShape });
  };
  const updateShapeLayer = (layerId: string, patchLayer: Partial<TextureLabShapeElement>) => {
    if (!shape) return;
    setShape({
      ...shape,
      selectedLayerId: layerId,
      layers: shape.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        const nextLayer = { ...layer, ...patchLayer };
        if (
          (patchLayer.sides !== undefined || patchLayer.innerRadius !== undefined) &&
          (layer.kind === 'polygon' || layer.kind === 'star')
        ) {
          return textureLabShapeElement(layer.kind, {
            ...nextLayer,
            id: layer.id,
            points: undefined,
          });
        }
        return nextLayer;
      }),
    });
  };
  const addShapeLayer = (kind: TextureLabShapeElementKind) => {
    if (!shape || shape.layers.length >= 8) return;
    const id = `${kind}-${Date.now().toString(36)}`;
    const layer = textureLabShapeElement(kind, { id });
    setShape({ ...shape, selectedLayerId: id, layers: [...shape.layers, layer] });
  };
  const duplicateShapeLayer = (layerId: string) => {
    if (!shape || shape.layers.length >= 8) return;
    const layer = shape.layers.find((item) => item.id === layerId);
    if (!layer) return;
    const id = `${layer.kind}-${Date.now().toString(36)}`;
    const copy = {
      ...layer,
      id,
      label: `${layer.label} Copy`,
      x: Math.min(1, layer.x + 0.05),
      y: Math.min(1, layer.y + 0.05),
    };
    setShape({ ...shape, selectedLayerId: id, layers: [...shape.layers, copy] });
  };
  const deleteShapeLayer = (layerId: string) => {
    if (!shape || shape.layers.length <= 1) return;
    const layers = shape.layers.filter((layer) => layer.id !== layerId);
    setShape({ selectedLayerId: layers[0]?.id, layers });
  };
  const moveShapeLayer = (layerId: string, direction: -1 | 1) => {
    if (!shape) return;
    const index = shape.layers.findIndex((layer) => layer.id === layerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= shape.layers.length) return;
    const layers = [...shape.layers];
    const [layer] = layers.splice(index, 1);
    layers.splice(target, 0, layer);
    setShape({ ...shape, selectedLayerId: layerId, layers });
  };
  const selectShapePreset = (presetId: (typeof TEXTURE_LAB_SHAPE_PRESETS)[number]['id']) => {
    commitEditorRecipe({
      ...defaultTextureLabRecipeForGenerator('shape-composer'),
      shape: textureLabShapePreset(presetId),
    });
  };
  const saveCurrentRecipe = () => {
    const name = normalizeSavedRecipeInput(savedRecipeName) || suggestedSavedRecipeName;
    const willUpdate = savedRecipes.some((savedRecipe) => savedRecipe.name.toLowerCase() === name.toLowerCase());
    saveTextureLabRecipe(name, recipe);
    setSavedRecipeName('');
    toast.success(`${name} ${willUpdate ? 'updated' : 'saved'}`);
  };
  const loadSavedRecipe = (id: string) => {
    const savedRecipe = savedRecipes.find((item) => item.id === id);
    if (!savedRecipe) return;
    setRecipe(savedRecipe.recipe);
    setSavedRecipeName(savedRecipe.name);
    toast.success(`${savedRecipe.name} loaded`);
  };
  const deleteSavedRecipe = (id: string) => {
    const savedRecipe = savedRecipes.find((item) => item.id === id);
    deleteTextureLabSavedRecipe(id);
    if (savedRecipe) toast.success(`${savedRecipe.name} removed`);
  };

  useEffect(() => {
    if (!customAtlasEnabled) {
      setCustomAtlasPixels(null);
      setCustomAtlasError(null);
      return;
    }
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void renderTextureLabCustomAtlasPixels(recipe)
        .then((nextPixels) => {
          if (!cancelled) setCustomAtlasPixels(nextPixels);
        })
        .catch((error) => {
          if (cancelled) return;
          setCustomAtlasPixels(null);
          setCustomAtlasError(error instanceof Error ? error.message : 'Custom atlas preview failed');
        });
    }, 90);
    setCustomAtlasError(null);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [customAtlasEnabled, recipe]);

  useEffect(() => {
    if (customAtlasEnabled || !imageMaskReady) {
      setAsyncPreviewPixels(null);
      setAsyncPreviewError(null);
      return;
    }
    let cancelled = false;
    setAsyncPreviewError(null);
    const render = atlasEnabled ? renderTextureLabAtlasPixelsAsync(recipe) : renderTextureLabPixelsAsync(recipe);
    void render
      .then((nextPixels) => {
        if (!cancelled) setAsyncPreviewPixels(nextPixels);
      })
      .catch((error) => {
        if (cancelled) return;
        setAsyncPreviewPixels(null);
        setAsyncPreviewError(error instanceof Error ? error.message : 'Image mask preview failed');
      });
    return () => {
      cancelled = true;
    };
  }, [atlasEnabled, customAtlasEnabled, imageMaskReady, recipe]);

  useEffect(() => {
    if (!atlasEnabled) return;
    setSelectedAtlasFrame((frame) => Math.min(frame, Math.max(0, atlasSettings.frameCount - 1)));
  }, [atlasEnabled, atlasSettings.frameCount]);

  useEffect(() => {
    if (!atlasEnabled || customAtlasEnabled) return;
    const customFrames = textureLabMaterializeAtlasFrames(recipe, atlasSettings, atlasSettings.preset);
    const firstFrameRecipe = customFrames[0]?.recipe;
    setRecipe({
      ...(firstFrameRecipe ? { ...firstFrameRecipe, ...textureDimensionFields } : recipe),
      atlas: normalizeTextureLabAtlasSettings({
        ...atlasSettings,
        enabled: true,
        preset: 'custom-frames',
        customFrames,
      }),
    });
    setSelectedAtlasFrame(0);
  }, [atlasEnabled, atlasSettings, customAtlasEnabled, recipe, setRecipe]);

  return (
    <div
      className={cn(
        'grid min-h-0 gap-4',
        compact
          ? 'text-xs'
          : cn(
              'h-full grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden lg:grid-rows-1',
              atlasEnabled
                ? 'lg:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)_minmax(13rem,15rem)] xl:grid-cols-[minmax(20rem,22rem)_minmax(0,1fr)_minmax(14rem,16rem)]'
                : 'lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]',
            ),
      )}
    >
      <section className={cn('min-h-0 overflow-hidden rounded-md border bg-card', compact ? '' : 'h-full')}>
        <div
          className={cn(
            'grid min-h-0 gap-3 p-3',
            compact ? '' : 'h-full content-start overflow-y-auto [scrollbar-gutter:stable]',
          )}
          data-testid="texture-lab-controls-panel"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <SparklesIcon className="size-3.5" />
                Texture Lab
              </div>
              <h2 className={cn('truncate font-semibold', compact ? 'text-sm' : 'text-xl')}>
                {selectedGenerator.label}
              </h2>
              <p className="text-xs text-muted-foreground">{selectedGenerator.description}</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-8 shrink-0"
              title="Randomize seed"
              disabled={selectedCustomFrameIsUploaded}
              onClick={() => patch({ seed: randomSeed() })}
            >
              <Dice5Icon className="size-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded border border-border/70 p-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={recipe.tileable}
                onCheckedChange={(checked) => patch({ tileable: checked === true })}
              />
              Tileable
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={recipe.pixelated}
                onCheckedChange={(checked) => patch({ pixelated: checked === true })}
              />
              Pixelated
            </label>
          </div>

          {atlasEnabled && (
            <div className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-[10px] text-primary">
              Editing atlas frame {selectedAtlasFrame + 1} of {atlasSettings.frameCount}. Use the right panel for frame
              layout, seeded fills, onion skin, and replacement actions.
            </div>
          )}

          {selectedCustomFrameIsUploaded && (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-900 dark:text-amber-200"
              data-testid="texture-lab-uploaded-frame-readonly"
            >
              Uploaded frames are replace-only. Select a generated frame to edit Texture Lab recipe controls.
            </div>
          )}

          <fieldset
            disabled={selectedCustomFrameIsUploaded}
            className={cn('grid gap-3', selectedCustomFrameIsUploaded && 'opacity-55')}
          >
            <div className="grid gap-2">
              <Label className="text-[10px] text-muted-foreground">Generator</Label>
              <Select
                value={recipe.generator}
                onValueChange={(generator) => selectGenerator(generator as TextureLabRecipe['generator'])}
                disabled={selectedCustomFrameIsUploaded}
              >
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

            {imageMaskGenerator && (
              <div className="grid gap-2 rounded-md border border-border/70 p-2" data-testid="texture-lab-image-mask">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <ImageIcon className="size-3.5" />
                      Image source
                    </Label>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {recipe.imageMask
                        ? `${recipe.imageMask.name} - ${recipe.imageMask.width} x ${recipe.imageMask.height}`
                        : 'Import an image to extract a mask.'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                    onClick={() => imageMaskInputRef.current?.click()}
                  >
                    <UploadIcon className="size-3.5" />
                    {recipe.imageMask ? 'Replace' : 'Upload'}
                  </Button>
                  <input
                    ref={imageMaskInputRef}
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/bmp"
                    data-testid="texture-lab-image-mask-input"
                    onChange={(event) => void uploadImageMaskSource(event)}
                  />
                </div>
                {recipe.generator === 'image-color-key-mask' && (
                  <div className="grid gap-1">
                    <Label className="text-[10px] text-muted-foreground">Color key</Label>
                    <Input
                      aria-label="Image mask color key"
                      className="h-8 cursor-pointer p-1"
                      type="color"
                      value={recipe.imageMask?.colorKey ?? '#000000'}
                      onChange={(event) =>
                        patch({
                          imageMask: {
                            dataBase64: recipe.imageMask?.dataBase64 ?? '',
                            mimeType: recipe.imageMask?.mimeType ?? 'image/png',
                            name: recipe.imageMask?.name ?? 'source-image.png',
                            width: recipe.imageMask?.width ?? textureDimensions.width,
                            height: recipe.imageMask?.height ?? textureDimensions.height,
                            colorKey: event.target.value,
                          },
                        })
                      }
                    />
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground">
                  Use Threshold as tolerance and Softness as the edge blend. Edge masks use Contrast for stronger
                  outlines.
                </div>
                {asyncPreviewError && (
                  <div className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
                    {asyncPreviewError}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2 rounded-md border border-border/70 p-2" data-testid="texture-lab-saved-recipes">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <BookmarkIcon className="size-3.5" />
                  Saved recipes
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {savedRecipes.length}/{TEXTURE_LAB_SAVED_RECIPE_LIMIT}
                </span>
              </div>
              <div className="flex min-w-0 gap-2">
                <Input
                  aria-label="Saved recipe name"
                  className="h-8 min-w-0 text-xs"
                  placeholder={suggestedSavedRecipeName}
                  value={savedRecipeName}
                  maxLength={64}
                  onChange={(event) => setSavedRecipeName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    saveCurrentRecipe();
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                  aria-label="Save recipe"
                  title="Save recipe"
                  onClick={saveCurrentRecipe}
                >
                  <SaveIcon className="size-3.5" />
                  Save
                </Button>
              </div>
              {savedRecipes.length === 0 ? (
                <div className="rounded border border-dashed border-border/70 px-2 py-2 text-[10px] text-muted-foreground">
                  Save recipes like blue spark, rain slash thin, or water mask noise for quick reuse.
                </div>
              ) : (
                <div className="grid max-h-44 gap-1.5 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                  {savedRecipes.map((savedRecipe) => (
                    <div
                      key={savedRecipe.id}
                      className="flex min-w-0 items-center gap-1 rounded border border-border/60 p-1"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/60"
                        aria-label={`Load saved recipe ${savedRecipe.name}`}
                        onClick={() => loadSavedRecipe(savedRecipe.id)}
                      >
                        <span className="block truncate font-medium">{savedRecipe.name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {textureLabGeneratorLabel(savedRecipe.recipe)} -{' '}
                          {textureLabDimensionLabel(textureLabRecipeDimensions(savedRecipe.recipe))}
                        </span>
                      </button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        aria-label={`Delete saved recipe ${savedRecipe.name}`}
                        title={`Delete ${savedRecipe.name}`}
                        onClick={() => deleteSavedRecipe(savedRecipe.id)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Dimensions</Label>
                <Select
                  value={textureSizeSelectValue}
                  onValueChange={(size) => {
                    if (size === 'custom') {
                      setCustomDimensionsOpen(true);
                      return;
                    }
                    setCustomDimensionsOpen(false);
                    const nextSize = Number(size);
                    patchDimensions(nextSize, nextSize);
                  }}
                >
                  <SelectTrigger size="sm" className="w-full" aria-label="Texture size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEXTURE_LAB_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} x {size}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom</SelectItem>
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
              {textureSizeSelectValue === 'custom' && (
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-[10px] text-muted-foreground">Width</Label>
                    <Input
                      aria-label="Texture width"
                      className="h-8 text-xs"
                      type="number"
                      min={TEXTURE_LAB_MIN_DIMENSION}
                      max={TEXTURE_LAB_MAX_DIMENSION}
                      value={textureDimensions.width}
                      onChange={(event) => patchDimensions(Number(event.target.value), textureDimensions.height)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px] text-muted-foreground">Height</Label>
                    <Input
                      aria-label="Texture height"
                      className="h-8 text-xs"
                      type="number"
                      min={TEXTURE_LAB_MIN_DIMENSION}
                      max={TEXTURE_LAB_MAX_DIMENSION}
                      value={textureDimensions.height}
                      onChange={(event) => patchDimensions(textureDimensions.width, Number(event.target.value))}
                    />
                  </div>
                </div>
              )}
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
                    onChange={(event) =>
                      patch({ [control.key]: Number(event.target.value) } as Partial<TextureLabRecipe>)
                    }
                  />
                </div>
              ))}
            </div>

            {isSpline && spline && (
              <div className="grid gap-2 rounded-md border border-border/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Path presets
                  </Label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={spline.closed}
                      onCheckedChange={(checked) => patchSpline({ closed: checked === true })}
                    />
                    Closed
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TEXTURE_LAB_SPLINE_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => selectSplinePreset(preset.id)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] text-muted-foreground">Overlap</Label>
                  <Select
                    value={spline.overlapMode}
                    onValueChange={(overlapMode) =>
                      patchSpline({ overlapMode: overlapMode as TextureLabSplineOverlapMode })
                    }
                  >
                    <SelectTrigger size="sm" className="w-full" aria-label="Spline overlap resolution">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEXTURE_LAB_SPLINE_OVERLAP_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {SPLINE_OVERLAP_LABELS[mode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2')}>
                  {SPLINE_NUMBER_CONTROLS.map((control) => (
                    <div key={control.key} className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">{control.label}</Label>
                      <Input
                        aria-label={`Spline ${control.label.toLowerCase()}`}
                        className="h-8 text-xs"
                        type="number"
                        value={spline[control.key]}
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        onChange={(event) =>
                          patchSpline({ [control.key]: Number(event.target.value) } as Partial<TextureLabSplineRecipe>)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isShapeComposer && shape && (
              <div
                className="grid gap-3 rounded-md border border-border/70 p-2"
                data-testid="texture-lab-shape-controls"
              >
                <div className="grid gap-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Shape presets
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEXTURE_LAB_SHAPE_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => selectShapePreset(preset.id)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2" data-testid="texture-lab-shape-layer-stack">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Layers
                    </Label>
                    <span className="text-[10px] text-muted-foreground">{shape.layers.length}/8</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TEXTURE_LAB_SHAPE_ELEMENT_KINDS.map((kind) => (
                      <Button
                        key={kind}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-[10px]"
                        disabled={shape.layers.length >= 8}
                        onClick={() => addShapeLayer(kind)}
                      >
                        <PlusIcon className="size-3" />
                        {formatLabel(kind)}
                      </Button>
                    ))}
                  </div>
                  <div className="grid gap-1.5">
                    {shape.layers.map((layer, index) => (
                      <div
                        key={layer.id}
                        className={cn(
                          'flex min-w-0 items-center gap-1 rounded border p-1 text-xs',
                          layer.id === selectedShapeLayer?.id && 'border-primary bg-primary/10',
                          !layer.enabled && 'opacity-60',
                        )}
                      >
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0"
                          title={layer.enabled ? `Disable ${layer.label}` : `Enable ${layer.label}`}
                          onClick={() => updateShapeLayer(layer.id, { enabled: !layer.enabled })}
                        >
                          {layer.enabled ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
                        </Button>
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left"
                          onClick={() => setShape({ ...shape, selectedLayerId: layer.id })}
                        >
                          <span className="font-medium">{layer.label}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground">{formatLabel(layer.kind)}</span>
                        </button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0"
                          title="Move layer up"
                          disabled={index === 0}
                          onClick={() => moveShapeLayer(layer.id, -1)}
                        >
                          <ArrowUpIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0"
                          title="Move layer down"
                          disabled={index === shape.layers.length - 1}
                          onClick={() => moveShapeLayer(layer.id, 1)}
                        >
                          <ArrowDownIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0"
                          title="Duplicate layer"
                          disabled={shape.layers.length >= 8}
                          onClick={() => duplicateShapeLayer(layer.id)}
                        >
                          <CopyIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0"
                          title="Delete layer"
                          disabled={shape.layers.length <= 1}
                          onClick={() => deleteShapeLayer(layer.id)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedShapeLayer && (
                  <div className="grid gap-2 rounded border border-border/60 p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">Fill</Label>
                        <Input
                          aria-label="Shape fill color"
                          className="h-8 cursor-pointer p-1"
                          type="color"
                          value={selectedShapeLayer.fillColor}
                          onChange={(event) =>
                            updateShapeLayer(selectedShapeLayer.id, { fillColor: event.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">Stroke</Label>
                        <Input
                          aria-label="Shape stroke color"
                          className="h-8 cursor-pointer p-1"
                          type="color"
                          value={selectedShapeLayer.strokeColor}
                          onChange={(event) =>
                            updateShapeLayer(selectedShapeLayer.id, { strokeColor: event.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">Blend</Label>
                        <Select
                          value={selectedShapeLayer.blendMode}
                          onValueChange={(blendMode) =>
                            updateShapeLayer(selectedShapeLayer.id, {
                              blendMode: blendMode as TextureLabShapeElement['blendMode'],
                            })
                          }
                        >
                          <SelectTrigger size="sm" className="w-full" aria-label="Shape blend mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TEXTURE_LAB_SHAPE_BLEND_MODES.map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {formatLabel(mode)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">Repeat</Label>
                        <Select
                          value={selectedShapeLayer.repeat.mode}
                          onValueChange={(mode) =>
                            updateShapeLayer(selectedShapeLayer.id, {
                              repeat: { ...selectedShapeLayer.repeat, mode: mode as TextureLabShapeRepeatMode },
                            })
                          }
                        >
                          <SelectTrigger size="sm" className="w-full" aria-label="Shape repeat mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TEXTURE_LAB_SHAPE_REPEAT_MODES.map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {formatLabel(mode)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {SHAPE_NUMBER_CONTROLS.filter((control) => {
                        if (control.key === 'sides' || control.key === 'innerRadius') {
                          return selectedShapeLayer.kind === 'polygon' || selectedShapeLayer.kind === 'star';
                        }
                        if (control.key === 'cornerRoundness') {
                          return (
                            selectedShapeLayer.kind === 'polygon' ||
                            selectedShapeLayer.kind === 'star' ||
                            selectedShapeLayer.kind === 'rect'
                          );
                        }
                        return true;
                      }).map((control) => (
                        <div key={control.key} className="grid gap-1">
                          <Label className="text-[10px] text-muted-foreground">{control.label}</Label>
                          <Input
                            aria-label={`Shape ${control.label.toLowerCase()}`}
                            className="h-8 text-xs"
                            type="number"
                            value={selectedShapeLayer[control.key]}
                            min={control.min}
                            max={control.max}
                            step={control.step}
                            onChange={(event) =>
                              updateShapeLayer(selectedShapeLayer.id, {
                                [control.key]: Number(event.target.value),
                              } as Partial<TextureLabShapeElement>)
                            }
                          />
                        </div>
                      ))}
                    </div>

                    {selectedShapeLayer.repeat.mode !== 'none' && (
                      <div className="grid grid-cols-2 gap-2">
                        {REPEAT_NUMBER_CONTROLS.map((control) => (
                          <div key={control.key} className="grid gap-1">
                            <Label className="text-[10px] text-muted-foreground">{control.label}</Label>
                            <Input
                              aria-label={`Shape repeat ${control.label.toLowerCase()}`}
                              className="h-8 text-xs"
                              type="number"
                              value={selectedShapeLayer.repeat[control.key]}
                              min={control.min}
                              max={control.max}
                              step={control.step}
                              onChange={(event) =>
                                updateShapeLayer(selectedShapeLayer.id, {
                                  repeat: {
                                    ...selectedShapeLayer.repeat,
                                    [control.key]: Number(event.target.value),
                                  },
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {!isShapeComposer && (
                <div className="grid gap-1">
                  <Label className="text-[10px] text-muted-foreground">Color ramp</Label>
                  <Select
                    value={recipe.colorRamp}
                    onValueChange={(colorRamp) => patch({ colorRamp: colorRamp as TextureLabRecipe['colorRamp'] })}
                  >
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
              )}
              {!isShapeComposer && recipe.colorRamp === 'solid' && (
                <div className="grid gap-1">
                  <Label className="text-[10px] text-muted-foreground">Solid color</Label>
                  <Input
                    aria-label="Texture solid color"
                    className="h-8 cursor-pointer p-1"
                    type="color"
                    value={recipe.solidColor}
                    onChange={(event) => patch({ solidColor: event.target.value })}
                  />
                </div>
              )}
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Background</Label>
                <Input
                  aria-label="Texture background color"
                  className="h-8 cursor-pointer p-1"
                  type="color"
                  value={recipe.backgroundColor}
                  onChange={(event) =>
                    patch({
                      backgroundColor: event.target.value,
                      backgroundAlpha: recipe.backgroundAlpha === 0 ? 1 : recipe.backgroundAlpha,
                    })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Alpha</Label>
                <Select
                  value={recipe.alphaMode}
                  onValueChange={(alphaMode) => patch({ alphaMode: alphaMode as TextureLabRecipe['alphaMode'] })}
                >
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
              <div className="grid gap-1">
                <Label className="text-[10px] text-muted-foreground">Background alpha</Label>
                <Input
                  aria-label="Texture background alpha"
                  className="h-8 text-xs"
                  type="number"
                  value={recipe.backgroundAlpha}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(event) =>
                    patch({ backgroundAlpha: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })
                  }
                />
              </div>
            </div>
          </fieldset>

          {compact && (
            <TextureLabActionControls applyLabel={applyLabel} applyDisabled={applyDisabled} onApply={onApply} />
          )}
        </div>
      </section>

      <section className={cn('min-h-0 overflow-hidden rounded-md border bg-card select-none', compact ? '' : 'h-full')}>
        <div
          className={cn(
            'grid min-h-0 gap-3 p-3',
            compact ? '' : 'h-full content-start overflow-y-auto [scrollbar-gutter:stable]',
          )}
          data-testid="texture-lab-main-panel"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preview</div>
              <div className="text-xs text-muted-foreground">
                {atlasEnabled
                  ? `Editing frame ${selectedAtlasFrame + 1} - ${textureDimensionText}`
                  : `${textureDimensionText} PNG`}
              </div>
            </div>
            <ImageIcon className="size-4 text-muted-foreground" />
          </div>
          {isShapeComposer && shape && !compact && !selectedCustomFrameIsUploaded ? (
            <TextureShapeEditor
              shape={shape}
              pixelated={recipe.pixelated}
              dataUrl={editorDataUrl}
              aspectRatio={textureAspectRatio}
              onChange={(nextShape) => patch({ shape: nextShape })}
            />
          ) : isSpline && spline && !compact && !selectedCustomFrameIsUploaded ? (
            <TextureSplineEditor
              spline={spline}
              pixelated={recipe.pixelated}
              dataUrl={editorDataUrl}
              aspectRatio={textureAspectRatio}
              onChange={(nextSpline) => patch({ spline: nextSpline })}
            />
          ) : (
            <div className="rounded-md border border-border/70 bg-card p-2">
              <div className="grid min-h-[24rem] place-items-center rounded-sm bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-4">
                <img
                  data-testid="texture-lab-preview"
                  alt="Generated texture preview"
                  src={editorDataUrl}
                  style={{ aspectRatio: textureAspectRatio }}
                  className={cn(
                    'max-h-[64vh] w-full max-w-[48rem] object-contain drop-shadow-sm select-none',
                    recipe.pixelated && '[image-rendering:pixelated]',
                  )}
                />
              </div>
            </div>
          )}
          {!compact && (
            <Collapsible
              open={presetsOpen}
              onOpenChange={setPresetsOpen}
              className="rounded-md border border-border/70"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
                  aria-label={presetsOpen ? 'Collapse texture presets' : 'Expand texture presets'}
                >
                  <span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Presets
                    </span>
                    <span className="text-muted-foreground">{TEXTURE_LAB_GENERATORS.length} generator starters</span>
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      'size-4 shrink-0 text-muted-foreground transition-transform',
                      presetsOpen && 'rotate-180',
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid gap-2 border-t border-border/70 p-3 sm:grid-cols-2 xl:grid-cols-3">
                  {TEXTURE_LAB_GENERATORS.map((generator) => (
                    <button
                      key={generator.id}
                      type="button"
                      className={cn(
                        'grid gap-1 rounded-md border p-2 text-left text-xs transition-colors hover:bg-muted/50',
                        generator.id === recipe.generator && 'border-primary bg-primary/10',
                      )}
                      onClick={() => selectGenerator(generator.id)}
                    >
                      <span className="font-medium">{generator.label}</span>
                      <span className="line-clamp-2 text-[10px] text-muted-foreground">{generator.description}</span>
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </section>
      {atlasEnabled && (
        <section
          className={cn('min-h-0 overflow-hidden rounded-md border bg-card', compact ? '' : 'h-full')}
          data-testid="texture-lab-atlas-panel"
        >
          <div
            className={cn(
              'grid min-h-0 content-start gap-3 p-3',
              compact ? '' : 'h-full overflow-y-auto [scrollbar-gutter:stable]',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <FilmIcon className="size-3.5" />
                  Atlas Workspace
                </div>
                <div className="text-sm font-semibold">Frame {selectedAtlasFrame + 1}</div>
                <div className="text-[10px] text-muted-foreground">
                  {atlasSettings.columns} x {atlasSettings.rows}, {atlasSettings.frameCount} frames at{' '}
                  {atlasSettings.fps} FPS
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={clearAtlas}>
                Clear
              </Button>
            </div>

            <div className="grid gap-2 rounded-md border border-border/70 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sheet</div>
              <div className="grid min-h-28 place-items-center rounded-sm bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:14px_14px] bg-[position:0_0,0_7px,7px_-7px,-7px_0px] p-2">
                {atlasPixels ? (
                  <img
                    data-testid="texture-lab-atlas-sheet"
                    alt="Generated texture atlas"
                    src={dataUrl}
                    className={cn(
                      'max-h-44 w-full object-contain drop-shadow-sm',
                      recipe.pixelated && '[image-rendering:pixelated]',
                    )}
                  />
                ) : (
                  <span className="text-[10px] text-muted-foreground">Rendering atlas...</span>
                )}
              </div>
              {customAtlasError && (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive">
                  {customAtlasError}
                </div>
              )}
            </div>

            <div className="grid gap-2 rounded-md border border-border/70 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Layout</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label className="text-[10px] text-muted-foreground">Playback</Label>
                  <Select
                    value={atlasSettings.playback}
                    onValueChange={(playback) =>
                      patchAtlas({ playback: playback as TextureLabAtlasSettings['playback'] })
                    }
                  >
                    <SelectTrigger size="sm" className="w-full" aria-label="Atlas particle playback">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEXTURE_LAB_ATLAS_PLAYBACK_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {formatLabel(mode)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] text-muted-foreground">Mode</Label>
                  <Select
                    value={atlasSettings.mode}
                    onValueChange={(mode) => patchAtlas({ mode: mode as TextureLabAtlasSettings['mode'] })}
                  >
                    <SelectTrigger size="sm" className="w-full" aria-label="Atlas mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEXTURE_LAB_ATLAS_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {formatLabel(mode)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {[
                  ['columns', 'Columns', 1, 8],
                  ['rows', 'Rows', 1, 8],
                  [
                    'frameCount',
                    'Frames',
                    1,
                    atlasSettings.playback === 'variants'
                      ? TEXTURE_LAB_ATLAS_VARIANT_FRAME_LIMIT
                      : TEXTURE_LAB_ATLAS_LIFETIME_FRAME_LIMIT,
                  ],
                  ['seedStep', 'Seed step', 1, 9999],
                  ['fps', 'FPS', 1, 60],
                ].map(([key, label, min, max]) => (
                  <div key={String(key)} className="grid gap-1">
                    <Label className="text-[10px] text-muted-foreground">{label}</Label>
                    <Input
                      aria-label={`Atlas ${String(label).toLowerCase()}`}
                      className="h-8 text-xs"
                      type="number"
                      value={atlasSettings[key as keyof TextureLabAtlasSettings] as number}
                      min={min as number}
                      max={max as number}
                      onChange={(event) =>
                        patchAtlas({
                          [key as keyof TextureLabAtlasSettings]: Number(event.target.value),
                        } as Partial<TextureLabAtlasSettings>)
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Variant playback is capped at {TEXTURE_LAB_ATLAS_VARIANT_FRAME_LIMIT} frames; lifetime flipbooks are
                capped at {TEXTURE_LAB_ATLAS_LIFETIME_FRAME_LIMIT}.
              </div>
            </div>

            <div className="grid gap-2 rounded-md border border-border/70 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Seeded Fill
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Select
                  value={atlasFillPreset}
                  onValueChange={(preset) => setAtlasFillPreset(preset as TextureLabAtlasPreset)}
                >
                  <SelectTrigger size="sm" className="w-full" aria-label="Seeded fill preset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEXTURE_LAB_ATLAS_FILL_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {TEXTURE_LAB_ATLAS_PRESET_LABELS[preset]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 px-2 text-xs"
                  onClick={() => fillAtlasFramesFromPreset(atlasFillPreset)}
                >
                  <SparklesIcon className="size-3.5" />
                  Fill frames
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Fill frames overwrites every slot with editable generated recipes.
              </div>
            </div>

            <div className="grid gap-2 rounded-md border border-border/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected Frame
                </div>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                  {selectedCustomFrameIsUploaded ? 'Uploaded' : 'Recipe'}
                </span>
              </div>
              <div className="relative grid aspect-square place-items-center overflow-hidden rounded-sm border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:14px_14px] bg-[position:0_0,0_7px,7px_-7px,-7px_0px] p-2">
                {customAtlasEnabled && atlasSettings.onionSkin && previousCustomFrameDataUrl && (
                  <img
                    data-testid="texture-lab-onion-past"
                    alt=""
                    aria-hidden="true"
                    src={previousCustomFrameDataUrl}
                    className={cn(
                      'absolute inset-2 size-[calc(100%-1rem)] object-contain opacity-35 mix-blend-multiply [filter:brightness(0)_saturate(100%)_invert(23%)_sepia(99%)_saturate(3848%)_hue-rotate(342deg)_brightness(98%)_contrast(95%)]',
                      recipe.pixelated && '[image-rendering:pixelated]',
                    )}
                  />
                )}
                {atlasFrameDataUrl && (
                  <img
                    alt="Selected atlas frame"
                    src={atlasFrameDataUrl}
                    className={cn(
                      'relative z-10 h-full w-full object-contain',
                      recipe.pixelated && '[image-rendering:pixelated]',
                    )}
                  />
                )}
                {customAtlasEnabled && atlasSettings.onionSkin && nextCustomFrameDataUrl && (
                  <img
                    data-testid="texture-lab-onion-future"
                    alt=""
                    aria-hidden="true"
                    src={nextCustomFrameDataUrl}
                    className={cn(
                      'absolute inset-2 size-[calc(100%-1rem)] object-contain opacity-35 mix-blend-multiply [filter:brightness(0)_saturate(100%)_invert(61%)_sepia(76%)_saturate(1162%)_hue-rotate(84deg)_brightness(96%)_contrast(96%)]',
                      recipe.pixelated && '[image-rendering:pixelated]',
                    )}
                  />
                )}
              </div>
              <div className="rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground">
                {selectedCustomFrame?.name ?? `Frame ${selectedAtlasFrame + 1}`}
                {selectedCustomFrameIsEditable && (
                  <span className="ml-1">is editable with the controls on the left.</span>
                )}
                {selectedCustomFrameIsUploaded && (
                  <span className="ml-1">
                    is an uploaded bitmap and can be replaced, copied, onion-skinned, and exported.
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-2 rounded-md border border-border/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Frames</div>
                <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Checkbox
                    checked={atlasSettings.onionSkin}
                    onCheckedChange={(checked) => patchAtlas({ onionSkin: checked === true })}
                  />
                  Onion skin
                </label>
              </div>
              <div
                className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 overflow-y-auto pr-1 [content-visibility:auto] [scrollbar-gutter:stable]"
                data-testid="texture-lab-atlas-frame-grid"
              >
                {atlasPixels?.frames.map((frame) => {
                  const customFrame = customAtlasFrameAt(atlasSettings, frame.index, false);
                  return (
                    <button
                      key={frame.index}
                      type="button"
                      className={cn(
                        'grid aspect-square place-items-end overflow-hidden rounded border bg-card text-[9px] text-white shadow-sm transition-colors',
                        frame.index === selectedAtlasFrame
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-border/70 hover:border-primary/60',
                      )}
                      style={atlasFrameStyles[frame.index]}
                      aria-label={`Select atlas frame ${frame.index + 1}`}
                      onClick={() => selectAtlasFrame(frame.index)}
                    >
                      <span className="rounded-tl bg-black/65 px-1">{frame.index + 1}</span>
                      <span className="rounded-tl bg-black/65 px-1">
                        {customFrame && !customFrame.recipe ? 'Upload' : 'Recipe'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 p-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-[10px]"
                onClick={() => customFrameInputRef.current?.click()}
              >
                <UploadIcon className="size-3" />
                Replace frame
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-[10px]"
                disabled={!selectedCustomFrame}
                onClick={() => setAtlasConfirmAction('copy-selected-to-all')}
              >
                <CopyIcon className="size-3" />
                Copy selected to all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-[10px] text-destructive hover:text-destructive"
                onClick={() => setAtlasConfirmAction('empty-all-frames')}
              >
                <Trash2Icon className="size-3" />
                Empty all frames
              </Button>
              <input
                ref={customFrameInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/bmp"
                className="hidden"
                data-testid="texture-lab-custom-frame-input"
                onChange={(event) => void replaceSelectedCustomFrame(event)}
              />
            </div>
          </div>
        </section>
      )}
      <Dialog
        open={atlasConfirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setAtlasConfirmAction(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {atlasConfirmAction === 'copy-selected-to-all' ? 'Copy selected frame to all?' : 'Empty all atlas frames?'}
            </DialogTitle>
            <DialogDescription>
              {atlasConfirmAction === 'copy-selected-to-all'
                ? `This replaces every other atlas frame with frame ${selectedAtlasFrame + 1}. The current sheet has ${atlasSettings.frameCount} frames.`
                : `This replaces all ${atlasSettings.frameCount} atlas frames with transparent editable frames.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAtlasConfirmAction(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={runAtlasConfirmedAction}>
              {atlasConfirmAction === 'copy-selected-to-all' ? 'Copy to all' : 'Empty frames'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
