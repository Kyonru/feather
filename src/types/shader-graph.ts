import type { Node, Edge } from '@xyflow/react';

export type GlslType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4';

export type PortDef = { id: string; label: string; type: GlslType };

export const NODE_TYPES = [
  'TextureColor',
  'TextureCoords',
  'ScreenCoords',
  'VertexColor',
  'Time',
  'Resolution',
  'FloatConstant',
  'Vec2Constant',
  'Vec4Constant',
  'Add',
  'Subtract',
  'Multiply',
  'Divide',
  'Power',
  'Clamp',
  'Lerp',
  'Step',
  'Smoothstep',
  'Sin',
  'Cos',
  'Abs',
  'Fract',
  'Floor',
  'Split4',
  'Combine4',
  'Normalize',
  'Length',
  'Dot',
  'Desaturate',
  'OneMinus',
  'HueShift',
  'SimpleNoise',
  'Ripple',
  'SampleTexture',
  'CenteredUV',
  'Fresnel2D',
  'Outline2D',
  'WaveDistort',
  'Dissolve2D',
  'HitFlash',
  'Vignette',
  'Pixelate',
  'ChromaticAberration',
  'FragmentOutput',
  'VertexPosition',
  'TransformMatrix',
  'VertexOutput',
  'SplitVec2',
  'MatVecMul',
  'Vec3Constant',
  'SplitVec3',
  'Combine2',
  'Combine3',
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export type NodeCategory = 'Input' | 'Math' | 'Vector' | 'Color' | 'Noise' | 'Effect' | 'Output' | 'Vertex';

export type ShaderNodeData = {
  label: string;
  nodeType: NodeType;
  values?: Record<string, number | number[]>;
  [key: string]: unknown;
};

export type NodeDef = {
  category: NodeCategory;
  label: string;
  inputs: PortDef[];
  outputs: PortDef[];
  emitGlsl: (inVars: Record<string, string>, outVars: Record<string, string>, data: ShaderNodeData) => string;
  externs?: string[];
  helperKey?: string;
};

export type ShaderNodeInstance = Node<ShaderNodeData>;
export type ShaderEdge = Edge;

export type PlaygroundTarget = {
  composite: string;
  systemIndex: number;
};

export type GeneratedGlsl = {
  pixel: string;
  vertex: string | null;
  hash: string;
};
