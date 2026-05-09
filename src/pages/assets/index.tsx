import { useEffect, useMemo, useRef, useState } from 'react';
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import {
  FolderIcon,
  ImageIcon,
  Maximize2Icon,
  MinusIcon,
  MusicIcon,
  PlusIcon,
  SearchIcon,
  TextIcon,
  XIcon,
} from 'lucide-react';
import { PageLayout } from '@/components/page-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAssets, type AssetKind, type AudioAsset, type FontAsset, type TextureAsset } from '@/hooks/use-assets';
import { useConfigStore } from '@/store/config';
import { useDebuggerStore } from '@/store/debugger';
import { useSessionStore } from '@/store/session';
import { isWeb } from '@/utils/platform';
import { cn } from '@/utils/styles';

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
    <div className="flex min-h-52 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
      No assets captured yet. Assets loaded after Feather starts will appear here.
    </div>
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
  onSelect,
  onPreview,
}: {
  kind: AssetKind;
  rows: Array<TextureAsset | FontAsset | AudioAsset>;
  selectedId: number | null;
  onSelect: (kind: AssetKind, id: number) => void;
  onPreview: (kind: Exclude<AssetKind, 'audio'>, id: number) => void;
}) {
  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="w-24 text-right">Preview</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((asset) => {
            const isSelected = selectedId === asset.id;
            const details =
              kind === 'texture'
                ? `${(asset as TextureAsset).width}x${(asset as TextureAsset).height} ${(asset as TextureAsset).format}`
                : kind === 'font'
                  ? `${(asset as FontAsset).height}px ascent ${(asset as FontAsset).ascent}`
                  : `${(asset as AudioAsset).srcType} ${(asset as AudioAsset).channels}ch`;

            return (
              <TableRow
                key={`${kind}-${asset.id}`}
                className={cn('cursor-pointer', isSelected && 'bg-muted')}
                onClick={() => onSelect(kind, asset.id)}
              >
                <TableCell className="font-medium">{asset.displayName}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{details}</TableCell>
                <TableCell className="max-w-80 truncate font-mono text-xs text-muted-foreground">
                  {asset.path || 'runtime'}
                </TableCell>
                <TableCell className="text-right">
                  {kind === 'audio' ? (
                    <span className="text-xs text-muted-foreground">-</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(kind, asset.id);
                        onPreview(kind, asset.id);
                      }}
                    >
                      View
                    </Button>
                  )}
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
  preview,
}: {
  previewSrc?: string | null;
  preview: Exclude<ReturnType<typeof useAssets>['data']['preview'], false>;
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

  return (
    <aside className="hidden w-[360px] shrink-0 border-l bg-background p-4 lg:flex lg:flex-col">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Preview</h2>
          <p className="truncate text-xs text-muted-foreground">{preview?.name || 'Select a texture or font'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
      <div className="flex h-0 min-h-0 flex-1 items-center justify-center overflow-auto rounded-md border bg-muted/30 p-3 max-h-[75vh]">
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
          <p className="text-center text-sm text-muted-foreground">
            {preview ? 'Asset file is not available on this machine.' : 'No preview loaded.'}
          </p>
        )}
      </div>
      {preview && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>Width</span>
          <span className="text-right font-mono">{preview.width}</span>
          <span>Height</span>
          <span className="text-right font-mono">{preview.height}</span>
          <span>Zoom</span>
          <span className="text-right font-mono">{Math.round(zoom * 100)}%</span>
          <span>Pan</span>
          <span className="text-right font-mono">
            {Math.round(pan.x)}, {Math.round(pan.y)}
          </span>
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
  const [selected, setSelected] = useState<{ kind: AssetKind; id: number } | null>(null);

  const rows = useMemo(() => {
    const list = tab === 'texture' ? data.textures : tab === 'font' ? data.fonts : data.audio;
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((asset) => asset.name.toLowerCase().includes(q) || asset.displayName.toLowerCase().includes(q));
  }, [data.audio, data.fonts, data.textures, search, tab]);

  const counts = {
    texture: data.textures.length,
    font: data.fonts.length,
    audio: data.audio.length,
  };

  return (
    <PageLayout right={<PreviewPanel preview={data.preview === false ? null : data.preview} />}>
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

        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter assets"
              className="pl-9"
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as AssetKind)} className="min-h-0">
          <TabsContent value="texture">
            <AssetTable
              kind="texture"
              rows={rows}
              selectedId={selected?.kind === 'texture' ? selected.id : null}
              onSelect={(kind, id) => setSelected({ kind, id })}
              onPreview={previewAsset}
            />
          </TabsContent>
          <TabsContent value="font">
            <AssetTable
              kind="font"
              rows={rows}
              selectedId={selected?.kind === 'font' ? selected.id : null}
              onSelect={(kind, id) => setSelected({ kind, id })}
              onPreview={previewAsset}
            />
          </TabsContent>
          <TabsContent value="audio">
            <AssetTable
              kind="audio"
              rows={rows}
              selectedId={selected?.kind === 'audio' ? selected.id : null}
              onSelect={(kind, id) => setSelected({ kind, id })}
              onPreview={previewAsset}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
