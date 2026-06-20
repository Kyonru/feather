import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { useShaderGraphStore } from '@/store/shader-graph';
import { useSettingsStore } from '@/store/settings';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';
import { codegen } from '@/pages/shader-graph/codegen';
import { diagnoseShaderGraph, hasBlockingDiagnostics } from '@/pages/shader-graph/diagnostics';
import {
  DEFAULT_TEXTURE_LAB_RECIPE,
  DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS,
  generateTextureLabAtlasBundleAsync,
  generateTextureLabTextureAsync,
  normalizeTextureLabRecipe,
  TEXTURE_LAB_GENERATORS,
} from '@/pages/texture-lab/generator';
import type {
  GeneratedGlsl,
  PlaygroundTarget,
  ShaderEdge,
  ShaderNodeInstance,
  ShaderPreviewShape,
  ShaderSubgraph,
} from '@/types/shader-graph';
import type { GeneratedTextureResult, TextureLabAtlasBundle } from '@/types/texture-lab';

const SHADER_GRAPH_TOOL = 'shader-graph';
const PARTICLE_TOOL = 'particle-system-playground';
const TEXTURE_LAB_TOOL = 'texture-lab';
const SHADER_FILE_VERSION = 3;

type McpCreativeRequest = {
  id: string;
  tool: string;
  action: string;
  params?: unknown;
};

type ShaderGraphFile = {
  type: 'feather.shader-graph';
  version: number;
  exportedAt: string;
  shaderName: string;
  playgroundTarget: PlaygroundTarget | null;
  nodes: ShaderNodeInstance[];
  edges: ShaderEdge[];
  subgraphs: ShaderSubgraph[];
  activeTemplateInstanceId?: string | null;
  lastGeneratedGlsl?: GeneratedGlsl | null;
};

type TexturePayload = Omit<GeneratedTextureResult, 'dataUrl'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function paramsRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function shaderFilename(shaderName: string): string {
  const base =
    shaderName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shader-graph';
  return `${base}.feathershgh`;
}

function colorFromHex(value: string): [number, number, number, number] {
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return [1, 1, 1, 1];
  const int = Number.parseInt(match[1]!, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255, 1];
}

function shaderGraphSnapshot() {
  const state = useShaderGraphStore.getState();
  return {
    type: SHADER_GRAPH_TOOL,
    updatedAt: Date.now(),
    activeWorkspaceId: state.activeWorkspaceId,
    shaderName: state.shaderName,
    playgroundTarget: state.playgroundTarget,
    nodes: state.nodes,
    edges: state.edges,
    subgraphs: state.subgraphs,
    selectedNodeId: state.selectedNodeId,
    selectedEdgeId: state.selectedEdgeId,
    activeTemplateInstanceId: state.activeTemplateInstanceId,
    previewShape: state.previewShape,
    previewColor: state.previewColor,
    previewBaseTexture: state.previewBaseTexture,
    previewZoom: state.previewZoom,
    textureUploads: state.textureUploads,
    pinnedPreviewNodeIds: state.pinnedPreviewNodeIds,
    lastGeneratedGlsl: state.lastGeneratedGlsl,
    validationStatus: state.validationStatus,
    validationErrors: state.validationErrors,
  };
}

function textureLabSnapshot() {
  const state = useSettingsStore.getState();
  return {
    type: TEXTURE_LAB_TOOL,
    updatedAt: Date.now(),
    workspaceId: state.textureLabWorkspaceId,
    recipe: state.textureLabRecipe,
    savedRecipes: state.textureLabSavedRecipes,
    workspaces: state.textureLabWorkspaces,
  };
}

function particleSnapshot(queryClient: ReturnType<typeof useQueryClient>) {
  const sessionId = useSessionStore.getState().sessionId;
  const data = sessionId ? queryClient.getQueryData(sessionQueryKey.plugin(sessionId, PARTICLE_TOOL)) : null;
  return {
    type: PARTICLE_TOOL,
    updatedAt: Date.now(),
    sessionId,
    data: data ?? null,
  };
}

function exportShaderGraph(): { filename: string; graph: ShaderGraphFile; content: string } {
  const state = useShaderGraphStore.getState();
  const graph: ShaderGraphFile = {
    type: 'feather.shader-graph',
    version: SHADER_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    shaderName: state.shaderName,
    playgroundTarget: state.playgroundTarget,
    nodes: state.nodes,
    edges: state.edges,
    subgraphs: state.subgraphs,
    activeTemplateInstanceId: state.activeTemplateInstanceId,
    lastGeneratedGlsl: state.lastGeneratedGlsl,
  };
  return {
    filename: shaderFilename(state.shaderName),
    graph,
    content: JSON.stringify(graph, null, 2),
  };
}

function parseShaderGraphInput(input: unknown): ShaderGraphFile {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (!isRecord(parsed)) throw new Error('Shader graph input must be a JSON object or string');
  if (parsed.type !== 'feather.shader-graph' || ![1, 2, SHADER_FILE_VERSION].includes(Number(parsed.version))) {
    throw new Error('Unsupported shader graph file');
  }
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('Shader graph file is missing nodes or edges');
  }
  return {
    type: 'feather.shader-graph',
    version: SHADER_FILE_VERSION,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    shaderName: typeof parsed.shaderName === 'string' ? parsed.shaderName : 'my-shader',
    playgroundTarget: (parsed.playgroundTarget ?? null) as PlaygroundTarget | null,
    nodes: parsed.nodes as ShaderNodeInstance[],
    edges: parsed.edges as ShaderEdge[],
    subgraphs: Array.isArray(parsed.subgraphs) ? (parsed.subgraphs as ShaderSubgraph[]) : [],
    activeTemplateInstanceId:
      typeof parsed.activeTemplateInstanceId === 'string' ? parsed.activeTemplateInstanceId : null,
    lastGeneratedGlsl: (parsed.lastGeneratedGlsl ?? null) as GeneratedGlsl | null,
  };
}

function shaderGraphFromParams(params: Record<string, unknown>) {
  if (params.graph !== undefined) return parseShaderGraphInput(params.graph);
  if (params.raw !== undefined) return parseShaderGraphInput(params.raw);
  return null;
}

function compileShaderGraph(params: Record<string, unknown>) {
  const state = useShaderGraphStore.getState();
  const graph = shaderGraphFromParams(params);
  const nodes = graph?.nodes ?? state.nodes;
  const edges = graph?.edges ?? state.edges;
  const subgraphs = graph?.subgraphs ?? state.subgraphs;
  const diagnostics = diagnoseShaderGraph({
    nodes,
    edges,
    subgraphs,
    textureUploads: state.textureUploads,
  });
  const glsl = codegen(nodes, edges, subgraphs);
  if (!graph) state.setLastGlsl(glsl);
  return {
    glsl,
    diagnostics,
    hasBlockingDiagnostics: hasBlockingDiagnostics(diagnostics),
  };
}

function importShaderGraph(params: Record<string, unknown>) {
  const graph = shaderGraphFromParams(params);
  if (!graph) throw new Error('Pass raw shader graph JSON or graph object');
  const diagnostics = diagnoseShaderGraph({
    nodes: graph.nodes,
    edges: graph.edges,
    subgraphs: graph.subgraphs,
  });
  useShaderGraphStore.getState().loadGraph({
    nodes: graph.nodes,
    edges: graph.edges,
    subgraphs: graph.subgraphs,
    shaderName: graph.shaderName,
    playgroundTarget: graph.playgroundTarget,
    activeTemplateInstanceId: graph.activeTemplateInstanceId ?? null,
  });
  if (graph.lastGeneratedGlsl) {
    useShaderGraphStore.getState().setLastGlsl(graph.lastGeneratedGlsl);
  }
  return {
    imported: true,
    shaderName: graph.shaderName,
    diagnostics,
    hasBlockingDiagnostics: hasBlockingDiagnostics(diagnostics),
  };
}

function shaderPreviewParams(params: Record<string, unknown>) {
  const state = useShaderGraphStore.getState();
  const compiled = compileShaderGraph(params);
  const glsl = compiled.glsl;
  const textureUniforms = glsl.textures ?? [];
  const textures = textureUniforms
    .map((texture) => {
      const upload = state.textureUploads[texture.nodeId];
      return upload ? { ...upload, uniform: texture.uniform } : null;
    })
    .filter((texture): texture is { filename: string; dataBase64: string; uniform: string } => !!texture);
  const shape = typeof params.shape === 'string' ? (params.shape as ShaderPreviewShape) : state.previewShape;
  const color = typeof params.color === 'string' ? colorFromHex(params.color) : colorFromHex(state.previewColor);
  return {
    pixelSource: glsl.pixel,
    vertexSource: glsl.vertex ?? '',
    shape,
    color,
    textureUniforms,
    parameters: glsl.parameters ?? [],
    baseTexture: state.previewBaseTexture,
    textures,
    previewZoom: state.previewZoom,
    diagnostics: compiled.diagnostics,
    hasBlockingDiagnostics: compiled.hasBlockingDiagnostics,
  };
}

function texturePayload(texture: GeneratedTextureResult): TexturePayload {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dataUrl: _dataUrl, ...rest } = texture;
  return rest;
}

function atlasPayload(bundle: TextureLabAtlasBundle) {
  return {
    texture: texturePayload(bundle.texture),
    frames: bundle.frames.map(texturePayload),
    atlas: bundle.atlas,
  };
}

async function handleTextureLabAction(action: string, params: Record<string, unknown>) {
  const state = useSettingsStore.getState();
  if (action === 'generators') return { generators: TEXTURE_LAB_GENERATORS };
  if (action === 'snapshot') return textureLabSnapshot();
  if (action === 'set-recipe') {
    state.setTextureLabRecipe(params.recipe && isRecord(params.recipe) ? params.recipe : params);
    return textureLabSnapshot();
  }
  if (action === 'save-recipe') {
    const name = typeof params.name === 'string' ? params.name : '';
    if (!name.trim()) throw new Error('Texture Lab save-recipe requires a name');
    state.saveTextureLabRecipe(name, params.recipe && isRecord(params.recipe) ? params.recipe : undefined);
    return textureLabSnapshot();
  }
  if (action === 'delete-recipe') {
    const id = typeof params.id === 'string' ? params.id : '';
    if (!id.trim()) throw new Error('Texture Lab delete-recipe requires an id');
    state.deleteTextureLabSavedRecipe(id);
    return textureLabSnapshot();
  }
  if (action === 'generate') {
    const recipe =
      params.recipe && isRecord(params.recipe) ? normalizeTextureLabRecipe(params.recipe) : state.textureLabRecipe;
    return texturePayload(await generateTextureLabTextureAsync(recipe));
  }
  if (action === 'generate-atlas') {
    const recipe = normalizeTextureLabRecipe({
      ...(params.recipe && isRecord(params.recipe) ? params.recipe : state.textureLabRecipe),
      atlas: {
        ...DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS,
        ...(state.textureLabRecipe.atlas ?? DEFAULT_TEXTURE_LAB_RECIPE.atlas ?? {}),
        ...(params.atlas && isRecord(params.atlas) ? params.atlas : {}),
        enabled: true,
      },
    });
    return atlasPayload(await generateTextureLabAtlasBundleAsync(recipe));
  }
  throw new Error(`Unknown Texture Lab MCP action: ${action}`);
}

async function handleCreativeRequest(request: McpCreativeRequest, queryClient: ReturnType<typeof useQueryClient>) {
  const params = paramsRecord(request.params);
  if (request.tool === SHADER_GRAPH_TOOL) {
    if (request.action === 'snapshot') return shaderGraphSnapshot();
    if (request.action === 'export') return exportShaderGraph();
    if (request.action === 'import') return importShaderGraph(params);
    if (request.action === 'compile') return compileShaderGraph(params);
    if (request.action === 'preview-params') return shaderPreviewParams(params);
    if (request.action === 'clear-preview') return { ok: true };
  }
  if (request.tool === PARTICLE_TOOL) {
    if (request.action === 'snapshot') return particleSnapshot(queryClient);
  }
  if (request.tool === TEXTURE_LAB_TOOL) {
    return handleTextureLabAction(request.action, params);
  }
  throw new Error(`Unknown MCP creative request: ${request.tool}/${request.action}`);
}

function publishCreativeSnapshot(tool: string, snapshot: unknown) {
  invoke('set_mcp_creative_snapshot', { tool, snapshot }).catch(() => {});
}

export function useMcpCreativeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    publishCreativeSnapshot(SHADER_GRAPH_TOOL, shaderGraphSnapshot());
    return useShaderGraphStore.subscribe(() => {
      publishCreativeSnapshot(SHADER_GRAPH_TOOL, shaderGraphSnapshot());
    });
  }, []);

  useEffect(() => {
    publishCreativeSnapshot(TEXTURE_LAB_TOOL, textureLabSnapshot());
    return useSettingsStore.subscribe(() => {
      publishCreativeSnapshot(TEXTURE_LAB_TOOL, textureLabSnapshot());
    });
  }, []);

  useEffect(() => {
    const syncParticleSnapshot = () => {
      publishCreativeSnapshot(PARTICLE_TOOL, particleSnapshot(queryClient));
    };
    syncParticleSnapshot();
    return queryClient.getQueryCache().subscribe((event) => {
      const key = event.query.queryKey;
      if (Array.isArray(key) && key[1] === 'plugin' && key[2] === PARTICLE_TOOL) {
        syncParticleSnapshot();
      }
    });
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<McpCreativeRequest>('feather://mcp-creative-request', async (event) => {
      const request = event.payload;
      if (!request?.id) return;
      try {
        const response = await handleCreativeRequest(request, queryClient);
        await invoke('resolve_mcp_creative_request', {
          id: request.id,
          ok: true,
          response,
          error: null,
        });
      } catch (error) {
        await invoke('resolve_mcp_creative_request', {
          id: request.id,
          ok: false,
          response: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
      .then((next) => {
        if (cancelled) next();
        else unlisten = next;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [queryClient]);
}
