import type { Node, Edge } from '@xyflow/react';

export type GlslType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4' | 'image';

export type SubgraphPortRole = 'source' | 'control' | 'texture';

export type PortDef = {
  id: string;
  label: string;
  type: GlslType;
  defaultValue?: number | number[];
  min?: number;
  max?: number;
  step?: number;
  uiRole?: SubgraphPortRole;
};

export const NODE_CATEGORIES = [
  'Custom',
  'Debug',
  'Input',
  'Math',
  'Complex',
  'Quaternion',
  'Symmetry',
  'Random',
  'Vector',
  'Color',
  'Composite',
  'Noise',
  'Pattern',
  'Halftone',
  'Pixel Perfect',
  'UV',
  'Fake 3D',
  'Effect',
  'Output',
  'Vertex',
  'SDF',
] as const;

export const NODE_TYPES = [
  'CustomFunction',
  'SubgraphInstance',
  'SubgraphInput',
  'SubgraphOutput',
  'Preview',
  'TextureColor',
  'TextureInput',
  'TextureUniformColor',
  'TextureCoords',
  'ScreenCoords',
  'VertexColor',
  'Time',
  'Resolution',
  'FloatParameter',
  'Vec2Parameter',
  'Vec3Parameter',
  'Vec4Parameter',
  'ColorParameter',
  'BooleanParameter',
  'TextureParameter',
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
  'WaterNoiseUV',
  'WaterDisplaceV2',
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
  // Complex
  'ComplexConjugate',
  'ComplexReciprocal',
  'ComplexMultiply',
  'ComplexDivide',
  'ComplexExp',
  'ComplexLog',
  'ComplexPower',
  // Quaternion
  'QuaternionInverse',
  'QuaternionFromEuler',
  'QuaternionFromAngleAxis',
  'QuaternionToAngleAxis',
  'QuaternionFromToRotation',
  'QuaternionMultiply',
  'QuaternionRotateVector',
  'QuaternionSlerp',
  // Symmetry
  'ReflectionSymmetry',
  'RotationSymmetry',
  'TilingSymmetry',
  // Random
  'RandomIntegerRange',
  'RandomCircle',
  'RandomSphere',
  'RandomRotation',
  'RandomColor',
  // Vector
  'AddVec2',
  'AddVec3',
  'AddVec4',
  'SubtractVec2',
  'SubtractVec3',
  'SubtractVec4',
  'MultiplyVec2',
  'MultiplyVec3',
  'MultiplyVec4',
  'DivideVec2',
  'DivideVec3',
  'DivideVec4',
  'CrossVec3',
  'LerpVec4',
  'ScaleVec2',
  'ScaleVec3',
  'ScaleVec4',
  // Color
  'BlendAdd',
  'BlendScreen',
  'BlendOverlay',
  'CompositeAlpha',
  'EffectMix',
  'AlphaMask',
  'LumaMask',
  'MaskRange',
  'GradientMap',
  'MaskCombine',
  'BlendModes',
  'ColorRamp',
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
  // Fake 3D
  'SpriteTextureSample',
  'BillboardUV',
  'ParallaxUV',
  'FakeDepthShade',
  'BillboardShadow',
  'AtlasSliceUV',
  'StackedSpriteSample',
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

export type NodeCategory = (typeof NODE_CATEGORIES)[number];

export type ShaderNodeData = {
  label: string;
  nodeType: NodeType;
  values?: Record<string, number | number[]>;
  uniformName?: string;
  subgraphId?: string;
  subgraphInputs?: PortDef[];
  subgraphOutputs?: PortDef[];
  linkedSourceNodeId?: string | null;
  linkedSourceLabel?: string | null;
  [key: string]: unknown;
};

export type ShaderSubgraph = {
  id: string;
  name: string;
  functionName: string;
  nodes: ShaderNodeInstance[];
  edges: ShaderEdge[];
  inputs: PortDef[];
  outputs: PortDef[];
  inputMappings: Record<string, { nodeId: string; portId: string }>;
  outputMappings: Record<string, { nodeId: string; portId: string }>;
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

export type ShaderTextureUpload = {
  filename: string;
  dataBase64: string;
};

export type ShaderPreviewShape = 'circle' | 'line' | 'rectangle';

export type ShaderParameter = {
  nodeId: string;
  label: string;
  uniform: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'color' | 'boolean' | 'texture';
  defaultValue?: number | number[];
};

export type ShaderGraphDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  edgeId?: string;
  portId?: string;
  stage?: 'pixel' | 'vertex' | 'graph';
};

export type GeneratedGlsl = {
  pixel: string;
  vertex: string | null;
  hash: string;
  textures?: Array<{
    nodeId: string;
    uniform: string;
    label: string;
  }>;
  parameters?: ShaderParameter[];
};
