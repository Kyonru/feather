import { useCallback } from 'react';
import { sendCommand } from '@feather/session-bridge';
import { sessionSupportsRuntime, useSessionStore } from '@studio/session';
import { useShaderGraphStore } from '@studio/store/shader-graph';
import { useInspectorConnection } from '@studio/store/inspector-connection';
import { codegen } from '@studio/tools/shader-graph/codegen';
import { shaderGraphGamePreviewController } from '@studio/tools/shader-graph/gamePreviewController';
import { diagnoseShaderGraph, hasBlockingDiagnostics } from '@studio/tools/shader-graph/diagnostics';
import type { GeneratedGlsl, ShaderParameter, ShaderTextureUpload } from '@studio/types/shader-graph';

const PLUGIN_ID = 'particle-system-playground';
const SHADER_GRAPH_PLUGIN = 'shader-graph';
const VALIDATION_WAIT_MS = 5_000;

export type ShaderPreviewShape = 'circle' | 'line' | 'rectangle';
export type ShaderPreviewColor = [number, number, number, number];
export type ShaderPreviewTextureUpload = ShaderTextureUpload & {
  uniform?: string;
};
export type ShaderPreviewParameter = ShaderParameter;

type CompilePayload = { status: 'ok' | 'error'; pixelError?: string; vertexError?: string };
type CompileResponse = {
  status?: 'success' | 'error' | 'ok';
  message?: string;
  data?: CompilePayload;
  pixelError?: string;
  vertexError?: string;
};

export function useShaderGraph() {
  const store = useShaderGraphStore();
  const sessionId = useSessionStore((s) => s.sessionId);
  const activeSession = useSessionStore((s) => (s.sessionId ? s.sessions[s.sessionId] : null));
  const runtimeSessionId = sessionSupportsRuntime(activeSession) ? sessionId : null;
  const runtimeSuspended = useSessionStore((s) =>
    runtimeSessionId ? s.sessions[runtimeSessionId]?.runtimeSuspended === true : false,
  );

  const generateAndStore = useCallback(() => {
    const glsl = codegen(store.nodes, store.edges, store.subgraphs);
    store.setLastGlsl(glsl);
    return glsl;
  }, [store]);

  const diagnostics = diagnoseShaderGraph({
    nodes: store.nodes,
    edges: store.edges,
    subgraphs: store.subgraphs,
    textureUploads: store.textureUploads,
  });
  const hasBlockingGraphDiagnostics = hasBlockingDiagnostics(diagnostics);

  const validateShader = useCallback(async () => {
    if (!runtimeSessionId || runtimeSuspended) return;
    const glsl = generateAndStore();
    const nextDiagnostics = diagnoseShaderGraph({
      nodes: store.nodes,
      edges: store.edges,
      subgraphs: store.subgraphs,
      textureUploads: store.textureUploads,
    });
    const blocking = nextDiagnostics.find((diagnostic) => diagnostic.severity === 'error');
    if (blocking) {
      store.setValidationStatus('error');
      store.setValidationErrors({ pixelError: blocking.message });
      return;
    }
    store.setValidationStatus('validating');
    store.setValidationErrors({});
    try {
      const bridge = useInspectorConnection.getState().bridge;
      const sent = await bridge.sendPreview({
        sessionId: runtimeSessionId,
        plugin: SHADER_GRAPH_PLUGIN,
        action: 'compile-shader',
        params: { pixelSource: glsl.pixel, vertexSource: glsl.vertex ?? '' },
      });
      if (!sent.ok) throw new Error(sent.error);
      const deadline = Date.now() + VALIDATION_WAIT_MS;
      let response: CompileResponse | null = null;
      while (Date.now() < deadline) {
        const result = await bridge.previewResult({ sessionId: runtimeSessionId, requestId: sent.value.requestId });
        if (!result.ok) throw new Error(result.error);
        if (result.value.status === 'complete') {
          response = result.value.response as CompileResponse;
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      if (!response) throw new Error('The game did not return a shader compile result within 5 seconds. Check that Feather is running in the game.');
      const payload = response.data ?? response;
      if (response.status === 'error' && !response.data) {
        store.setValidationStatus('error');
        store.setValidationErrors({ pixelError: response.message ?? 'Shader validation failed' });
      } else if (payload.status === 'ok' || response.status === 'success') {
        store.setValidationStatus('ok');
        store.setValidationErrors({});
      } else {
        store.setValidationStatus('error');
        store.setValidationErrors({ pixelError: payload.pixelError, vertexError: payload.vertexError });
      }
    } catch (error) {
      store.setValidationStatus('error');
      store.setValidationErrors({ pixelError: error instanceof Error ? error.message : 'Failed to reach game process' });
    }
  }, [generateAndStore, runtimeSessionId, runtimeSuspended, store]);

  const applyToPlayground = useCallback(async (textures: ShaderPreviewTextureUpload[] = []) => {
    const target = store.playgroundTarget;
    if (!target || !runtimeSessionId || runtimeSuspended) return;
    const glsl = generateAndStore();
    const shaderSource = glsl.vertex ? `${glsl.pixel}\n${glsl.vertex}` : glsl.pixel;
    await sendCommand(runtimeSessionId, {
      type: 'cmd:plugin:action',
      plugin: PLUGIN_ID,
      action: 'set-shader',
      params: {
        composite: target.composite,
        systemIndex: target.systemIndex,
        shaderSource,
        filename: `${store.shaderName}.glsl`,
        textures,
        parameters: glsl.parameters ?? [],
      },
    });
  }, [generateAndStore, runtimeSessionId, runtimeSuspended, store]);

  const sendShaderPreview = useCallback(
    async (
      glsl: GeneratedGlsl,
      shape: ShaderPreviewShape,
      color: ShaderPreviewColor,
      options: { baseTexture?: ShaderPreviewTextureUpload | null; textures?: ShaderPreviewTextureUpload[]; parameters?: ShaderPreviewParameter[] } = {},
    ) => {
      if (!runtimeSessionId || runtimeSuspended) return;
      await shaderGraphGamePreviewController.preview(runtimeSessionId, {
        pixelSource: glsl.pixel,
        vertexSource: glsl.vertex ?? '',
        shape,
        color,
        textureUniforms: glsl.textures ?? [],
        parameters: options.parameters ?? glsl.parameters ?? [],
        baseTexture: options.baseTexture,
        textures: options.textures ?? [],
      });
    },
    [runtimeSessionId, runtimeSuspended],
  );

  const previewShader = useCallback(
    async (
      shape: ShaderPreviewShape,
      color: ShaderPreviewColor,
      options: { baseTexture?: ShaderPreviewTextureUpload | null; textures?: ShaderPreviewTextureUpload[]; parameters?: ShaderPreviewParameter[] } = {},
    ) => {
      if (!runtimeSessionId || runtimeSuspended) return;
      const glsl = generateAndStore();
      await sendShaderPreview(glsl, shape, color, options);
    },
    [generateAndStore, runtimeSessionId, runtimeSuspended, sendShaderPreview],
  );

  const clearPreview = useCallback(async () => {
    if (!runtimeSessionId) return;
    await shaderGraphGamePreviewController.clear(runtimeSessionId);
  }, [runtimeSessionId]);

  return {
    ...store,
    diagnostics,
    hasBlockingGraphDiagnostics,
    runtimeSuspended,
    runtimeSessionId,
    runtimeAvailable: !!runtimeSessionId,
    generateAndStore,
    validateShader,
    applyToPlayground,
    previewShader,
    sendShaderPreview,
    clearPreview,
  };
}
