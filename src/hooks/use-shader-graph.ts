import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sendCommand } from '@/lib/send-command';
import { useSessionStore } from '@/store/session';
import { useShaderGraphStore } from '@/store/shader-graph';
import { sessionQueryKey } from './use-ws-connection';
import { codegen } from '@/pages/shader-graph/codegen';
import { shaderGraphGamePreviewController } from '@/pages/shader-graph/gamePreviewController';
import { diagnoseShaderGraph, hasBlockingDiagnostics } from '@/pages/shader-graph/diagnostics';
import type { GeneratedGlsl, ShaderParameter, ShaderTextureUpload } from '@/types/shader-graph';

const PLUGIN_ID = 'particle-system-playground';
const SHADER_GRAPH_PLUGIN = 'shader-graph';

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
  const runtimeSuspended = useSessionStore((s) =>
    sessionId ? s.sessions[sessionId]?.runtimeSuspended === true : false,
  );

  const compileQuery = useQuery<CompileResponse>({
    queryKey: sessionQueryKey.pluginAction(sessionId ?? '', SHADER_GRAPH_PLUGIN, 'compile-shader'),
    queryFn: () => ({ status: 'ok' as const }),
    enabled: false,
  });

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
    if (!sessionId || runtimeSuspended) return;
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
      await sendCommand(sessionId, {
        type: 'cmd:plugin:action',
        plugin: SHADER_GRAPH_PLUGIN,
        action: 'compile-shader',
        params: { pixelSource: glsl.pixel, vertexSource: glsl.vertex ?? '' },
      });
    } catch {
      store.setValidationStatus('error');
      store.setValidationErrors({ pixelError: 'Failed to reach game process' });
    }
  }, [generateAndStore, runtimeSuspended, sessionId, store]);

  const applyToPlayground = useCallback(async (textures: ShaderPreviewTextureUpload[] = []) => {
    const target = store.playgroundTarget;
    if (!target || !sessionId || runtimeSuspended) return;
    const glsl = generateAndStore();
    const shaderSource = glsl.vertex ? `${glsl.pixel}\n${glsl.vertex}` : glsl.pixel;
    await sendCommand(sessionId, {
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
  }, [generateAndStore, runtimeSuspended, sessionId, store]);

  const sendShaderPreview = useCallback(
    async (
      glsl: GeneratedGlsl,
      shape: ShaderPreviewShape,
      color: ShaderPreviewColor,
      options: { baseTexture?: ShaderPreviewTextureUpload | null; textures?: ShaderPreviewTextureUpload[]; parameters?: ShaderPreviewParameter[] } = {},
    ) => {
      if (!sessionId || runtimeSuspended) return;
      await shaderGraphGamePreviewController.preview(sessionId, {
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
    [runtimeSuspended, sessionId],
  );

  const previewShader = useCallback(
    async (
      shape: ShaderPreviewShape,
      color: ShaderPreviewColor,
      options: { baseTexture?: ShaderPreviewTextureUpload | null; textures?: ShaderPreviewTextureUpload[]; parameters?: ShaderPreviewParameter[] } = {},
    ) => {
      if (!sessionId || runtimeSuspended) return;
      const glsl = generateAndStore();
      await sendShaderPreview(glsl, shape, color, options);
    },
    [generateAndStore, runtimeSuspended, sendShaderPreview, sessionId],
  );

  const clearPreview = useCallback(async () => {
    if (!sessionId) return;
    await shaderGraphGamePreviewController.clear(sessionId);
  }, [sessionId]);

  const compileResult = compileQuery.data;

  useEffect(() => {
    if (!compileResult || store.validationStatus !== 'validating') return;

    if (compileResult.status === 'error' && !compileResult.data) {
      store.setValidationStatus('error');
      store.setValidationErrors({ pixelError: compileResult.message ?? 'Shader validation failed' });
      return;
    }

    const payload = compileResult.data ?? compileResult;
    if (payload.status === 'ok') {
      store.setValidationStatus('ok');
      store.setValidationErrors({});
      return;
    }

    store.setValidationStatus('error');
    store.setValidationErrors({
      pixelError: payload.pixelError,
      vertexError: payload.vertexError,
    });
  }, [compileResult, store]);

  return {
    ...store,
    diagnostics,
    hasBlockingGraphDiagnostics,
    runtimeSuspended,
    generateAndStore,
    validateShader,
    applyToPlayground,
    previewShader,
    sendShaderPreview,
    clearPreview,
  };
}
