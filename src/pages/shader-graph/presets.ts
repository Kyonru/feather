import type { Edge } from '@xyflow/react';
import type { NodeType, ShaderNodeData, ShaderNodeInstance } from '@/types/shader-graph';
import { NODE_DEFS } from './nodeDefs';

type PresetNode = {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  values?: Record<string, number | number[]>;
};

type PresetEdge = {
  from: string;
  out: string;
  to: string;
  in: string;
};

export type ShaderGraphPreset = {
  id: string;
  name: string;
  description: string;
  shaderName: string;
  nodes: ShaderNodeInstance[];
  edges: Edge[];
};

function node({ id, type, x, y, values }: PresetNode): ShaderNodeInstance {
  return {
    id,
    type: 'shaderNode',
    position: { x, y },
    data: {
      label: NODE_DEFS[type].label,
      nodeType: type,
      ...(values ? { values } : {}),
    } satisfies ShaderNodeData,
  };
}

function edge({ from, out, to, in: input }: PresetEdge): Edge {
  return {
    id: `${from}:${out}->${to}:${input}`,
    source: from,
    sourceHandle: out,
    target: to,
    targetHandle: input,
  };
}

function preset(
  id: string,
  name: string,
  description: string,
  shaderName: string,
  nodes: PresetNode[],
  edges: PresetEdge[],
): ShaderGraphPreset {
  return {
    id,
    name,
    description,
    shaderName,
    nodes: nodes.map(node),
    edges: edges.map(edge),
  };
}

export const SHADER_GRAPH_PRESETS: ShaderGraphPreset[] = [
  preset(
    'texture-pass',
    'Texture Pass',
    'Default LÖVE texture color multiplied by vertex color.',
    'texture-pass',
    [
      { id: 'tex', type: 'TextureColor', x: 0, y: 0 },
      { id: 'out', type: 'FragmentOutput', x: 300, y: 0 },
    ],
    [{ from: 'tex', out: 'out', to: 'out', in: 'color' }],
  ),
  preset(
    'outline',
    'Outline',
    'Alpha-based sprite outline with editable color and thickness.',
    'outline',
    [
      { id: 'tex', type: 'TextureColor', x: 0, y: 0 },
      { id: 'uv', type: 'TextureCoords', x: 0, y: 130 },
      { id: 'thickness', type: 'FloatConstant', x: 0, y: 260, values: { val: 3 } },
      { id: 'outline-color', type: 'Vec4Constant', x: 0, y: 390, values: { val: [1, 1, 1, 1] } },
      { id: 'outline', type: 'Outline2D', x: 310, y: 120 },
      { id: 'out', type: 'FragmentOutput', x: 650, y: 160 },
    ],
    [
      { from: 'tex', out: 'out', to: 'outline', in: 'color' },
      { from: 'uv', out: 'out', to: 'outline', in: 'uv' },
      { from: 'thickness', out: 'out', to: 'outline', in: 'thickness' },
      { from: 'outline-color', out: 'out', to: 'outline', in: 'outlineColor' },
      { from: 'outline', out: 'out', to: 'out', in: 'color' },
    ],
  ),
  preset(
    'wave',
    'Wave',
    'Sine-wave texture distortion useful for water, heat, magic, and flags.',
    'wave',
    [
      { id: 'uv', type: 'TextureCoords', x: 0, y: 0 },
      { id: 'time', type: 'Time', x: 0, y: 110 },
      { id: 'amp', type: 'FloatConstant', x: 0, y: 220, values: { val: 0.025 } },
      { id: 'freq', type: 'FloatConstant', x: 0, y: 330, values: { val: 28 } },
      { id: 'speed', type: 'FloatConstant', x: 0, y: 440, values: { val: 1.6 } },
      { id: 'wave', type: 'WaveDistort', x: 300, y: 150 },
      { id: 'sample', type: 'SampleTexture', x: 610, y: 180 },
      { id: 'out', type: 'FragmentOutput', x: 900, y: 180 },
    ],
    [
      { from: 'uv', out: 'out', to: 'wave', in: 'uv' },
      { from: 'time', out: 'out', to: 'wave', in: 'time' },
      { from: 'amp', out: 'out', to: 'wave', in: 'amp' },
      { from: 'freq', out: 'out', to: 'wave', in: 'freq' },
      { from: 'speed', out: 'out', to: 'wave', in: 'speed' },
      { from: 'wave', out: 'out', to: 'sample', in: 'uv' },
      { from: 'sample', out: 'out', to: 'out', in: 'color' },
    ],
  ),
  preset(
    'dissolve',
    'Dissolve',
    'Noise threshold dissolve with a colored burning edge.',
    'dissolve',
    [
      { id: 'tex', type: 'TextureColor', x: 0, y: 0 },
      { id: 'uv', type: 'TextureCoords', x: 0, y: 120 },
      { id: 'cut', type: 'FloatConstant', x: 0, y: 240, values: { val: 0.42 } },
      { id: 'soft', type: 'FloatConstant', x: 0, y: 360, values: { val: 0.08 } },
      { id: 'edge-color', type: 'Vec4Constant', x: 0, y: 480, values: { val: [1, 0.45, 0.05, 1] } },
      { id: 'dissolve', type: 'Dissolve2D', x: 320, y: 170 },
      { id: 'out', type: 'FragmentOutput', x: 660, y: 200 },
    ],
    [
      { from: 'tex', out: 'out', to: 'dissolve', in: 'color' },
      { from: 'uv', out: 'out', to: 'dissolve', in: 'uv' },
      { from: 'cut', out: 'out', to: 'dissolve', in: 'threshold' },
      { from: 'soft', out: 'out', to: 'dissolve', in: 'softness' },
      { from: 'edge-color', out: 'out', to: 'dissolve', in: 'edgeColor' },
      { from: 'dissolve', out: 'out', to: 'out', in: 'color' },
    ],
  ),
  preset(
    'hit-flash',
    'Hit Flash',
    'Mixes a sprite toward a bright flash color.',
    'hit-flash',
    [
      { id: 'tex', type: 'TextureColor', x: 0, y: 0 },
      { id: 'flash-color', type: 'Vec4Constant', x: 0, y: 140, values: { val: [1, 1, 1, 1] } },
      { id: 'amount', type: 'FloatConstant', x: 0, y: 280, values: { val: 0.65 } },
      { id: 'flash', type: 'HitFlash', x: 320, y: 95 },
      { id: 'out', type: 'FragmentOutput', x: 650, y: 115 },
    ],
    [
      { from: 'tex', out: 'out', to: 'flash', in: 'color' },
      { from: 'flash-color', out: 'out', to: 'flash', in: 'flashColor' },
      { from: 'amount', out: 'out', to: 'flash', in: 'amount' },
      { from: 'flash', out: 'out', to: 'out', in: 'color' },
    ],
  ),
  preset(
    'rim-glow',
    'Rim Glow',
    'Fresnel-like 2D edge glow for particles and soft sprites.',
    'rim-glow',
    [
      { id: 'uv', type: 'TextureCoords', x: 0, y: 0 },
      { id: 'power', type: 'FloatConstant', x: 0, y: 120, values: { val: 2.8 } },
      { id: 'intensity', type: 'FloatConstant', x: 0, y: 240, values: { val: 1.2 } },
      { id: 'rim', type: 'Fresnel2D', x: 300, y: 70 },
      { id: 'tex', type: 'TextureColor', x: 300, y: 270 },
      { id: 'glow-color', type: 'Vec4Constant', x: 300, y: 400, values: { val: [0.25, 0.8, 1, 1] } },
      { id: 'mix', type: 'HitFlash', x: 620, y: 185 },
      { id: 'out', type: 'FragmentOutput', x: 940, y: 205 },
    ],
    [
      { from: 'uv', out: 'out', to: 'rim', in: 'uv' },
      { from: 'power', out: 'out', to: 'rim', in: 'power' },
      { from: 'intensity', out: 'out', to: 'rim', in: 'intensity' },
      { from: 'tex', out: 'out', to: 'mix', in: 'color' },
      { from: 'glow-color', out: 'out', to: 'mix', in: 'flashColor' },
      { from: 'rim', out: 'out', to: 'mix', in: 'amount' },
      { from: 'mix', out: 'out', to: 'out', in: 'color' },
    ],
  ),
  preset(
    'pixelate',
    'Pixelate',
    'Crunchy low-resolution sampling for retro sprites or transitions.',
    'pixelate',
    [
      { id: 'uv', type: 'TextureCoords', x: 0, y: 0 },
      { id: 'amount', type: 'FloatConstant', x: 0, y: 140, values: { val: 10 } },
      { id: 'pixelate', type: 'Pixelate', x: 300, y: 50 },
      { id: 'sample', type: 'SampleTexture', x: 590, y: 70 },
      { id: 'out', type: 'FragmentOutput', x: 870, y: 70 },
    ],
    [
      { from: 'uv', out: 'out', to: 'pixelate', in: 'uv' },
      { from: 'amount', out: 'out', to: 'pixelate', in: 'amount' },
      { from: 'pixelate', out: 'out', to: 'sample', in: 'uv' },
      { from: 'sample', out: 'out', to: 'out', in: 'color' },
    ],
  ),
  preset(
    'chromatic-aberration',
    'Chromatic Aberration',
    'Splits red and blue channels away from the center.',
    'chromatic-aberration',
    [
      { id: 'uv', type: 'TextureCoords', x: 0, y: 0 },
      { id: 'amount', type: 'FloatConstant', x: 0, y: 140, values: { val: 0.006 } },
      { id: 'chromatic', type: 'ChromaticAberration', x: 300, y: 55 },
      { id: 'out', type: 'FragmentOutput', x: 660, y: 75 },
    ],
    [
      { from: 'uv', out: 'out', to: 'chromatic', in: 'uv' },
      { from: 'amount', out: 'out', to: 'chromatic', in: 'amount' },
      { from: 'chromatic', out: 'out', to: 'out', in: 'color' },
    ],
  ),
];
