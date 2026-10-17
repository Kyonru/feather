import { toast } from 'sonner';
import { useEffect } from 'react';
import { TextureLabActionControls, TextureLabPanel } from './TextureLabPanel';
import { useLocalParticlePlayground } from '@studio/tools/particle-system-playground/use-local-particle-playground';
import { useShaderGraphStore } from '@studio/store/shader-graph';
import { useStudioPreferencesStore } from '@studio/store/studio-preferences';
import { useWorkspaceToolKey } from '@studio/store/studio-workspaces';
import type { GeneratedTextureResult } from '@studio/types/texture-lab';

const SHADER_TEXTURE_NODE_TYPES = new Set(['TextureInput', 'TextureUniformColor', 'TextureParameter']);

export default function TextureLab() {
  // Everything here follows the Studio workspace, attached or not: the
  // emitter a texture goes into and the graph it textures are the ones the user
  // is working on, never a game's.
  const playground = useLocalParticlePlayground(useWorkspaceToolKey('particles'));
  const shaderWorkspaceId = useWorkspaceToolKey('shaderGraph');
  const textureWorkspaceId = useWorkspaceToolKey('textureLab');
  const activateShaderWorkspace = useShaderGraphStore((state) => state.activateWorkspace);
  const activateTextureLabWorkspace = useStudioPreferencesStore((state) => state.activateTextureLabWorkspace);
  const shaderNodes = useShaderGraphStore((state) => state.nodes);
  const selectedShaderNodeId = useShaderGraphStore((state) => state.selectedNodeId);
  const setShaderTextureUpload = useShaderGraphStore((state) => state.setTextureUpload);
  const setPreviewBaseTexture = useShaderGraphStore((state) => state.setPreviewBaseTexture);
  const selectedShaderNode = shaderNodes.find((node) => node.id === selectedShaderNodeId) ?? null;
  const canUseParticleEmitter = !!playground.activeSystem && playground.composite?.compositeType === 'scratch';
  const canUseShaderTexture = !!selectedShaderNode && SHADER_TEXTURE_NODE_TYPES.has(selectedShaderNode.data.nodeType);

  useEffect(() => {
    activateShaderWorkspace(shaderWorkspaceId);
    activateTextureLabWorkspace(textureWorkspaceId);
  }, [activateShaderWorkspace, activateTextureLabWorkspace, shaderWorkspaceId, textureWorkspaceId]);

  function useTexture(texture: GeneratedTextureResult) {
    if (canUseParticleEmitter) {
      void playground.setTextureFromUpload(texture.filename, texture.dataBase64, texture.atlas);
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
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 bg-sidebar px-3 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Texture Lab</h1>
          <p className="truncate text-[10px] text-muted-foreground">
            Generate tiny procedural textures for particles, shader masks, noise uniforms, trails, and sprite effects.
          </p>
        </div>
        <TextureLabActionControls
          applyLabel={applyLabel}
          onApply={useTexture}
          showAtlasAction
          className="max-w-full justify-start sm:justify-end"
        />
      </header>
      <div className="h-0 min-h-0 flex-1 overflow-hidden">
        <div className="h-full min-h-0 w-full">
          <TextureLabPanel applyLabel={applyLabel} onApply={useTexture} />
        </div>
      </div>
    </main>
  );
}
