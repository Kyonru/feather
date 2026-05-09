import { useConfigStore } from '@/store/config';
import { useSettingsStore } from '@/store/settings';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  PluginTableColumn,
  PluginTableRow,
  PluginTreeNode,
  PluginTimelineItem,
} from '@/hooks/use-plugin';
import { downloadFile } from '@/utils/file';
import { isWeb } from '@/utils/platform';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Bookmark, ChevronRight, DownloadIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';

const DownloadButton = ({ url, extension }: { url?: string; extension: '.png' | '.gif' }) => {
  return (
    <Button
      variant="secondary"
      onClick={async (e) => {
        e.preventDefault();

        if (!url) {
          return;
        }

        await downloadFile(`${Date.now()}${extension}`, url, 'string');
      }}
    >
      <DownloadIcon className="text-primary" />
    </Button>
  );
};

export function PluginContentTypeGifImage({ name, width, fps, height, src, downloadable }: GifType) {
  const gifImage = useGif(name, src || [], fps, width || 0, height || 0);

  if (gifImage.isLoading) {
    return (
      <div className="h-12 w-12 self-center justify-self-center animate-spin rounded-full border-4 border-solid border-gray-200 border-t-transparent" />
    );
  }

  return (
    <>
      <img src={gifImage.data} className="object-scale-down max-h-full drop-shadow-md rounded-md m-auto" />
      {downloadable && <DownloadButton url={gifImage.data} extension=".gif" />}
    </>
  );
}

/** Resolve a possibly-relative asset path to an absolute one.
 *  Manual override (settings) wins over auto-detected sourceDir (config). */
function useAssetSourceDir(): string {
  const manual = useSettingsStore((s) => s.assetSourceDir);
  const auto   = useConfigStore((s)   => s.config?.sourceDir ?? '');
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
      // GIF frames: array of data URIs or file paths
      if (Array.isArray(metadata.src) && metadata.src.length > 0 && metadata.src[0].startsWith('data:')) {
        // Data URIs from WS — use directly
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
      // Single image: data URI or file path
      if (typeof metadata.src === 'string' && metadata.src.startsWith('data:')) {
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
      {downloadable && <DownloadButton url={url} extension=".png" />}
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
              <TableRow key={row.name ?? i}>
                {columns.map((col) => (
                  <TableCell key={col.key} className="font-mono text-sm">
                    {row[col.key] ?? '-'}
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
              <ChevronRight
                className={`size-4 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
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
            {node.properties.length === 0 && (
              <span className="text-sm text-muted-foreground">—</span>
            )}
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
            onChange={(e) =>
              onParamsChange?.({ selectedSource: e.target.value })
            }
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
          onChange={(e) =>
            onParamsChange?.({ searchFilter: e.target.value })
          }
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
                  {sources.length === 0
                    ? 'No entity sources registered'
                    : 'No entities found'}
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

export function PluginContent(
  props: PluginContentProps & { onParamsChange?: (params: Record<string, string>) => void },
) {
  if (props.type === 'table') {
    return (
      <PluginContentTable columns={props.columns} data={props.data} loading={props.loading} />
    );
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
    return (
      <PluginContentTimeline
        items={props.items}
        categories={props.categories}
        loading={props.loading}
      />
    );
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
