import type { GlslType, NodeDef, NodeType, ShaderNodeData } from '@/types/shader-graph';
import { glslFloat } from './glslUtils';

export const PORT_TYPE_COLORS: Record<GlslType, string> = {
  float: '#94a3b8',
  vec2: '#4ade80',
  vec3: '#60a5fa',
  vec4: '#c084fc',
  mat4: '#fb923c',
};

type Emit = (inVars: Record<string, string>, outVars: Record<string, string>, data: ShaderNodeData) => string;

function unary(fn: string): Emit {
  return (i, o) => `float ${o.out} = ${fn}(${i.in0});`;
}

function binary(op: string): Emit {
  return (i, o) => `float ${o.out} = ${i.a} ${op} ${i.b};`;
}

export const NODE_DEFS: Record<NodeType, NodeDef> = {
  // ─── Input ──────────────────────────────────────────────────────────────────
  TextureColor: {
    category: 'Input',
    label: 'Texture Color',
    inputs: [],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (_, o) => `vec4 ${o.out} = Texel(tex, texture_coords);`,
  },
  TextureCoords: {
    category: 'Input',
    label: 'Texture Coords',
    inputs: [],
    outputs: [{ id: 'out', label: 'UV', type: 'vec2' }],
    emitGlsl: (_, o) => `vec2 ${o.out} = texture_coords;`,
  },
  ScreenCoords: {
    category: 'Input',
    label: 'Screen Coords',
    inputs: [],
    outputs: [{ id: 'out', label: 'XY', type: 'vec2' }],
    emitGlsl: (_, o) => `vec2 ${o.out} = screen_coords;`,
  },
  VertexColor: {
    category: 'Input',
    label: 'Vertex Color',
    inputs: [],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (_, o) => `vec4 ${o.out} = color;`,
  },
  Time: {
    category: 'Input',
    label: 'Time',
    inputs: [],
    outputs: [{ id: 'out', label: 'T', type: 'float' }],
    externs: ['extern number u_time;'],
    emitGlsl: (_, o) => `float ${o.out} = u_time;`,
  },
  Resolution: {
    category: 'Input',
    label: 'Resolution',
    inputs: [],
    outputs: [{ id: 'out', label: 'XY', type: 'vec2' }],
    emitGlsl: (_, o) => `vec2 ${o.out} = love_ScreenSize.xy;`,
  },
  FloatConstant: {
    category: 'Input',
    label: 'Float',
    inputs: [],
    outputs: [{ id: 'out', label: 'Value', type: 'float' }],
    emitGlsl: (_, o, d) => `float ${o.out} = ${glslFloat(d.values?.val)};`,
  },
  Vec2Constant: {
    category: 'Input',
    label: 'Vec2',
    inputs: [],
    outputs: [{ id: 'out', label: 'XY', type: 'vec2' }],
    emitGlsl: (_, o, d) => {
      const v = (d.values?.val as number[]) ?? [0, 0];
      return `vec2 ${o.out} = vec2(${glslFloat(v[0])}, ${glslFloat(v[1])});`;
    },
  },
  Vec3Constant: {
    category: 'Input',
    label: 'Vec3',
    inputs: [],
    outputs: [{ id: 'out', label: 'XYZ', type: 'vec3' }],
    emitGlsl: (_, o, d) => {
      const v = (d.values?.val as number[]) ?? [0, 0, 0];
      return `vec3 ${o.out} = vec3(${glslFloat(v[0])}, ${glslFloat(v[1])}, ${glslFloat(v[2])});`;
    },
  },
  Vec4Constant: {
    category: 'Input',
    label: 'Vec4',
    inputs: [],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (_, o, d) => {
      const v = (d.values?.val as number[]) ?? [0, 0, 0, 1];
      return `vec4 ${o.out} = vec4(${glslFloat(v[0])}, ${glslFloat(v[1])}, ${glslFloat(v[2])}, ${glslFloat(v[3])});`;
    },
  },

  // ─── Math ────────────────────────────────────────────────────────────────────
  Add: {
    category: 'Math',
    label: 'Add',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: binary('+'),
  },
  Subtract: {
    category: 'Math',
    label: 'Subtract',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: binary('-'),
  },
  Multiply: {
    category: 'Math',
    label: 'Multiply',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: binary('*'),
  },
  Divide: {
    category: 'Math',
    label: 'Divide',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: binary('/'),
  },
  Power: {
    category: 'Math',
    label: 'Power',
    inputs: [
      { id: 'base', label: 'Base', type: 'float' },
      { id: 'exp', label: 'Exp', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = pow(${i.base}, ${i.exp});`,
  },
  Clamp: {
    category: 'Math',
    label: 'Clamp',
    inputs: [
      { id: 'val', label: 'Val', type: 'float' },
      { id: 'min', label: 'Min', type: 'float' },
      { id: 'max', label: 'Max', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = clamp(${i.val}, ${i.min}, ${i.max});`,
  },
  Lerp: {
    category: 'Math',
    label: 'Lerp',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 't', label: 'T', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = mix(${i.a}, ${i.b}, ${i.t});`,
  },
  Step: {
    category: 'Math',
    label: 'Step',
    inputs: [
      { id: 'edge', label: 'Edge', type: 'float' },
      { id: 'x', label: 'X', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = step(${i.edge}, ${i.x});`,
  },
  Smoothstep: {
    category: 'Math',
    label: 'Smoothstep',
    inputs: [
      { id: 'edge0', label: 'Edge0', type: 'float' },
      { id: 'edge1', label: 'Edge1', type: 'float' },
      { id: 'x', label: 'X', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = smoothstep(${i.edge0}, ${i.edge1}, ${i.x});`,
  },
  Sin: {
    category: 'Math',
    label: 'Sin',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('sin'),
  },
  Cos: {
    category: 'Math',
    label: 'Cos',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('cos'),
  },
  Abs: {
    category: 'Math',
    label: 'Abs',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('abs'),
  },
  Fract: {
    category: 'Math',
    label: 'Fract',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('fract'),
  },
  Floor: {
    category: 'Math',
    label: 'Floor',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('floor'),
  },

  // ─── Vector ──────────────────────────────────────────────────────────────────
  Split4: {
    category: 'Vector',
    label: 'Split Vec4',
    inputs: [{ id: 'vec', label: 'RGBA', type: 'vec4' }],
    outputs: [
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'a', label: 'A', type: 'float' },
    ],
    emitGlsl: (i, o) =>
      `float ${o.r} = ${i.vec}.r;\nfloat ${o.g} = ${i.vec}.g;\nfloat ${o.b} = ${i.vec}.b;\nfloat ${o.a} = ${i.vec}.a;`,
  },
  Combine4: {
    category: 'Vector',
    label: 'Combine4',
    inputs: [
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'a', label: 'A', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = vec4(${i.r}, ${i.g}, ${i.b}, ${i.a});`,
  },
  Normalize: {
    category: 'Vector',
    label: 'Normalize',
    inputs: [{ id: 'vec', label: 'Vec', type: 'vec4' }],
    outputs: [{ id: 'out', label: 'Vec', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = vec4(normalize(${i.vec}.rgb), ${i.vec}.a);`,
  },
  Length: {
    category: 'Vector',
    label: 'Length',
    inputs: [{ id: 'vec', label: 'Vec', type: 'vec4' }],
    outputs: [{ id: 'out', label: 'Len', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = length(${i.vec}.rgb);`,
  },
  Dot: {
    category: 'Vector',
    label: 'Dot',
    inputs: [
      { id: 'a', label: 'A', type: 'vec4' },
      { id: 'b', label: 'B', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = dot(${i.a}.rgb, ${i.b}.rgb);`,
  },

  // ─── Color ───────────────────────────────────────────────────────────────────
  Desaturate: {
    category: 'Color',
    label: 'Desaturate',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'amount', label: 'Amount', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Color', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `float ${o.out}_lum = dot(${i.color}.rgb, vec3(0.299, 0.587, 0.114));\nvec4 ${o.out} = vec4(mix(${i.color}.rgb, vec3(${o.out}_lum), ${i.amount}), ${i.color}.a);`,
  },
  OneMinus: {
    category: 'Color',
    label: 'One Minus',
    inputs: [{ id: 'val', label: 'Val', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = 1.0 - ${i.val};`,
  },
  HueShift: {
    category: 'Color',
    label: 'Hue Shift',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'shift', label: 'Shift', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Color', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec3 ${o.out}_p = vec3(0.55735) * dot(vec3(0.55735), ${i.color}.rgb);\nvec3 ${o.out}_u = ${i.color}.rgb - ${o.out}_p;\nvec3 ${o.out}_v = cross(vec3(0.55735), ${o.out}_u);\nvec4 ${o.out} = vec4(${o.out}_p + ${o.out}_u * cos(${i.shift} * 6.2832) + ${o.out}_v * sin(${i.shift} * 6.2832), ${i.color}.a);`,
  },

  // ─── Noise ───────────────────────────────────────────────────────────────────
  SimpleNoise: {
    category: 'Noise',
    label: 'Simple Noise',
    inputs: [{ id: 'uv', label: 'UV', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'Noise', type: 'float' }],
    helperKey: 'noise',
    emitGlsl: (i, o) => `float ${o.out} = feather_hash(${i.uv});`,
  },
  Ripple: {
    category: 'Noise',
    label: 'Ripple',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'time', label: 'Time', type: 'float' },
      { id: 'freq', label: 'Freq', type: 'float' },
      { id: 'amp', label: 'Amp', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'UV', type: 'vec2' }],
    emitGlsl: (i, o) => `vec2 ${o.out} = ${i.uv} + vec2(sin(${i.uv}.y * ${i.freq} + ${i.time}) * ${i.amp}, 0.0);`,
  },

  // ─── Effects ────────────────────────────────────────────────────────────────
  SampleTexture: {
    category: 'Effect',
    label: 'Sample Texture',
    inputs: [{ id: 'uv', label: 'UV', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = Texel(tex, ${i.uv});`,
  },
  CenteredUV: {
    category: 'Effect',
    label: 'Centered UV',
    inputs: [{ id: 'uv', label: 'UV', type: 'vec2' }],
    outputs: [
      { id: 'out', label: 'UV - .5', type: 'vec2' },
      { id: 'dist', label: 'Dist', type: 'float' },
    ],
    emitGlsl: (i, o) => `vec2 ${o.out} = ${i.uv} - vec2(0.5);\nfloat ${o.dist} = length(${o.out});`,
  },
  Fresnel2D: {
    category: 'Effect',
    label: 'Fresnel / Rim 2D',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'power', label: 'Power', type: 'float' },
      { id: 'intensity', label: 'Intensity', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Mask', type: 'float' }],
    emitGlsl: (i, o) =>
      `float ${o.out}_dist = length(${i.uv} - vec2(0.5)) * 2.0;\nfloat ${o.out} = clamp(pow(clamp(${o.out}_dist, 0.0, 1.0), ${i.power}) * ${i.intensity}, 0.0, 1.0);`,
  },
  Outline2D: {
    category: 'Effect',
    label: 'Alpha Outline',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'thickness', label: 'Thick', type: 'float' },
      { id: 'outlineColor', label: 'Outline', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_px = ${i.thickness} / love_ScreenSize.xy;\nfloat ${o.out}_a = max(max(Texel(tex, ${i.uv} + vec2(${o.out}_px.x, 0.0)).a, Texel(tex, ${i.uv} - vec2(${o.out}_px.x, 0.0)).a), max(Texel(tex, ${i.uv} + vec2(0.0, ${o.out}_px.y)).a, Texel(tex, ${i.uv} - vec2(0.0, ${o.out}_px.y)).a));\nvec4 ${o.out} = mix(vec4(${i.outlineColor}.rgb, ${o.out}_a * ${i.outlineColor}.a), ${i.color}, ${i.color}.a);`,
  },
  WaveDistort: {
    category: 'Effect',
    label: 'Wave Distort',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'time', label: 'Time', type: 'float' },
      { id: 'amp', label: 'Amp', type: 'float' },
      { id: 'freq', label: 'Freq', type: 'float' },
      { id: 'speed', label: 'Speed', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'UV', type: 'vec2' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out} = ${i.uv} + vec2(sin((${i.uv}.y + ${i.time} * ${i.speed}) * ${i.freq}) * ${i.amp}, cos((${i.uv}.x + ${i.time} * ${i.speed}) * ${i.freq}) * ${i.amp} * 0.35);`,
  },
  Dissolve2D: {
    category: 'Effect',
    label: 'Dissolve',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'threshold', label: 'Cut', type: 'float' },
      { id: 'softness', label: 'Soft', type: 'float' },
      { id: 'edgeColor', label: 'Edge', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    helperKey: 'noise',
    emitGlsl: (i, o) =>
      `float ${o.out}_noise = feather_hash(${i.uv} * 96.0);\nfloat ${o.out}_alpha = smoothstep(${i.threshold}, ${i.threshold} + max(${i.softness}, 0.0001), ${o.out}_noise);\nfloat ${o.out}_edge = smoothstep(${i.threshold}, ${i.threshold} + 0.035, ${o.out}_noise) - smoothstep(${i.threshold} + 0.035, ${i.threshold} + 0.09, ${o.out}_noise);\nvec4 ${o.out} = vec4(mix(${i.color}.rgb, ${i.edgeColor}.rgb, clamp(${o.out}_edge, 0.0, 1.0)), ${i.color}.a * ${o.out}_alpha);`,
  },
  HitFlash: {
    category: 'Effect',
    label: 'Hit Flash',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'flashColor', label: 'Flash', type: 'vec4' },
      { id: 'amount', label: 'Amount', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec4 ${o.out} = vec4(mix(${i.color}.rgb, ${i.flashColor}.rgb, clamp(${i.amount}, 0.0, 1.0)), ${i.color}.a);`,
  },
  Vignette: {
    category: 'Effect',
    label: 'Vignette',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'strength', label: 'Power', type: 'float' },
      { id: 'softness', label: 'Soft', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `float ${o.out}_d = length(${i.uv} - vec2(0.5));\nfloat ${o.out}_v = 1.0 - smoothstep(max(0.0, ${i.softness}), 0.707, ${o.out}_d) * ${i.strength};\nvec4 ${o.out} = vec4(${i.color}.rgb * clamp(${o.out}_v, 0.0, 1.0), ${i.color}.a);`,
  },
  Pixelate: {
    category: 'Effect',
    label: 'Pixelate',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'amount', label: 'Amount', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'UV', type: 'vec2' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_cells = max(vec2(1.0), love_ScreenSize.xy / max(${i.amount}, 1.0));\nvec2 ${o.out} = floor(${i.uv} * ${o.out}_cells) / ${o.out}_cells;`,
  },
  ChromaticAberration: {
    category: 'Effect',
    label: 'Chromatic Aberration',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'amount', label: 'Amount', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_dir = normalize(${i.uv} - vec2(0.5));\nvec2 ${o.out}_off = ${o.out}_dir * ${i.amount};\nvec4 ${o.out}_base = Texel(tex, ${i.uv});\nvec4 ${o.out} = vec4(Texel(tex, ${i.uv} + ${o.out}_off).r, ${o.out}_base.g, Texel(tex, ${i.uv} - ${o.out}_off).b, ${o.out}_base.a);`,
  },

  // ─── Output ──────────────────────────────────────────────────────────────────
  FragmentOutput: {
    category: 'Output',
    label: 'Fragment Output',
    inputs: [{ id: 'color', label: 'Color', type: 'vec4' }],
    outputs: [],
    emitGlsl: () => '',
  },

  // ─── Vector (destructure / construct) ───────────────────────────────────────
  Combine2: {
    category: 'Vector',
    label: 'Combine2',
    inputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'XY', type: 'vec2' }],
    emitGlsl: (i, o) => `vec2 ${o.out} = vec2(${i.x}, ${i.y});`,
  },
  Combine3: {
    category: 'Vector',
    label: 'Combine3',
    inputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' },
      { id: 'z', label: 'Z', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'XYZ', type: 'vec3' }],
    emitGlsl: (i, o) => `vec3 ${o.out} = vec3(${i.x}, ${i.y}, ${i.z});`,
  },
  SplitVec2: {
    category: 'Vector',
    label: 'Split Vec2',
    inputs: [{ id: 'vec', label: 'XY', type: 'vec2' }],
    outputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' },
    ],
    emitGlsl: (i, o) => `float ${o.x} = ${i.vec}.x;\nfloat ${o.y} = ${i.vec}.y;`,
  },
  SplitVec3: {
    category: 'Vector',
    label: 'Split Vec3',
    inputs: [{ id: 'vec', label: 'XYZ', type: 'vec3' }],
    outputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' },
      { id: 'z', label: 'Z', type: 'float' },
    ],
    emitGlsl: (i, o) => `float ${o.x} = ${i.vec}.x;\nfloat ${o.y} = ${i.vec}.y;\nfloat ${o.z} = ${i.vec}.z;`,
  },

  // ─── Vertex ──────────────────────────────────────────────────────────────────
  MatVecMul: {
    category: 'Vertex',
    label: 'Mat × Vec',
    inputs: [
      { id: 'mat', label: 'Mat', type: 'mat4' },
      { id: 'vec', label: 'Vec', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = ${i.mat} * ${i.vec};`,
  },
  VertexPosition: {
    category: 'Vertex',
    label: 'Vertex Position',
    inputs: [],
    outputs: [{ id: 'out', label: 'Pos', type: 'vec4' }],
    emitGlsl: (_, o) => `vec4 ${o.out} = vertex_position;`,
  },
  TransformMatrix: {
    category: 'Vertex',
    label: 'Transform Matrix',
    inputs: [],
    outputs: [{ id: 'out', label: 'Mat', type: 'mat4' }],
    emitGlsl: (_, o) => `mat4 ${o.out} = transform_projection;`,
  },
  VertexOutput: {
    category: 'Vertex',
    label: 'Vertex Output',
    inputs: [{ id: 'pos', label: 'Pos', type: 'vec4' }],
    outputs: [],
    emitGlsl: () => '',
  },
};

export const CATEGORY_COLORS: Record<string, string> = {
  Input: 'border-l-blue-500',
  Math: 'border-l-orange-500',
  Vector: 'border-l-purple-500',
  Color: 'border-l-pink-500',
  Noise: 'border-l-green-500',
  Effect: 'border-l-cyan-500',
  Output: 'border-l-red-500',
  Vertex: 'border-l-yellow-500',
};

export const CATEGORY_ORDER: Array<{ category: string; nodes: NodeType[] }> = [
  {
    category: 'Input',
    nodes: [
      'TextureColor',
      'TextureCoords',
      'ScreenCoords',
      'VertexColor',
      'Time',
      'Resolution',
      'FloatConstant',
      'Vec2Constant',
      'Vec3Constant',
      'Vec4Constant',
    ],
  },
  {
    category: 'Math',
    nodes: [
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
    ],
  },
  {
    category: 'Vector',
    nodes: ['Combine2', 'Combine3', 'Combine4', 'Split4', 'SplitVec2', 'SplitVec3', 'Normalize', 'Length', 'Dot'],
  },
  { category: 'Color', nodes: ['Desaturate', 'OneMinus', 'HueShift'] },
  { category: 'Noise', nodes: ['SimpleNoise', 'Ripple'] },
  {
    category: 'Effect',
    nodes: [
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
    ],
  },
  { category: 'Output', nodes: ['FragmentOutput'] },
  { category: 'Vertex', nodes: ['VertexPosition', 'TransformMatrix', 'MatVecMul', 'VertexOutput'] },
];
