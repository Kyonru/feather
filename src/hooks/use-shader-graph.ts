import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sendCommand } from '@/lib/send-command';
import { useSessionStore } from '@/store/session';
import { useShaderGraphStore } from '@/store/shader-graph';
import { sessionQueryKey } from './use-ws-connection';
import { codegen } from '@/pages/shader-graph/codegen';

const PLUGIN_ID = 'particle-system-playground';
const SHADER_GRAPH_PLUGIN = 'shader-graph';

export type ShaderPreviewShape = 'circle' | 'line' | 'rectangle';

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

  const compileQuery = useQuery<CompileResponse>({
    queryKey: sessionQueryKey.pluginAction(sessionId ?? '', SHADER_GRAPH_PLUGIN, 'compile-shader'),
    queryFn: () => ({ status: 'ok' as const }),
    enabled: false,
  });

  const generateAndStore = useCallback(() => {
    const glsl = codegen(store.nodes, store.edges);
    store.setLastGlsl(glsl);
    return glsl;
  }, [store]);

  const validateShader = useCallback(async () => {
    if (!sessionId) return;
    const glsl = generateAndStore();
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
  }, [generateAndStore, sessionId, store]);

  const applyToPlayground = useCallback(async () => {
    const target = store.playgroundTarget;
    if (!target || !sessionId) return;
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
      },
    });
  }, [generateAndStore, sessionId, store]);

  const previewShader = useCallback(
    async (shape: ShaderPreviewShape) => {
      if (!sessionId) return;
      const glsl = generateAndStore();
      await sendCommand(sessionId, {
        type: 'cmd:plugin:action',
        plugin: SHADER_GRAPH_PLUGIN,
        action: 'preview-shader',
        params: { pixelSource: glsl.pixel, vertexSource: glsl.vertex ?? '', shape },
      });
    },
    [generateAndStore, sessionId],
  );

  const clearPreview = useCallback(async () => {
    if (!sessionId) return;
    await sendCommand(sessionId, {
      type: 'cmd:plugin:action',
      plugin: SHADER_GRAPH_PLUGIN,
      action: 'clear-preview',
      params: {},
    });
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

  return { ...store, generateAndStore, validateShader, applyToPlayground, previewShader, clearPreview };
}
