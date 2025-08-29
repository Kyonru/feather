import { useGif } from '@/hooks/use-gif';
import { GifType, PluginContentImageType, PluginContentProps, PluginDataType } from '@/hooks/use-plugin';

export function PluginContentTypeGifImage({ width, fps, height, src }: GifType) {
  const gifImage = useGif(src || [], fps, width || 0, height || 0);

  if (gifImage.isLoading) {
    return (
      <div className="h-12 w-12 self-center justify-self-center animate-spin rounded-full border-4 border-solid border-gray-200 border-t-transparent" />
    );
  }

  return <img src={gifImage.data} className="max-h-[100%]" />;
}

export function PluginContentTypeImage({ name, metadata }: PluginContentImageType) {
  if (metadata.type === 'gif') {
    return (
      <PluginContentTypeGifImage
        type={metadata.type}
        width={metadata.width}
        height={metadata.height}
        src={metadata.src}
        fps={metadata.fps}
      />
    );
  }

  return <img className="h-full w-full" src={`data:image/png;base64,${metadata.src}`} alt={name} />;
}

export function PluginContentType({ type, name, metadata }: PluginDataType) {
  if (type === 'image') {
    return <PluginContentTypeImage type={type} name={name} metadata={metadata} />;
  }
}

export function PluginContent({ data, type, loading }: PluginContentProps) {
  if (type === 'gallery') {
    return (
      <div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {data.map((item) => {
            return <PluginContentType type={item.type} name={item.name} metadata={item.metadata} />;
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
