import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useGif } from '@/hooks/use-gif';
import { GifType, PluginContentImageType, PluginContentProps, PluginDataType } from '@/hooks/use-plugin';
import { downloadFile } from '@/utils/file';
import { DownloadIcon } from 'lucide-react';

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
  if (metadata.type === 'gif') {
    return (
      <PluginContentTypeGifImage
        name={name}
        type={metadata.type}
        width={metadata.width}
        height={metadata.height}
        downloadable={downloadable}
        src={metadata.src}
        fps={metadata.fps}
      />
    );
  }
  const data = `data:image/png;base64,${metadata.src}`;

  return (
    <>
      <img className="object-scale-down max-h-full drop-shadow-md rounded-md m-auto" src={data} alt={name} />
      {downloadable && <DownloadButton url={data} extension=".png" />}
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

export function PluginContent({ data, type, loading }: PluginContentProps) {
  if (type === 'gallery') {
    return (
      <div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {data.map((item) => {
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
          {loading && (
            <div className="h-12 w-12 self-center justify-self-center animate-spin rounded-full border-4 border-solid border-gray-200 border-t-transparent" />
          )}
        </div>
      </div>
    );
  }

  return null;
}
