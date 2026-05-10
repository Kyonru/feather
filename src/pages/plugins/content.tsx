import { useConfigStore } from '@/store/config';
import { useSettingsStore } from '@/store/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useGif } from '@/hooks/use-gif';
import {
  GifType,
  PluginContentImageType,
  PluginContentProps,
  PluginDataType,
  PluginTableCellValue,
  PluginTableColumn,
  PluginTableRow,
  PluginTreeNode,
  PluginTimelineItem,
  PluginUiNode,
} from '@/hooks/use-plugin';
import { downloadFile } from '@/utils/file';
import { isWeb } from '@/utils/platform';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Bookmark, ChevronRight, DownloadIcon, ExternalLink } from 'lucide-react';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';

const isDirectImageSrc = (src: string) => src.startsWith('data:') || src.startsWith('blob:');
const isResolvedBinarySrc = (src: string) => src.startsWith('blob:') || src.startsWith('data:');
const downloadName = (name: string, extension: '.png' | '.gif') => {
  const base = name.split(/[\\/]/).pop() || `${Date.now()}${extension}`;
  return base.endsWith(extension) ? base : `${base}${extension}`;
};

const DownloadButton = ({ url, filename }: { url?: string; filename: string }) => {
  return (
    <Button
      variant="secondary"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!url) {
          return;
        }

        await downloadFile(filename, url, 'string');
      }}
    >
      <DownloadIcon className="text-primary" />
    </Button>
  );
};

const tableDownloadName = (row: PluginTableRow, fallback: string) => {
  const name = row.name;
  if (typeof name === 'string' && name.length > 0) {
    return name.split(/[\\/]/).pop() || fallback;
  }
  return fallback;
};

const renderTableValue = (value: PluginTableCellValue, row: PluginTableRow, columnKey: string) => {
  if (value == null || value === '') return '-';

  if (typeof value === 'string') {
    if (isResolvedBinarySrc(value)) {
      const filename = tableDownloadName(row, `${columnKey}.bin`);
      return (
        <div className="flex items-center gap-1">
          <DownloadButton url={value} filename={filename} />
          <Button variant="ghost" size="icon" asChild>
            <a href={value} target="_blank" rel="noreferrer">
              <ExternalLink className="text-primary" />
            </a>
          </Button>
        </div>
      );
    }

    if (value.startsWith('feather-binary:')) {
      return <span className="text-muted-foreground">Loading...</span>;
    }

    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.every((item) => typeof item === 'string') ? value.join(', ') : `${value.length} items`;
  }

  if ('id' in value) {
    return <span className="text-muted-foreground">{value.mime || 'binary'}</span>;
  }

  return JSON.stringify(value);
};

export function PluginContentTypeGifImage({ name, width, fps, height, src, downloadable }: GifType) {
  const gifImage = useGif(name, src || [], fps, width || 0, height || 0);

  if (gifImage.isLoading) {
    return (
      <div className="h-12 w-12 self-center justify-self-center animate-spin rounded-full border-4 border-solid border-gray-200 border-t-transparent" />
    );
  }

  if (!gifImage.data) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        GIF preview is not available.
      </div>
    );
  }

  return (
    <>
      <img src={gifImage.data} className="object-scale-down max-h-full drop-shadow-md rounded-md m-auto" />
      {downloadable && <DownloadButton url={gifImage.data} filename={downloadName(name, '.gif')} />}
    </>
  );
}

/** Resolve a possibly-relative asset path to an absolute one.
 *  Manual override (settings) wins over auto-detected sourceDir (config). */
function useAssetSourceDir(): string {
  const manual = useSettingsStore((s) => s.assetSourceDir);
  const auto = useConfigStore((s) => s.config?.sourceDir ?? '');
  return manual || auto;
}

function resolveAssetPath(src: string, sourceDir: string): string {
  if (!sourceDir || src.startsWith('data:') || src.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(src)) {
    return src;
  }
  return sourceDir.replace(/[/\\]+$/, '') + '/' + src;
}

function canResolveAssetPath(src: string, sourceDir: string): boolean {
  return src.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(src) || !!sourceDir;
}

export function PluginContentTypeImage({ name, metadata, downloadable }: PluginContentImageType) {
  const [src, setSrc] = useState<string | string[] | null>(null);
  const sourceDir = useAssetSourceDir();

  useEffect(() => {
    if (!metadata.src) {
      setSrc(null);
      return;
    }

    if (metadata.type === 'gif') {
      // GIF frames: array of data/blob URLs or file paths.
      if (Array.isArray(metadata.src) && metadata.src.length > 0 && metadata.src.every(isDirectImageSrc)) {
        // Data/blob URLs from WS — use directly.
        setSrc(metadata.src);
      } else {
        // File paths — resolve to Tauri asset URLs when running locally.
        if (isWeb() || !metadata.src.every((frame) => canResolveAssetPath(frame, sourceDir))) {
          setSrc(null);
        } else {
          const urls = metadata.src.map((frame) => convertFileSrc(resolveAssetPath(frame, sourceDir)));
          setSrc(urls);
        }
      }
      return;
    }

    if (metadata.type === 'png') {
      // Single image: data/blob URL or file path.
      if (typeof metadata.src === 'string' && isDirectImageSrc(metadata.src)) {
        setSrc(metadata.src);
      } else if (typeof metadata.src === 'string') {
        if (isWeb() || !canResolveAssetPath(metadata.src, sourceDir)) {
          setSrc(null);
        } else {
          setSrc(convertFileSrc(resolveAssetPath(metadata.src, sourceDir)));
        }
      }
    }
  }, [metadata.src, metadata.type, sourceDir]);

  if (!src) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Asset file is not available on this machine.
      </div>
    );
  }

  if (metadata.type === 'gif') {
    return (
      <PluginContentTypeGifImage
        name={name}
        type={metadata.type}
        width={metadata.width}
        height={metadata.height}
        downloadable={downloadable}
        src={src as string[]}
        fps={metadata.fps}
      />
    );
  }

  const url = src as string;
  return (
    <>
      <img className="object-scale-down max-h-full drop-shadow-md rounded-md m-auto" src={url} alt={name} />
      {downloadable && <DownloadButton url={url} filename={downloadName(name, '.png')} />}
    </>
  );
}

export function PluginContentType({ type, name, metadata, downloadable }: PluginDataType) {
  if (type === 'image') {
    return (
      <Dialog>
        <DialogTrigger>
          <PluginContentTypeImage type={type} name={name} metadata={metadata} downloadable={downloadable} />
        </DialogTrigger>
        <DialogContent aria-describedby="modal-description" className="h-[90vh] w-full sm:max-w-1/2">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
          </DialogHeader>
          <DialogDescription id="modal-description">
            <div className="flex flex-col justify-center sm:px-12 p-8 h-[80vh] gap-2">
              <PluginContentTypeImage type={type} name={name} metadata={metadata} downloadable={downloadable} />
            </div>
          </DialogDescription>
        </DialogContent>
      </Dialog>
    );
  }
}

export function PluginContentTable({
  columns,
  data,
  loading,
}: {
  columns: PluginTableColumn[];
  data: PluginTableRow[];
  loading: boolean;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && !loading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                No data collected yet
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow key={typeof row.name === 'string' ? row.name : i}>
                {columns.map((col) => (
                  <TableCell key={col.key} className="font-mono text-sm">
                    {renderTableValue(row[col.key], row, col.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
          {loading && (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center py-4">
                <div className="h-6 w-6 inline-block animate-spin rounded-full border-2 border-solid border-gray-200 border-t-transparent" />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function TreeNodeRow({
  node,
  depth,
  expandedNodes,
  toggleNode,
  path,
}: {
  node: PluginTreeNode;
  depth: number;
  expandedNodes: Set<string>;
  toggleNode: (path: string) => void;
  path: string;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(path);
  const indent = depth * 20;

  return (
    <>
      <TableRow
        className={hasChildren ? 'cursor-pointer hover:bg-muted/50' : undefined}
        onClick={hasChildren ? () => toggleNode(path) : undefined}
      >
        <TableCell className="font-medium whitespace-nowrap" style={{ paddingLeft: indent + 12 }}>
          <div className="flex items-center gap-1">
            {hasChildren && (
              <ChevronRight className={`size-4 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            )}
            {!hasChildren && <span className="inline-block w-4" />}
            <span className="font-mono text-sm">{node.name}</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {node.properties.map((prop) => (
              <span key={prop.key} className="text-sm">
                <span className="text-muted-foreground">{prop.key}</span>
                <span className="text-muted-foreground mx-1">=</span>
                <span className="font-mono">{prop.value}</span>
              </span>
            ))}
            {node.properties.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
          </div>
        </TableCell>
      </TableRow>
      {isExpanded &&
        node.children?.map((child, i) => {
          const childPath = `${path}/${i}`;
          return (
            <TreeNodeRow
              key={childPath}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              path={childPath}
            />
          );
        })}
    </>
  );
}

export function PluginContentTree({
  nodes,
  sources,
  selectedSource,
  searchFilter,
  loading,
  total,
  shown,
  onParamsChange,
}: {
  nodes: PluginTreeNode[];
  sources: string[];
  selectedSource: number;
  searchFilter: string;
  loading: boolean;
  total?: number;
  shown?: number;
  onParamsChange?: (params: Record<string, string>) => void;
}) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = useCallback((path: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {sources.length > 1 && (
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={selectedSource}
            onChange={(e) => onParamsChange?.({ selectedSource: e.target.value })}
          >
            {sources.map((name, i) => (
              <option key={i} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        )}
        <input
          className="rounded-md border bg-background px-3 py-1.5 text-sm w-48"
          placeholder="Filter entities…"
          defaultValue={searchFilter}
          onChange={(e) => onParamsChange?.({ searchFilter: e.target.value })}
        />
        {total != null && shown != null && (
          <span className="text-sm text-muted-foreground">
            {shown} / {total} entities
          </span>
        )}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Entity</TableHead>
              <TableHead>Properties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                  {sources.length === 0 ? 'No entity sources registered' : 'No entities found'}
                </TableCell>
              </TableRow>
            ) : (
              nodes.map((node, i) => (
                <TreeNodeRow
                  key={`${i}`}
                  node={node}
                  depth={0}
                  expandedNodes={expandedNodes}
                  toggleNode={toggleNode}
                  path={`${i}`}
                />
              ))
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-4">
                  <div className="h-6 w-6 inline-block animate-spin rounded-full border-2 border-solid border-gray-200 border-t-transparent" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const categoryColors: Record<string, string> = {
  info: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20',
  error: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20',
  warning: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20',
  success: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20',
  accent: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/20',
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(timestamp * 1000).toLocaleTimeString();
}

export function PluginContentTimeline({
  items,
  loading,
}: {
  items: PluginTimelineItem[];
  categories: string[];
  loading: boolean;
}) {
  if (items.length === 0 && !loading) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">
        <Bookmark className="size-8 mx-auto mb-2 opacity-50" />
        <p>No bookmarks yet</p>
        <p className="text-xs mt-1">Add a bookmark from the controls above or press the hotkey in-game</p>
      </div>
    );
  }

  // Show newest first
  const sorted = [...items].reverse();

  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground mb-3">
        {items.length} bookmark{items.length !== 1 ? 's' : ''}
      </div>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-0">
          {sorted.map((item) => (
            <div key={item.id} className="relative flex items-start gap-3 py-2 pl-8 pr-2 group">
              {/* Timeline dot */}
              <div className="absolute left-[13px] top-[14px] size-[7px] rounded-full bg-foreground/50 ring-2 ring-background group-hover:bg-foreground transition-colors" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{item.label}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${categoryColors[item.color ?? ''] ?? ''}`}
                  >
                    {item.category}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(item.time)}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground font-mono">{item.gameTime}s</span>
                </div>
                {item.screenshot && (
                  <img
                    src={item.screenshot}
                    alt={item.label}
                    className="mt-2 rounded-md border max-w-[240px] max-h-[135px] object-cover cursor-pointer hover:opacity-80 transition-opacity"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-gray-200 border-t-transparent" />
        </div>
      )}
    </div>
  );
}

const renderUiScalar = (value: PluginTableCellValue) => {
  if (value == null || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  if ('id' in value) return value.mime;
  return JSON.stringify(value);
};

const getUiControlName = (node: PluginUiNode) => node.name ?? node.id ?? node.action;

const renderUiLabel = (node: PluginUiNode, control: ReactNode) => {
  const label = node.label ?? node.title;
  if (!label && !node.description) return control;

  return (
    <div className="space-y-1.5">
      {label ? <Label className="text-xs font-medium">{label}</Label> : null}
      {control}
      {node.description ? <p className="text-xs text-muted-foreground">{node.description}</p> : null}
    </div>
  );
};

function PluginUiRenderer({
  node,
  onAction,
  onParamsChange,
}: {
  node: PluginUiNode;
  onAction?: (action: string) => void;
  onParamsChange?: (params: Record<string, string>) => void;
}) {
  const children = node.children?.map((child, index) => (
    <PluginUiRenderer
      key={child.id ?? `${child.type}:${index}`}
      node={child}
      onAction={onAction}
      onParamsChange={onParamsChange}
    />
  ));

  if (node.type === 'panel') {
    return (
      <Card className="gap-3 py-3">
        {node.title && (
          <CardHeader className="px-4 pb-0">
            <CardTitle className="text-sm">{node.title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-3 px-4">{children}</CardContent>
      </Card>
    );
  }

  if (node.type === 'row') {
    return <div className="flex flex-wrap items-center gap-2">{children}</div>;
  }

  if (node.type === 'column') {
    return <div className="flex flex-col gap-2">{children}</div>;
  }

  if (node.type === 'text') {
    return <p className="text-sm">{renderUiScalar(node.value ?? node.label)}</p>;
  }

  if (node.type === 'badge') {
    return (
      <Badge variant={node.variant === 'destructive' ? 'destructive' : 'secondary'}>
        {renderUiScalar(node.value ?? node.label)}
      </Badge>
    );
  }

  if (node.type === 'button') {
    return (
      <Button
        variant={node.variant ?? 'outline'}
        size="sm"
        onClick={() => node.action && onAction?.(node.action)}
        disabled={!node.action}
      >
        {node.label ?? node.action ?? 'Action'}
      </Button>
    );
  }

  if (node.type === 'input') {
    const name = getUiControlName(node);
    return renderUiLabel(
      node,
      <Input
        type="text"
        defaultValue={renderUiScalar(node.value) ?? ''}
        placeholder={node.placeholder}
        disabled={node.disabled || !name}
        onChange={(event) => name && onParamsChange?.({ [name]: event.target.value })}
      />,
    );
  }

  if (node.type === 'textarea') {
    const name = getUiControlName(node);
    return renderUiLabel(
      node,
      <Textarea
        defaultValue={renderUiScalar(node.value) ?? ''}
        placeholder={node.placeholder}
        disabled={node.disabled || !name}
        onChange={(event) => name && onParamsChange?.({ [name]: event.target.value })}
      />,
    );
  }

  if (node.type === 'checkbox') {
    const name = getUiControlName(node);
    return (
      <div className="flex items-start gap-2">
        <Checkbox
          checked={node.checked === true}
          disabled={node.disabled || !name}
          onCheckedChange={(checked) => name && onParamsChange?.({ [name]: checked === true ? 'true' : 'false' })}
        />
        <div className="grid gap-1 leading-none">
          <Label className="text-sm">{node.label ?? node.title ?? name ?? 'Checkbox'}</Label>
          {node.description ? <p className="text-xs text-muted-foreground">{node.description}</p> : null}
        </div>
      </div>
    );
  }

  if (node.type === 'switch') {
    const name = getUiControlName(node);
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div className="space-y-1">
          <Label className="text-sm">{node.label ?? node.title ?? name ?? 'Switch'}</Label>
          {node.description ? <p className="text-xs text-muted-foreground">{node.description}</p> : null}
        </div>
        <Switch
          checked={node.checked === true}
          disabled={node.disabled || !name}
          onCheckedChange={(checked) => name && onParamsChange?.({ [name]: checked ? 'true' : 'false' })}
        />
      </div>
    );
  }

  if (node.type === 'select') {
    const name = getUiControlName(node);
    return renderUiLabel(
      node,
      <Select
        defaultValue={typeof node.value === 'string' ? node.value : undefined}
        disabled={node.disabled || !name}
        onValueChange={(value) => name && onParamsChange?.({ [name]: value })}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={node.placeholder ?? 'Select'} />
        </SelectTrigger>
        <SelectContent>
          {(node.options ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );
  }

  if (node.type === 'separator') {
    return <div className="h-px bg-border" />;
  }

  if (node.type === 'stat') {
    return (
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">{node.label ?? node.title}</p>
        <p className="mt-1 text-2xl font-semibold">{renderUiScalar(node.value)}</p>
        {node.description ? <p className="mt-1 text-xs text-muted-foreground">{node.description}</p> : null}
      </div>
    );
  }

  if (node.type === 'progress') {
    const min = node.min ?? 0;
    const max = node.max ?? 100;
    const rawValue = typeof node.value === 'number' ? node.value : Number(node.value ?? min);
    const value = Number.isFinite(rawValue) ? rawValue : min;
    const percent = Math.max(0, Math.min(100, ((value - min) / Math.max(1, max - min)) * 100));

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium">{node.label ?? node.title}</span>
          <span className="text-muted-foreground">{Math.round(percent)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        {node.description ? <p className="text-xs text-muted-foreground">{node.description}</p> : null}
      </div>
    );
  }

  if (node.type === 'alert') {
    const variantClass =
      node.variant === 'destructive'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : 'border-border bg-muted/40';
    return (
      <div className={`rounded-md border p-3 text-sm ${variantClass}`}>
        {node.title ? <p className="font-medium">{node.title}</p> : null}
        {node.value || node.label ? (
          <p className={node.title ? 'mt-1' : ''}>{renderUiScalar(node.value ?? node.label)}</p>
        ) : null}
        {children ? <div className="mt-2 space-y-2">{children}</div> : null}
      </div>
    );
  }

  if (node.type === 'list') {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {node.children?.map((child, index) => (
          <li key={child.id ?? `${child.type}:${index}`}>
            <PluginUiRenderer node={child} onAction={onAction} onParamsChange={onParamsChange} />
          </li>
        ))}
      </ul>
    );
  }

  if (node.type === 'link') {
    const content = node.label ?? node.title ?? node.href ?? renderUiScalar(node.value);
    return (
      <a
        className="text-sm text-primary underline-offset-4 hover:underline"
        href={node.href ?? '#'}
        target="_blank"
        rel="noreferrer"
      >
        {content}
      </a>
    );
  }

  if (node.type === 'image' && typeof node.src === 'string') {
    return (
      <img
        src={node.src}
        alt={node.alt ?? node.title ?? 'Plugin image'}
        className="max-h-96 rounded-md border object-contain"
      />
    );
  }

  if (node.type === 'code') {
    return (
      <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
        <code>{renderUiScalar(node.value)}</code>
      </pre>
    );
  }

  if (node.type === 'table' && node.columns && node.data) {
    return <PluginContentTable columns={node.columns} data={node.data} loading={false} />;
  }

  if (node.type === 'timeline' && node.items) {
    return <PluginContentTimeline items={node.items} categories={node.categories ?? []} loading={false} />;
  }

  if (node.type === 'inspector' && node.nodes) {
    return (
      <PluginContentTree
        nodes={node.nodes}
        sources={[]}
        selectedSource={1}
        searchFilter=""
        loading={false}
        onParamsChange={onParamsChange}
      />
    );
  }

  if (node.type === 'tabs') {
    const first = node.children?.[0];
    if (!first) return null;
    return (
      <Tabs defaultValue={first.id ?? first.title ?? 'tab-0'}>
        <TabsList>
          {node.children?.map((child, index) => (
            <TabsTrigger key={child.id ?? index} value={child.id ?? child.title ?? `tab-${index}`}>
              {child.title ?? child.label ?? `Tab ${index + 1}`}
            </TabsTrigger>
          ))}
        </TabsList>
        {node.children?.map((child, index) => (
          <TabsContent key={child.id ?? index} value={child.id ?? child.title ?? `tab-${index}`}>
            <PluginUiRenderer node={child} onAction={onAction} onParamsChange={onParamsChange} />
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  if (node.type === 'tab') {
    return <div className="pt-2">{children}</div>;
  }

  return children ? <div className="space-y-2">{children}</div> : null;
}

export function PluginContent(
  props: PluginContentProps & {
    onAction?: (action: string) => void;
    onParamsChange?: (params: Record<string, string>) => void;
  },
) {
  if (props.type === 'ui') {
    return (
      <div className="space-y-3">
        <PluginUiRenderer node={props.tree} onAction={props.onAction} onParamsChange={props.onParamsChange} />
        {props.loading && (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-gray-200 border-t-transparent" />
          </div>
        )}
      </div>
    );
  }

  if (props.type === 'table') {
    return <PluginContentTable columns={props.columns} data={props.data} loading={props.loading} />;
  }

  if (props.type === 'tree') {
    return (
      <PluginContentTree
        nodes={props.nodes}
        sources={props.sources}
        selectedSource={props.selectedSource}
        searchFilter={props.searchFilter}
        loading={props.loading}
        total={props.total}
        shown={props.shown}
        onParamsChange={props.onParamsChange}
      />
    );
  }

  if (props.type === 'timeline') {
    return <PluginContentTimeline items={props.items} categories={props.categories} loading={props.loading} />;
  }

  if (props.type === 'gallery') {
    return (
      <div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {props.data.map((item) => {
            return (
              <PluginContentType
                key={item.name}
                type={item.type}
                name={item.name}
                metadata={item.metadata}
                downloadable={item.downloadable}
              />
            );
          })}
          {props.loading && (
            <div className="h-12 w-12 self-center justify-self-center animate-spin rounded-full border-4 border-solid border-gray-200 border-t-transparent" />
          )}
        </div>
      </div>
    );
  }

  return null;
}
