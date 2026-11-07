import type { TextureLabAtlasPixels, TextureLabRecipe } from '@studio/types/texture-lab';
import { renderTextureLabAtlasPixels, renderTextureLabPixels } from './generator';

type WorkerScope = {
  addEventListener: (type: 'message', listener: (event: MessageEvent<TextureLabRecipe>) => void) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.addEventListener('message', (event) => {
  try {
    const result = event.data.atlas?.enabled
      ? renderTextureLabAtlasPixels(event.data)
      : renderTextureLabPixels(event.data);
    const transfer = [result.pixels.buffer as ArrayBuffer];
    if ('atlas' in result) {
      transfer.push(...(result as TextureLabAtlasPixels).frames.map((frame) => frame.pixels.buffer as ArrayBuffer));
    }
    workerScope.postMessage(result, transfer);
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : 'Texture preview rendering failed.' });
  }
});
