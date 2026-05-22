import type { Node, Edge } from '@xyflow/react';

export type GlslType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4';

export type PortDef = {
  id: string;
  label: string;
  type: GlslType;
  defaultValue?: number | number[];
  min?: number;
  max?: number;
  step?: number;
};

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
  'Min',
  'Max',
  'Modulo',
  'Negate',
  'Saturate',
  'Remap',
  'Split4',
  'Combine4',
  'SplitRGB',
  'CombineRGB',
  'SwizzleVec2',
  'Normalize',
  'Length',
  'Dot',
  'DistanceVec2',
  'LengthVec2',
  'NormalizeVec2',
  'DotVec2',
  'Desaturate',
  'OneMinus',
  'HueShift',
  'InvertColor',
  'Contrast',
  'PosterizeColor',
  'MultiplyColor',
  'SimpleNoise',
  'Ripple',
  'VoronoiCells',
  'Checkerboard',
  'TilingOffset',
  'RotateUV',
  'TwirlUV',
  'PolarCoordinates',
  'SampleTexture',
  'TextureStrength',
  'Opacity2D',
  'CenteredUV',
  'Fresnel2D',
  'Outline2D',
  'WaveDistort',
  'WaterDisplace',
  'MaskedWaterDisplace',
  'Dissolve2D',
  'HitFlash',
  'Vignette',
  'Pixelate',
  'ChromaticAberration',
  'PixelPoint',
  'PixelPointGrid',
  'PixelRay',
  'PixelRays',
  'PixelLine',
  'PixelLines',
  'PixelCircle',
  'PixelPolygon',
  'FragmentOutput',
  'VertexPosition',
  'VertexWave2D',
  'TransformMatrix',
  'VertexOutput',
  'SplitVec2',
  'MatVecMul',
  'Vec3Constant',
  'SplitVec3',
  'Combine2',
  'Combine3',
  // Math
  'Sqrt',
  'Ceil',
  'Round',
  'Sign',
  'Tan',
  'Log',
  'Exp',
  'Atan2',
  // Vector
  'CrossVec3',
  'LerpVec4',
  'ScaleVec2',
  'ScaleVec4',
  // Color
  'BlendAdd',
  'BlendScreen',
  'BlendOverlay',
  'CompositeAlpha',
  'Brightness',
  'GammaCorrect',
  'LabColorConvert',
  'LabComplementary',
  'LabSplitScheme',
  'LabDualScheme',
  // Noise
  'GradientNoise',
  'FBMNoise',
  'TruchetTiles',
  // Pattern
  'PatternZigZag',
  'PatternSineWaves',
  'PatternRoundWaves',
  'PatternDots',
  'PatternSpiral',
  'PatternWhirl',
  // Halftone
  'HalftoneMono',
  'HalftoneColor',
  // UV
  'ZoomUV',
  'FlipUV',
  // SDF
  'SDFLine',
  'SDFCircle',
  'SDFRect',
  'SDFPolygon',
  'SDFSample',
  'SDFSampleStrip',
  'SDFBoolean',
  'SDFSoftBoolean',
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export type NodeCategory = 'Input' | 'Math' | 'Vector' | 'Color' | 'Composite' | 'Noise' | 'Pattern' | 'Halftone' | 'Pixel Perfect' | 'UV' | 'Effect' | 'Output' | 'Vertex' | 'SDF';

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
