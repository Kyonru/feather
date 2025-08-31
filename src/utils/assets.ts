import GIF from 'gif.js.optimized';
import { LocalCache } from './cache';

const ONE_DAY = 24 * 60 * 60 * 1000;

const cache = new LocalCache('gif', ONE_DAY);

export async function createGif({
  name,
  images,
  fps,
  width,
  height,
}: {
  name: string;
  images: string[];
  fps: number;
  width: number;
  height: number;
}): Promise<string> {
  const cached = cache.get<string>(name);

  if (cached) {
    try {
      await fetch(cached).then((res) => res.ok);

      return Promise.resolve(cached);
    } catch {
      // Do nothing
    }
  }

  return new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width,
      height,
      workerScript: '/gif.worker.js',
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject('Canvas context not available');

    let loaded = 0;

    images.forEach((src, index) => {
      const img = new Image();
      img.onload = () => {
        ctx.reset();
        ctx.drawImage(img, 0, 0, width, height);
        gif.addFrame(ctx, {
          copy: true,
          delay: (1 / fps) * 1000,
        });

        loaded++;
        if (loaded === images.length) {
          gif.on('finished', (blob: Blob) => {
            const url = URL.createObjectURL(blob);

            // Cache for 3 days
            cache.set(name, url, 3);
            resolve(url);
          });
          gif.render();
        }
      };
      img.onerror = () => {
        reject(`Failed to load image at index ${index}`);
      };

      // Ensure it's a valid data URL
      img.src = src.startsWith('data:image') ? src : `data:image/png;base64,${src}`;
    });
  });
}

export async function fetchBlobAsUint8Array(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
