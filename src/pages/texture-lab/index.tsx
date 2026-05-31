import { toast } from 'sonner';
import { TextureLabPanel } from './TextureLabPanel';
import { useParticleSystemPlayground } from '@/hooks/use-particle-system-playground';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { GeneratedTextureResult } from '@/types/texture-lab';

const SHADER_TEXTURE_NODE_TYPES = new Set(['TextureInput', 'TextureUniformColor', 'TextureParameter']);

export default function TextureLab() {
  const playground = useParticleSystemPlayground();
  const shaderNodes = useShaderGraphStore((state) => state.nodes);
  const selectedShaderNodeId = useShaderGraphStore((state) => state.selectedNodeId);
  const setShaderTextureUpload = useShaderGraphStore((state) => state.setTextureUpload);
  const setPreviewBaseTexture = useShaderGraphStore((state) => state.setPreviewBaseTexture);
  const selectedShaderNode = shaderNodes.find((node) => node.id === selectedShaderNodeId) ?? null;
  const canUseParticleEmitter = !!playground.activeSystem && playground.composite?.compositeType === 'scratch';
  const canUseShaderTexture = !!selectedShaderNode && SHADER_TEXTURE_NODE_TYPES.has(selectedShaderNode.data.nodeType);

  function useTexture(texture: GeneratedTextureResult) {
    if (canUseParticleEmitter) {
      void playground.setTextureFromUpload(texture.filename, texture.dataBase64);
      return;
    }
    if (canUseShaderTexture && selectedShaderNode) {
      setShaderTextureUpload(selectedShaderNode.id, {
        filename: texture.filename,
        dataBase64: texture.dataBase64,
      });
      return;
    }
    setPreviewBaseTexture({
      filename: texture.filename,
      dataBase64: texture.dataBase64,
    });
    toast.info('Texture applied as the Shader Graph preview texture');
  }

  const applyLabel = canUseParticleEmitter
    ? `Use in ${playground.activeSystem?.title ?? 'emitter'}`
    : canUseShaderTexture
      ? `Use in ${selectedShaderNode?.data.label ?? 'shader texture'}`
      : 'Use as shader preview';

  return (
    <main className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden" data-testid="texture-lab-page">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Texture Lab</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Generate tiny procedural textures for particles, shader masks, noise uniforms, trails, and sprite effects.
          </p>
        </div>
      </header>
      <div className="h-0 min-h-0 flex-1 overflow-hidden p-4">
        <div className="mx-auto h-full min-h-0 w-full max-w-7xl">
          <TextureLabPanel applyLabel={applyLabel} onApply={useTexture} />
        </div>
      </div>
    </main>
  );
}
