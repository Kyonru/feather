import GIF from 'gif.js.optimized';
import { LocalCache } from './cache';

const ONE_DAY = 24 * 60 * 60 * 1000;

const cache = new LocalCache('gif', ONE_DAY);

export function createGif(images: string[], fps: number, width: number, height: number): Promise<string> {
  const cached = cache.get<string>(`gif:${images.join(',')}`);

  if (cached) {
    return Promise.resolve(cached);
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
            cache.set(`gif:${images.join(',')}`, url, 3);
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
