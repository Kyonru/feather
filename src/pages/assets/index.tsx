import { useEffect, useMemo, useRef, useState } from 'react';
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog';
import { readFile, stat } from '@tauri-apps/plugin-fs';
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ClipboardIcon,
  CopyIcon,
  FolderIcon,
  ImageIcon,
  Maximize2Icon,
  MinusIcon,
  MusicIcon,
  PlayIcon,
  PlusIcon,
  TextIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  TriageEmptyState,
  TriageFilterBar,
  TriageSearch,
  TriageSummaryChip,
  TriageToolbar,
} from '@/components/triage';
import { useAssets, type AssetKind, type AudioAsset, type FontAsset, type TextureAsset } from '@/hooks/use-assets';
import { useConfigStore } from '@/store/config';
import { useDebuggerStore } from '@/store/debugger';
import { useSessionStore } from '@/store/session';
import { openFolder } from '@/utils/linking';
import { isWeb } from '@/utils/platform';
import { copyToClipboardWithMeta } from '@/utils/strings';
import { cn } from '@/utils/styles';
import { toast } from 'sonner';

function resolveAssetPath(src: string, rootPath: string, manualRootPath: string): string {
  if (src.startsWith('data:')) {
    return src;
  }

  if (manualRootPath) {
    const gamePath = src.replace(/^[a-zA-Z]:[\\/]/, '').replace(/^[/\\]+/, '');
    return manualRootPath.replace(/[/\\]+$/, '') + '/' + gamePath;
  }

  if (!rootPath || src.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(src)) {
    return src;
  }

  return rootPath.replace(/[/\\]+$/, '') + '/' + src;
}

type AssetRow = TextureAsset | FontAsset | AudioAsset;
type AssetFilter = 'all' | 'file' | 'runtime' | 'repeated' | 'missing';
type SortKey = 'name' | 'details' | 'source' | 'loadCount' | 'lastSeen';
type SortDirection = 'asc' | 'desc';

function copyText(value: string | undefined, label: string) {
  if (!value) return;
  copyToClipboardWithMeta(value);
  toast.success(`Copied ${label}`);
}

function formatBytes(value?: number) {
  if (!value || value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatClock(value?: number) {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function detailsForAsset(kind: AssetKind, asset: AssetRow) {
  if (kind === 'texture') {
    const texture = asset as TextureAsset;
    return `${texture.width}x${texture.height} ${texture.format}`;
  }
  if (kind === 'font') {
    const font = asset as FontAsset;
    return `${font.height}px ascent ${font.ascent}`;
  }
  const audio = asset as AudioAsset;
  const duration = audio.duration ? `${audio.duration.toFixed(2)}s` : 'unknown duration';
  return `${audio.srcType} ${audio.channels}ch ${duration}`;
}

function constructorSnippet(kind: AssetKind, asset: AssetRow) {
  const path = asset.path || asset.name;
  const quoted = JSON.stringify(path);
  if (kind === 'texture') return `love.graphics.newImage(${quoted})`;
  if (kind === 'font') return asset.path ? `love.graphics.newFont(${quoted})` : `love.graphics.newFont(${(asset as FontAsset).height})`;
  return `love.audio.newSource(${quoted}, ${JSON.stringify((asset as AudioAsset).srcType || 'static')})`;
}

function isMissing(missingPaths: Set<string>, path?: string) {
  return !!path && missingPaths.has(path);
}

function useGameRootPath() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const rootPaths = useDebuggerStore((state) => state.rootPaths);
  const setRootPath = useDebuggerStore((state) => state.setRootPath);
  const clearRootPath = useDebuggerStore((state) => state.clearRootPath);
  const sourceDir = useConfigStore((state) => state.config?.sourceDir ?? '');
  const rootPath = useConfigStore((state) => state.config?.root_path ?? '');
  const manualRootPath = sessionId ? (rootPaths[sessionId] ?? '') : '';

  const pickRootPath = async () => {
    if (!sessionId) return;
    const selected = await openFolderDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      setRootPath(sessionId, selected);
    }
  };

  const clearManualRootPath = () => {
    if (sessionId) clearRootPath(sessionId);
  };

  return {
    rootPath: manualRootPath || sourceDir || rootPath,
    manualRootPath,
    pickRootPath,
    clearManualRootPath,
  };
}

function useMissingAssetPaths(rows: AssetRow[]) {
  const { rootPath, manualRootPath } = useGameRootPath();
  const [missingPaths, setMissingPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const paths = Array.from(new Set(rows.map((asset) => asset.path).filter((path): path is string => !!path))).slice(0, 250);

    if (paths.length === 0) {
      setMissingPaths(new Set());
      return;
    }

    if (isWeb()) {
      setMissingPaths(new Set(paths));
      return;
    }

    Promise.all(
      paths.map(async (path) => {
        try {
          await stat(resolveAssetPath(path, rootPath, manualRootPath));
          return null;
        } catch {
          return path;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setMissingPaths(new Set(results.filter((path): path is string => !!path)));
    });

    return () => {
      cancelled = true;
    };
  }, [manualRootPath, rootPath, rows]);

  return missingPaths;
}

function usePreviewSrc(src?: string): string | null {
  const { rootPath, manualRootPath } = useGameRootPath();
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    if (!src) {
      setPreviewSrc(null);
      return;
    }

    if (src.startsWith('data:')) {
      setPreviewSrc(src);
      return;
    }

    if (src.startsWith('blob:')) {
      setPreviewSrc(src);
      return;
    }

    if (src.startsWith('feather-binary:')) {
      setPreviewSrc(null);
      return;
    }

    if (isWeb()) {
      setPreviewSrc(null);
      return;
    }

    readFile(resolveAssetPath(src, rootPath, manualRootPath))
      .then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        setPreviewSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewSrc(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [manualRootPath, rootPath, src]);

  return previewSrc;
}

function EmptyState() {
  return (
    <TriageEmptyState
      title="No assets captured yet"
      description="Assets loaded after Feather starts will appear here."
    />
  );
}

function CanvasPreview({
  alt,
  src,
  sourceWidth,
  sourceHeight,
  zoom,
  pan,
  onPanChange,
}: {
  alt: string;
  src: string;
  sourceWidth: number;
  sourceHeight: number;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;

      const width = Math.max(1, Math.round(sourceWidth * zoom));
      const height = Math.max(1, Math.round(sourceHeight * zoom));
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = zoom < 1;
      ctx.drawImage(image, 0, 0, width, height);

      if (zoom > 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= width; x += zoom) {
          const px = Math.round(x) + 0.5;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, height);
        }
        for (let y = 0; y <= height; y += zoom) {
          const py = Math.round(y) + 0.5;
          ctx.moveTo(0, py);
          ctx.lineTo(width, py);
        }
        ctx.stroke();
      }
      setLoaded(true);
    };
    image.onerror = () => {
      if (!cancelled) setLoaded(false);
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [sourceHeight, sourceWidth, src, zoom]);

  const startPan = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const movePan = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onPanChange({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY,
    });
  };

  const endPan = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <>
      {!loaded && <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-transparent" />}
      <canvas
        ref={canvasRef}
        aria-label={alt}
        role="img"
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        className={cn('rounded-md', zoom > 1 && 'cursor-grab active:cursor-grabbing', !loaded && 'hidden')}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, touchAction: 'none' }}
      />
    </>
  );
}

function AssetTable({
  kind,
  rows,
  selectedId,
  missingPaths,
  sortKey,
  sortDirection,
  onSort,
  onSelect,
  onPreview,
}: {
  kind: AssetKind;
  rows: AssetRow[];
  selectedId: number | null;
  missingPaths: Set<string>;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  onSelect: (kind: AssetKind, id: number) => void;
  onPreview: (kind: Exclude<AssetKind, 'audio'>, id: number) => void;
}) {
  if (rows.length === 0) return <EmptyState />;

  const SortButton = ({ label, keyName }: { label: string; keyName: SortKey }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-1.5 text-xs font-medium"
      onClick={() => onSort(keyName)}
      title={`Sort by ${label}`}
    >
      {label}
      {sortKey === keyName ? (
        sortDirection === 'asc' ? (
          <ArrowUpIcon className="size-3" />
        ) : (
          <ArrowDownIcon className="size-3" />
        )
      ) : (
        <ArrowUpDownIcon className="size-3 text-muted-foreground" />
      )}
    </Button>
  );

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortButton label="Name" keyName="name" />
            </TableHead>
            <TableHead>
              <SortButton label="Details" keyName="details" />
            </TableHead>
            <TableHead>
              <SortButton label="Source" keyName="source" />
            </TableHead>
            <TableHead className="w-24">
              <SortButton label="Loads" keyName="loadCount" />
            </TableHead>
            <TableHead className="w-28">
              <SortButton label="Seen" keyName="lastSeen" />
            </TableHead>
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((asset) => {
            const isSelected = selectedId === asset.id;
            const details = detailsForAsset(kind, asset);
            const missing = isMissing(missingPaths, asset.path);

            return (
              <TableRow
                key={`${kind}-${asset.id}`}
                className={cn('cursor-pointer', isSelected && 'bg-muted')}
                onClick={() => onSelect(kind, asset.id)}
              >
                <TableCell className="font-medium">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate" title={asset.name}>
                      {asset.displayName}
                    </span>
                    {(asset.loadCount ?? 1) > 1 && (
                      <Badge variant="secondary" className="h-5 font-mono text-[11px]">
                        x{asset.loadCount}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{details}</TableCell>
                <TableCell className="max-w-80 truncate font-mono text-xs text-muted-foreground">
                  <span className={cn(missing && 'text-destructive')} title={asset.path || 'Runtime-created asset'}>
                    {asset.path || 'runtime'}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{asset.loadCount ?? 1}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{formatClock(asset.lastSeen)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      title="Copy LÖVE constructor snippet"
                      onClick={(event) => {
                        event.stopPropagation();
                        copyText(constructorSnippet(kind, asset), 'constructor');
                      }}
                    >
                      <ClipboardIcon className="size-3.5" />
                    </Button>
                    {kind === 'audio' ? (
                      <Button size="icon" variant="ghost" className="size-7" disabled title="Audio preview is metadata-only">
                        <PlayIcon className="size-3.5" />
                      </Button>
                    ) : (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="size-7"
                      title="Preview asset"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(kind, asset.id);
                        onPreview(kind, asset.id);
                      }}
                    >
                      <ImageIcon className="size-3.5" />
                    </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function PreviewPanel({
  kind,
  selectedAsset,
  preview,
  resolvedPath,
  missing,
  loading,
  onPreview,
}: {
  previewSrc?: string | null;
  kind: AssetKind;
  selectedAsset: AssetRow | null;
  preview: Exclude<ReturnType<typeof useAssets>['data']['preview'], false>;
  resolvedPath?: string;
  missing?: boolean;
  loading?: boolean;
  onPreview: () => void;
}) {
  const src = usePreviewSrc(preview?.src);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const minZoom = 0.05;
  const maxZoom = 15;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [preview?.id, preview?.src]);

  const zoomOut = () => setZoom((value) => Math.max(minZoom, Number((value / 1.5).toFixed(2))));
  const zoomIn = () => setZoom((value) => Math.min(maxZoom, Number((value * 1.5).toFixed(2))));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const canPreview = !!selectedAsset && kind !== 'audio';
  const texture = kind === 'texture' && selectedAsset ? (selectedAsset as TextureAsset) : null;
  const assetTitle = selectedAsset?.displayName || 'Select an asset';
  const sourcePath = selectedAsset?.path;

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col border-t bg-background p-4 lg:w-[380px] lg:border-l lg:border-t-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium" title={assetTitle}>
            {assetTitle}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {selectedAsset ? detailsForAsset(kind, selectedAsset) : 'Select a row to inspect asset metadata'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => copyText(sourcePath, 'asset path')}
            disabled={!sourcePath}
            title={sourcePath ? 'Copy asset path' : 'Runtime asset has no source path'}
          >
            <CopyIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={zoomOut}
            disabled={!src || zoom <= minZoom}
            title="Zoom out"
          >
            <MinusIcon className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={resetZoom} disabled={!src} title="Fit">
            <Maximize2Icon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={zoomIn}
            disabled={!src || zoom >= maxZoom}
            title="Zoom in"
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>
      </div>
      <div
        className="flex h-72 min-h-0 flex-1 items-center justify-center overflow-auto rounded-md border p-3 lg:h-0"
        style={{
          backgroundColor: 'hsl(var(--muted) / 0.3)',
          backgroundImage:
            'linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          backgroundSize: '16px 16px',
        }}
      >
        {src && preview ? (
          <CanvasPreview
            alt={preview.name || 'Asset preview'}
            src={src}
            sourceWidth={preview.width}
            sourceHeight={preview.height}
            zoom={zoom}
            pan={pan}
            onPanChange={setPan}
          />
        ) : (
          <div className="grid justify-items-center gap-2 text-center text-sm text-muted-foreground">
            {loading && <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-transparent" />}
            <p>
              {!selectedAsset
                ? 'No asset selected.'
                : kind === 'audio'
                  ? 'Audio assets are metadata-only in this view.'
                  : missing
                    ? 'Asset file is not available on this machine.'
                    : loading
                      ? 'Loading preview...'
                      : 'Click preview to inspect this asset.'}
            </p>
            {canPreview && (
              <Button size="sm" variant="secondary" onClick={onPreview} disabled={loading}>
                <ImageIcon className="size-4" />
                Preview
              </Button>
            )}
          </div>
        )}
      </div>
      {selectedAsset && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>Kind</span>
          <span className="text-right font-mono">{kind}</span>
          <span>Loads</span>
          <span className="text-right font-mono">{selectedAsset.loadCount ?? 1}</span>
          <span>First seen</span>
          <span className="text-right font-mono">{formatClock(selectedAsset.firstSeen)}</span>
          <span>Last seen</span>
          <span className="text-right font-mono">{formatClock(selectedAsset.lastSeen)}</span>
          {texture && (
            <>
              <span>Texture memory</span>
              <span className="text-right font-mono">{formatBytes(texture.memoryBytes)}</span>
              <span>Mipmaps</span>
              <span className="text-right font-mono">{texture.mipmaps}</span>
              <span>Filter</span>
              <span className="text-right font-mono">
                {texture.filter ? `${texture.filter.min}/${texture.filter.mag}` : '-'}
              </span>
              <span>Wrap</span>
              <span className="text-right font-mono">{texture.wrap ? `${texture.wrap.x}/${texture.wrap.y}` : '-'}</span>
            </>
          )}
          <span>Zoom</span>
          <span className="text-right font-mono">{Math.round(zoom * 100)}%</span>
          <span>Pan</span>
          <span className="text-right font-mono">
            {Math.round(pan.x)}, {Math.round(pan.y)}
          </span>
          <span>Path</span>
          <span className="truncate text-right font-mono" title={sourcePath || 'runtime'}>
            {sourcePath || 'runtime'}
          </span>
          {resolvedPath && (
            <>
              <span>Resolved</span>
              <span className={cn('truncate text-right font-mono', missing && 'text-destructive')} title={resolvedPath}>
                {resolvedPath}
              </span>
            </>
          )}
        </div>
      )}
      {selectedAsset && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => copyText(constructorSnippet(kind, selectedAsset), 'constructor')}>
            <ClipboardIcon className="size-4" />
            Constructor
          </Button>
          <Button size="sm" variant="outline" onClick={() => copyText(resolvedPath, 'resolved path')} disabled={!resolvedPath}>
            <CopyIcon className="size-4" />
            Local Path
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => resolvedPath && openFolder(resolvedPath)}
            disabled={!resolvedPath || isWeb()}
            title={isWeb() ? 'Reveal is available in the desktop app' : 'Reveal this path'}
          >
            <FolderIcon className="size-4" />
            Reveal
          </Button>
        </div>
      )}
    </aside>
  );
}

export default function AssetsPage() {
  const { data, previewAsset, setAssetPreviewEnabled } = useAssets();
  const { rootPath, manualRootPath, pickRootPath, clearManualRootPath } = useGameRootPath();
  const assetPreviewEnabled = useConfigStore((state) => state.config?.assets?.enabled !== false);
  const [tab, setTab] = useState<AssetKind>('texture');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selected, setSelected] = useState<{ kind: AssetKind; id: number } | null>(null);
  const [previewRequest, setPreviewRequest] = useState<{ kind: AssetKind; id: number } | null>(null);
  const allRows = useMemo<AssetRow[]>(() => [...data.textures, ...data.fonts, ...data.audio], [data.audio, data.fonts, data.textures]);
  const missingPaths = useMissingAssetPaths(allRows);
  const selectedAsset = useMemo(() => {
    if (!selected) return null;
    const list = selected.kind === 'texture' ? data.textures : selected.kind === 'font' ? data.fonts : data.audio;
    return list.find((asset) => asset.id === selected.id) ?? null;
  }, [data.audio, data.fonts, data.textures, selected]);
  const selectedResolvedPath =
    selectedAsset?.path && !isWeb() ? resolveAssetPath(selectedAsset.path, rootPath, manualRootPath) : undefined;

  const rows = useMemo(() => {
    const list: AssetRow[] = tab === 'texture' ? data.textures : tab === 'font' ? data.fonts : data.audio;
    const q = search.toLowerCase();
    const filtered = list.filter((asset) => {
      const matchesSearch =
        !q ||
        asset.name.toLowerCase().includes(q) ||
        asset.displayName.toLowerCase().includes(q) ||
        (asset.path ?? '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (filter === 'file') return !!asset.path;
      if (filter === 'runtime') return !asset.path;
      if (filter === 'repeated') return (asset.loadCount ?? 1) > 1;
      if (filter === 'missing') return isMissing(missingPaths, asset.path);
      return true;
    });

    return filtered.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      const aValue =
        sortKey === 'name'
          ? a.displayName
          : sortKey === 'details'
            ? detailsForAsset(tab, a)
            : sortKey === 'source'
              ? (a.path ?? 'runtime')
              : sortKey === 'loadCount'
                ? (a.loadCount ?? 1)
                : (a.lastSeen ?? 0);
      const bValue =
        sortKey === 'name'
          ? b.displayName
          : sortKey === 'details'
            ? detailsForAsset(tab, b)
            : sortKey === 'source'
              ? (b.path ?? 'runtime')
              : sortKey === 'loadCount'
                ? (b.loadCount ?? 1)
                : (b.lastSeen ?? 0);
      if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * direction;
      return String(aValue).localeCompare(String(bValue)) * direction;
    });
  }, [data.audio, data.fonts, data.textures, filter, missingPaths, search, sortDirection, sortKey, tab]);

  const counts = {
    texture: data.textures.length,
    font: data.fonts.length,
    audio: data.audio.length,
  };
  const repeatedCount = allRows.filter((asset) => (asset.loadCount ?? 1) > 1).length;

  useEffect(() => {
    if (!selectedAsset && selected) setSelected(null);
  }, [selected, selectedAsset]);

  useEffect(() => {
    if (previewRequest && data.preview && data.preview.id === previewRequest.id) {
      setPreviewRequest(null);
    }
  }, [data.preview, previewRequest]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'loadCount' || key === 'lastSeen' ? 'desc' : 'asc');
  };

  const handlePreview = (kind: Exclude<AssetKind, 'audio'>, id: number) => {
    setPreviewRequest({ kind, id });
    previewAsset(kind, id);
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-h-0 overflow-auto py-4 md:py-6">
        <div className="flex flex-col gap-3 px-4 lg:px-6">
          {!assetPreviewEnabled && (
            <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Asset preview is disabled for this session.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FolderIcon className="size-4 text-muted-foreground" />
                Game Root
              </div>
              <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={rootPath || undefined}>
                {rootPath || 'No game root selected'}
              </div>
            </div>
            {!isWeb() && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 pr-2">
                  <Switch
                    id="asset-preview-enabled"
                    checked={assetPreviewEnabled}
                    onCheckedChange={setAssetPreviewEnabled}
                  />
                  <Label htmlFor="asset-preview-enabled" className="text-sm">
                    Asset Preview
                  </Label>
                </div>
                {manualRootPath && (
                  <Button size="sm" variant="ghost" onClick={clearManualRootPath}>
                    <XIcon className="size-4" />
                    Auto
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={pickRootPath}>
                  <FolderIcon className="size-4" />
                  Select Folder
                </Button>
              </div>
            )}
          </div>

          <TriageToolbar
            className="rounded-md border px-3"
            summary={
              <>
                <TriageSummaryChip label="Visible" value={rows.length} />
                <TriageSummaryChip label="Repeated" value={repeatedCount} tone={repeatedCount > 0 ? 'warning' : 'muted'} />
                <TriageSummaryChip label="Preview" value={assetPreviewEnabled ? 'on' : 'off'} tone={assetPreviewEnabled ? 'good' : 'muted'} />
              </>
            }
            filters={
              <Tabs value={tab} onValueChange={(value) => setTab(value as AssetKind)}>
              <TabsList>
                <TabsTrigger value="texture">
                  <ImageIcon className="size-4" />
                  Textures {counts.texture}
                </TabsTrigger>
                <TabsTrigger value="font">
                  <TextIcon className="size-4" />
                  Fonts {counts.font}
                </TabsTrigger>
                <TabsTrigger value="audio">
                  <MusicIcon className="size-4" />
                  Audio {counts.audio}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            }
            search={<TriageSearch value={search} onChange={setSearch} placeholder="Filter assets" />}
          />

          <div className="flex flex-wrap items-center gap-2">
            <TriageFilterBar
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'file', label: 'File-backed' },
                { value: 'runtime', label: 'Runtime' },
                { value: 'repeated', label: 'Repeated' },
                { value: 'missing', label: 'Missing local file' },
              ]}
            />
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as AssetKind)} className="min-h-0">
            <TabsContent value="texture">
              <AssetTable
                kind="texture"
                rows={rows}
                selectedId={selected?.kind === 'texture' ? selected.id : null}
                missingPaths={missingPaths}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onSelect={(kind, id) => setSelected({ kind, id })}
                onPreview={handlePreview}
              />
            </TabsContent>
            <TabsContent value="font">
              <AssetTable
                kind="font"
                rows={rows}
                selectedId={selected?.kind === 'font' ? selected.id : null}
                missingPaths={missingPaths}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onSelect={(kind, id) => setSelected({ kind, id })}
                onPreview={handlePreview}
              />
            </TabsContent>
            <TabsContent value="audio">
              <AssetTable
                kind="audio"
                rows={rows}
                selectedId={selected?.kind === 'audio' ? selected.id : null}
                missingPaths={missingPaths}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onSelect={(kind, id) => setSelected({ kind, id })}
                onPreview={handlePreview}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {
        <PreviewPanel
          kind={selected?.kind ?? tab}
          selectedAsset={selectedAsset}
          preview={data.preview === false ? null : data.preview}
          resolvedPath={selectedResolvedPath}
          missing={isMissing(missingPaths, selectedAsset?.path)}
          loading={!!previewRequest && previewRequest.id === selected?.id && previewRequest.kind === selected?.kind}
          onPreview={() => {
            if (!selected || selected.kind === 'audio') return;
            handlePreview(selected.kind, selected.id);
          }}
        />
      }
    </div>
  );
}
