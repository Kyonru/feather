import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  Dice5Icon,
  DownloadIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  MousePointer2Icon,
  PlusIcon,
  RotateCcwIcon,
  RefreshCwIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  TEXTURE_LAB_SHAPE_BLEND_MODES,
  TEXTURE_LAB_SHAPE_ELEMENT_KINDS,
  TEXTURE_LAB_SHAPE_REPEAT_MODES,
  TEXTURE_LAB_SPLINE_OVERLAP_MODES,
  TEXTURE_LAB_SIZES,
  type GeneratedTextureResult,
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
  generateTextureLabTexture,
  isTextureLabSplineGenerator,
  renderTextureLabPixels,
  textureLabPixelsToDataUrl,
  TEXTURE_LAB_GENERATORS,
  TEXTURE_LAB_SHAPE_PRESETS,
  TEXTURE_LAB_SPLINE_PRESETS,
  textureLabShapeElement,
  textureLabShapePreset,
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
    'x' | 'y' | 'size' | 'rotation' | 'opacity' | 'strokeWidth' | 'feather' | 'sides' | 'innerRadius' | 'cornerRoundness'
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

export function TextureLabActionControls({
  applyLabel = 'Use texture',
  applyDisabled = false,
  onApply,
  className,
}: TextureLabActionControlsProps) {
  const { recipe, patch } = useTextureLabRecipe();

  const createTexture = () => generateTextureLabTexture(recipe);
  const resetValues = () => {
    patch(defaultTextureLabRecipeForGenerator(recipe.generator));
  };
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
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
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
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
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
  onChange: (spline: TextureLabSplineRecipe) => void;
};

function TextureSplineEditor({ spline, pixelated, dataUrl, onChange }: SplineEditorProps) {
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
        className="relative aspect-square overflow-hidden rounded-sm bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]"
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
        <svg
          className="absolute inset-0 size-full touch-none"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
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
  return splinePathData(points.map((point) => shapePointToWorld(layer, point)), layer.kind === 'spline' ? layer.spline?.closed === true : true);
}

type ShapeEditorProps = {
  shape: TextureLabShapeRecipe;
  pixelated: boolean;
  dataUrl: string;
  onChange: (shape: TextureLabShapeRecipe) => void;
};

function TextureShapeEditor({ shape, pixelated, dataUrl, onChange }: ShapeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedLayer =
    shape.layers.find((layer) => layer.id === shape.selectedLayerId) ?? shape.layers.find(shapeLayerSupportsPoints);
  const editableLayer = shapeLayerSupportsPoints(selectedLayer) ? selectedLayer : undefined;
  const editablePoints = shapeLayerEditablePoints(editableLayer);
  const [selectedPoint, setSelectedPoint] = useState<number>(0);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const draggingPointRef = useRef<number | null>(null);
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

  const endPointDrag = (pointerId?: number) => {
    if (pointerId !== undefined && (draggingPointRef.current !== null || draggingPoint !== null)) releasePointer(pointerId);
    clearWindowDragListeners();
    draggingPointRef.current = null;
    setDraggingPoint(null);
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

  return (
    <div className="grid gap-2 rounded-md border border-border/70 p-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <MousePointer2Icon className="size-3" />
            Shape editor
          </div>
          <div className="text-xs text-muted-foreground">
            Drag polygon or spline points, double-click to add, Delete removes the selected point.
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
        className="relative aspect-square overflow-hidden rounded-sm bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]"
        data-testid="texture-lab-shape-editor"
        onDoubleClick={(event) => {
          if (!editableLayer || !editablePoints) return;
          const nextIndex = Math.min(editablePoints.length, selectedPoint + 1);
          const localPoint = shapeWorldToPoint(editableLayer, pointFromEvent(event));
          const points = [
            ...editablePoints.slice(0, nextIndex),
            localPoint,
            ...editablePoints.slice(nextIndex),
          ].slice(0, 24);
          setSelectedPoint(nextIndex);
          updateLayer(
            editableLayer.kind === 'spline'
              ? { ...editableLayer, spline: { ...editableLayer.spline!, points } }
              : { ...editableLayer, points },
          );
        }}
        onPointerMove={(event) => {
          const pointIndex = draggingPointRef.current ?? draggingPoint;
          if (pointIndex === null) return;
          updatePoint(pointIndex, pointFromEvent(event));
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
          if (pointIndex === null) return;
          updatePoint(pointIndex, pointFromEvent(event));
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
        <svg
          className="absolute inset-0 size-full touch-none"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {shape.layers.filter(shapeLayerSupportsPoints).map((layer) => (
            <path
              key={layer.id}
              d={shapeLayerPathData(layer)}
              fill="none"
              stroke={layer.id === editableLayer?.id ? '#2563eb' : '#64748b'}
              strokeWidth={layer.id === editableLayer?.id ? 2.5 : 1.5}
              opacity={layer.enabled ? 0.9 : 0.35}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {editableLayer && editablePoints?.map((point, index) => {
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
        <span>{editableLayer && editablePoints ? `${editableLayer.label}: ${editablePoints.length} points` : 'Select a polygon, star, or spline layer'}</span>
        <span>{shape.layers.length} layers</span>
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
  const { recipe, setRecipe, patch } = useTextureLabRecipe();
  const pixels = useMemo(() => renderTextureLabPixels(recipe), [recipe]);
  const dataUrl = useMemo(() => textureLabPixelsToDataUrl(pixels), [pixels]);
  const selectedGenerator =
    TEXTURE_LAB_GENERATORS.find((item) => item.id === recipe.generator) ?? TEXTURE_LAB_GENERATORS[0];
  const isSpline = isTextureLabSplineGenerator(recipe.generator);
  const isShapeComposer = recipe.generator === 'shape-composer';
  const spline = recipe.spline;
  const shape = recipe.shape;
  const selectedShapeLayer = shape?.layers.find((layer) => layer.id === shape.selectedLayerId) ?? shape?.layers[0];
  const groupedGenerators = useMemo(
    () =>
      TEXTURE_LAB_GENERATORS.reduce<Record<string, typeof TEXTURE_LAB_GENERATORS>>((groups, generator) => {
        groups[generator.category] = [...(groups[generator.category] ?? []), generator];
        return groups;
      }, {}),
    [],
  );

  const selectGenerator = (generator: TextureLabRecipe['generator']) => {
    setRecipe(defaultTextureLabRecipeForGenerator(generator));
  };
  const selectSplinePreset = (presetId: (typeof TEXTURE_LAB_SPLINE_PRESETS)[number]['id']) => {
    setRecipe({
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
        if ((patchLayer.sides !== undefined || patchLayer.innerRadius !== undefined) && (layer.kind === 'polygon' || layer.kind === 'star')) {
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
    const copy = { ...layer, id, label: `${layer.label} Copy`, x: Math.min(1, layer.x + 0.05), y: Math.min(1, layer.y + 0.05) };
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
    setRecipe({
      ...defaultTextureLabRecipeForGenerator('shape-composer'),
      shape: textureLabShapePreset(presetId),
    });
  };

  return (
    <div
      className={cn(
        'grid min-h-0 gap-4',
        compact
          ? 'text-xs'
          : 'h-full grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:grid-rows-1',
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

          <div className="grid gap-2">
            <Label className="text-[10px] text-muted-foreground">Generator</Label>
            <Select
              value={recipe.generator}
              onValueChange={(generator) => selectGenerator(generator as TextureLabRecipe['generator'])}
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

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-[10px] text-muted-foreground">Size</Label>
              <Select
                value={String(recipe.size)}
                onValueChange={(size) => patch({ size: Number(size) as TextureLabRecipe['size'] })}
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
            <div className="grid gap-3 rounded-md border border-border/70 p-2" data-testid="texture-lab-shape-controls">
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
                        onChange={(event) => updateShapeLayer(selectedShapeLayer.id, { fillColor: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">Stroke</Label>
                      <Input
                        aria-label="Shape stroke color"
                        className="h-8 cursor-pointer p-1"
                        type="color"
                        value={selectedShapeLayer.strokeColor}
                        onChange={(event) => updateShapeLayer(selectedShapeLayer.id, { strokeColor: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">Blend</Label>
                      <Select
                        value={selectedShapeLayer.blendMode}
                        onValueChange={(blendMode) =>
                          updateShapeLayer(selectedShapeLayer.id, { blendMode: blendMode as TextureLabShapeElement['blendMode'] })
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
                        return selectedShapeLayer.kind === 'polygon' || selectedShapeLayer.kind === 'star' || selectedShapeLayer.kind === 'rect';
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
                {recipe.size} x {recipe.size} PNG
              </div>
            </div>
            <ImageIcon className="size-4 text-muted-foreground" />
          </div>
          {isShapeComposer && shape && !compact ? (
            <TextureShapeEditor
              shape={shape}
              pixelated={recipe.pixelated}
              dataUrl={dataUrl}
              onChange={(nextShape) => patch({ shape: nextShape })}
            />
          ) : isSpline && spline && !compact ? (
            <TextureSplineEditor
              spline={spline}
              pixelated={recipe.pixelated}
              dataUrl={dataUrl}
              onChange={(nextSpline) => patch({ spline: nextSpline })}
            />
          ) : (
            <div className="rounded-md border border-border/70 bg-card p-2">
              <div className="grid min-h-64 place-items-center rounded-sm bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-4">
                <img
                  data-testid="texture-lab-preview"
                  alt="Generated texture preview"
                  src={dataUrl}
                  className={cn(
                    'aspect-square max-h-[48vh] w-full max-w-[32rem] object-contain drop-shadow-sm select-none',
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
    </div>
  );
}
