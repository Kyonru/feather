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
} from '@/hooks/use-plugin';
import { downloadFile } from '@/utils/file';
import { readFile } from '@tauri-apps/plugin-fs';
import { DownloadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

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

export function PluginContentTypeImage({ name, metadata, downloadable }: PluginContentImageType) {
  const [src, setSrc] = useState<string | string[] | null>(null);

  useEffect(() => {
    if (!metadata.src) {
      return;
    }

    if (metadata.type === 'gif') {
      // GIF frames: array of data URIs or file paths
      if (Array.isArray(metadata.src) && metadata.src.length > 0 && metadata.src[0].startsWith('data:')) {
        // Data URIs from WS — use directly
        setSrc(metadata.src);
      } else {
        // Legacy: file paths — read from disk
        const readImage = async () => {
          const urls: string[] = [];
          for (let i = 0; i < metadata.src.length; i++) {
            try {
              const uint8 = await readFile(metadata.src[i]);
              const blob = new Blob([uint8], { type: 'image/png' });
              urls.push(URL.createObjectURL(blob));
            } catch {
              // Skip unreadable frames
            }
          }
          setSrc(urls);
        };
        readImage();
      }
      return;
    }

    if (metadata.type === 'png') {
      // Single image: data URI or file path
      if (typeof metadata.src === 'string' && metadata.src.startsWith('data:')) {
        setSrc(metadata.src);
      } else {
        const readImage = async () => {
          try {
            const uint8 = await readFile(metadata.src);
            const blob = new Blob([uint8], { type: 'image/png' });
            setSrc(URL.createObjectURL(blob));
          } catch {
            // File not available
          }
        };
        readImage();
      }
    }
  }, [metadata.src, metadata.type]);

  if (!src) {
    return null;
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

export function PluginContent(props: PluginContentProps) {
  if (props.type === 'table') {
    return (
      <PluginContentTable columns={props.columns} data={props.data} loading={props.loading} />
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
