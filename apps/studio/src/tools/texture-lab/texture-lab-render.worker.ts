import type { TextureLabRecipe } from '@studio/types/texture-lab';
import { renderTextureLabPixels } from './generator';

type WorkerScope = {
  addEventListener: (type: 'message', listener: (event: MessageEvent<TextureLabRecipe>) => void) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.addEventListener('message', (event) => {
  try {
    const result = renderTextureLabPixels(event.data);
    workerScope.postMessage(result, [result.pixels.buffer as ArrayBuffer]);
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : 'Texture preview rendering failed.' });
  }
});
