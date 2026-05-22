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

function halftoneChannel(base: string, uv: string, offset: string, scale: string, mode: string, out: string, prefix: string): string[] {
  return [
    `vec2 ${prefix}_offset = ${offset} / max(${scale}, 0.0001);`,
    `vec2 ${prefix}_dir = ${prefix}_offset / max(dot(${prefix}_offset, ${prefix}_offset), 0.000001);`,
    `vec2 ${prefix}_pos = mod(abs(vec2(dot(${uv}, ${prefix}_dir), -${uv}.x * ${prefix}_dir.y + ${uv}.y * ${prefix}_dir.x)) + vec2(0.5), vec2(1.0)) - vec2(0.5);`,
    `float ${prefix}_base = clamp(${base}, 0.0, 1.0);`,
    `float ${prefix}_circle_raw = 0.78 * dot(${prefix}_pos, ${prefix}_pos) / max(0.25 * (1.0 - ${prefix}_base), 0.0001);`,
    `float ${prefix}_circle = 1.0 - clamp((1.0 - ${prefix}_circle_raw) / max(fwidth(${prefix}_circle_raw), 0.0001), 0.0, 1.0);`,
    `vec2 ${prefix}_pos2 = mod(${prefix}_pos + vec2(1.0), vec2(1.0)) - vec2(0.5);`,
    `float ${prefix}_p1 = dot(${prefix}_pos, ${prefix}_pos);`,
    `float ${prefix}_p2 = dot(${prefix}_pos2, ${prefix}_pos2);`,
    `float ${prefix}_t = ${prefix}_p1 / max(${prefix}_p1 + ${prefix}_p2, 0.0001);`,
    `float ${prefix}_smooth_raw = (1.0 - ${prefix}_t) * (${prefix}_p1 - 0.25 * (1.0 - ${prefix}_base)) - ${prefix}_t * (${prefix}_p2 - 0.25 * ${prefix}_base);`,
    `float ${prefix}_smooth = 1.0 - clamp((-${prefix}_smooth_raw) / max(fwidth(${prefix}_smooth_raw), 0.0001), 0.0, 1.0);`,
    `float ${prefix}_radius = 0.5 * sqrt(max(1.0 - ${prefix}_base, 0.0));`,
    `float ${prefix}_square_raw = max(abs(${prefix}_pos.x), abs(${prefix}_pos.y)) / max(${prefix}_radius, 0.0001);`,
    `float ${prefix}_square = 1.0 - clamp((1.0 - ${prefix}_square_raw) / max(fwidth(${prefix}_square_raw), 0.0001), 0.0, 1.0);`,
    `float ${prefix}_mode = clamp(floor(${mode} + 0.5), 0.0, 2.0);`,
    `float ${out} = ${prefix}_circle * (1.0 - step(0.5, abs(${prefix}_mode - 0.0))) + ${prefix}_smooth * (1.0 - step(0.5, abs(${prefix}_mode - 1.0))) + ${prefix}_square * (1.0 - step(0.5, abs(${prefix}_mode - 2.0)));`,
  ];
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
  Min: {
    category: 'Math',
    label: 'Min',
    inputs: [{ id: 'a', label: 'A', type: 'float' }, { id: 'b', label: 'B', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = min(${i.a}, ${i.b});`,
  },
  Max: {
    category: 'Math',
    label: 'Max',
    inputs: [{ id: 'a', label: 'A', type: 'float' }, { id: 'b', label: 'B', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = max(${i.a}, ${i.b});`,
  },
  Modulo: {
    category: 'Math',
    label: 'Modulo',
    inputs: [{ id: 'a', label: 'A', type: 'float' }, { id: 'b', label: 'B', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = mod(${i.a}, max(abs(${i.b}), 0.0001));`,
  },
  Negate: {
    category: 'Math',
    label: 'Negate',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = -${i.in0};`,
  },
  Saturate: {
    category: 'Math',
    label: 'Saturate',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = clamp(${i.in0}, 0.0, 1.0);`,
  },
  Remap: {
    category: 'Math',
    label: 'Remap',
    inputs: [
      { id: 'value', label: 'Value', type: 'float' },
      { id: 'inMin', label: 'In Min', type: 'float' },
      { id: 'inMax', label: 'In Max', type: 'float' },
      { id: 'outMin', label: 'Out Min', type: 'float' },
      { id: 'outMax', label: 'Out Max', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) =>
      `float ${o.out}_t = (${i.value} - ${i.inMin}) / max(${i.inMax} - ${i.inMin}, 0.0001);\nfloat ${o.out} = mix(${i.outMin}, ${i.outMax}, ${o.out}_t);`,
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
  SplitRGB: {
    category: 'Vector',
    label: 'Split RGB',
    inputs: [{ id: 'vec', label: 'RGB', type: 'vec3' }],
    outputs: [
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    emitGlsl: (i, o) => `float ${o.r} = ${i.vec}.r;\nfloat ${o.g} = ${i.vec}.g;\nfloat ${o.b} = ${i.vec}.b;`,
  },
  CombineRGB: {
    category: 'Vector',
    label: 'Combine RGB',
    inputs: [
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGB', type: 'vec3' }],
    emitGlsl: (i, o) => `vec3 ${o.out} = vec3(${i.r}, ${i.g}, ${i.b});`,
  },
  SwizzleVec2: {
    category: 'Vector',
    label: 'Swizzle Vec2',
    inputs: [{ id: 'vec', label: 'XY', type: 'vec2' }],
    outputs: [
      { id: 'xy', label: 'XY', type: 'vec2' },
      { id: 'yx', label: 'YX', type: 'vec2' },
    ],
    emitGlsl: (i, o) => `vec2 ${o.xy} = ${i.vec}.xy;\nvec2 ${o.yx} = ${i.vec}.yx;`,
  },
  DistanceVec2: {
    category: 'Vector',
    label: 'Distance Vec2',
    inputs: [{ id: 'a', label: 'A', type: 'vec2' }, { id: 'b', label: 'B', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'Dist', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = distance(${i.a}, ${i.b});`,
  },
  LengthVec2: {
    category: 'Vector',
    label: 'Length Vec2',
    inputs: [{ id: 'vec', label: 'XY', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'Len', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = length(${i.vec});`,
  },
  NormalizeVec2: {
    category: 'Vector',
    label: 'Normalize Vec2',
    inputs: [{ id: 'vec', label: 'XY', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'XY', type: 'vec2' }],
    emitGlsl: (i, o) => `vec2 ${o.out} = normalize(${i.vec});`,
  },
  DotVec2: {
    category: 'Vector',
    label: 'Dot Vec2',
    inputs: [{ id: 'a', label: 'A', type: 'vec2' }, { id: 'b', label: 'B', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'Dot', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = dot(${i.a}, ${i.b});`,
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
  InvertColor: {
    category: 'Color',
    label: 'Invert Color',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'amount', label: 'Amount', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec4 ${o.out} = vec4(mix(${i.color}.rgb, 1.0 - ${i.color}.rgb, clamp(${i.amount}, 0.0, 1.0)), ${i.color}.a);`,
  },
  Contrast: {
    category: 'Color',
    label: 'Contrast',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'amount', label: 'Amount', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec4 ${o.out} = vec4((${i.color}.rgb - vec3(0.5)) * ${i.amount} + vec3(0.5), ${i.color}.a);`,
  },
  PosterizeColor: {
    category: 'Color',
    label: 'Posterize',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'steps', label: 'Steps', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `float ${o.out}_steps = max(1.0, ${i.steps});\nvec4 ${o.out} = vec4(floor(${i.color}.rgb * ${o.out}_steps) / ${o.out}_steps, ${i.color}.a);`,
  },
  MultiplyColor: {
    category: 'Color',
    label: 'Multiply Color',
    inputs: [{ id: 'a', label: 'A', type: 'vec4' }, { id: 'b', label: 'B', type: 'vec4' }],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = ${i.a} * ${i.b};`,
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
  VoronoiCells: {
    category: 'Noise',
    label: 'Voronoi Cells',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'scale', label: 'Scale', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Cells', type: 'float' }],
    helperKey: 'noise',
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_p = ${i.uv} * max(${i.scale}, 0.0001);\nvec2 ${o.out}_cell = floor(${o.out}_p);\nvec2 ${o.out}_local = fract(${o.out}_p);\nfloat ${o.out} = 1.0;\nfor (int ${o.out}_y = -1; ${o.out}_y <= 1; ${o.out}_y++) { for (int ${o.out}_x = -1; ${o.out}_x <= 1; ${o.out}_x++) { vec2 ${o.out}_neighbor = vec2(float(${o.out}_x), float(${o.out}_y)); vec2 ${o.out}_point = ${o.out}_neighbor + vec2(feather_hash(${o.out}_cell + ${o.out}_neighbor), feather_hash(${o.out}_cell + ${o.out}_neighbor + vec2(5.2, 1.3))); ${o.out} = min(${o.out}, length(${o.out}_point - ${o.out}_local)); } }`,
  },
  Checkerboard: {
    category: 'Noise',
    label: 'Checkerboard',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'scale', label: 'Scale', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Mask', type: 'float' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_cell = floor(${i.uv} * max(${i.scale}, 1.0));\nfloat ${o.out} = mod(${o.out}_cell.x + ${o.out}_cell.y, 2.0);`,
  },

  // ─── UV ─────────────────────────────────────────────────────────────────────
  TilingOffset: {
    category: 'UV',
    label: 'Tiling And Offset',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'tiling', label: 'Tiling', type: 'vec2' },
      { id: 'offset', label: 'Offset', type: 'vec2' },
    ],
    outputs: [{ id: 'out', label: 'UV', type: 'vec2' }],
    emitGlsl: (i, o) => `vec2 ${o.out} = ${i.uv} * ${i.tiling} + ${i.offset};`,
  },
  RotateUV: {
    category: 'UV',
    label: 'Rotate UV',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'angle', label: 'Angle', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'UV', type: 'vec2' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_p = ${i.uv} - vec2(0.5);\nfloat ${o.out}_s = sin(${i.angle});\nfloat ${o.out}_c = cos(${i.angle});\nvec2 ${o.out} = vec2(${o.out}_p.x * ${o.out}_c - ${o.out}_p.y * ${o.out}_s, ${o.out}_p.x * ${o.out}_s + ${o.out}_p.y * ${o.out}_c) + vec2(0.5);`,
  },
  TwirlUV: {
    category: 'UV',
    label: 'Twirl UV',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'strength', label: 'Strength', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'UV', type: 'vec2' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_p = ${i.uv} - vec2(0.5);\nfloat ${o.out}_d = length(${o.out}_p);\nfloat ${o.out}_a = atan(${o.out}_p.y, ${o.out}_p.x) + ${i.strength} * (1.0 - clamp(${o.out}_d * 2.0, 0.0, 1.0));\nvec2 ${o.out} = vec2(cos(${o.out}_a), sin(${o.out}_a)) * ${o.out}_d + vec2(0.5);`,
  },
  PolarCoordinates: {
    category: 'UV',
    label: 'Polar Coordinates',
    inputs: [{ id: 'uv', label: 'UV', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'Polar', type: 'vec2' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_p = ${i.uv} - vec2(0.5);\nvec2 ${o.out} = vec2(length(${o.out}_p) * 2.0, atan(${o.out}_p.y, ${o.out}_p.x) / 6.2831853 + 0.5);`,
  },

  // ─── Effects ────────────────────────────────────────────────────────────────
  SampleTexture: {
    category: 'Effect',
    label: 'Sample Texture',
    inputs: [{ id: 'uv', label: 'UV', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = Texel(tex, ${i.uv});`,
  },
  TextureStrength: {
    category: 'Effect',
    label: 'Texture Strength',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'power', label: 'Power', type: 'float' },
      { id: 'strength', label: 'Strength', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `float ${o.out}_mask = pow(clamp(${i.color}.a, 0.0, 1.0), max(${i.power}, 0.0001));\nvec4 ${o.out} = vec4(${i.color}.rgb * ${i.strength}, clamp(${i.color}.a * ${o.out}_mask, 0.0, 1.0));`,
  },
  Opacity2D: {
    category: 'Effect',
    label: 'Opacity',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'opacity', label: 'Opacity', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = vec4(${i.color}.rgb, ${i.color}.a * clamp(${i.opacity}, 0.0, 1.0));`,
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
    label: 'Sprite Outline',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'thickness', label: 'Thick', type: 'float' },
      { id: 'outlineColor', label: 'Outline', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_uv_step = max(fwidth(${i.uv}), vec2(0.000001)) * max(${i.thickness}, 0.0);\nfloat ${o.out}_source_alpha = clamp(${i.color}.a, 0.0, 1.0);\nfloat ${o.out}_neighbor_alpha = 0.0;\n${o.out}_neighbor_alpha = max(${o.out}_neighbor_alpha, Texel(tex, ${i.uv} + vec2(${o.out}_uv_step.x, 0.0)).a);\n${o.out}_neighbor_alpha = max(${o.out}_neighbor_alpha, Texel(tex, ${i.uv} - vec2(${o.out}_uv_step.x, 0.0)).a);\n${o.out}_neighbor_alpha = max(${o.out}_neighbor_alpha, Texel(tex, ${i.uv} + vec2(0.0, ${o.out}_uv_step.y)).a);\n${o.out}_neighbor_alpha = max(${o.out}_neighbor_alpha, Texel(tex, ${i.uv} - vec2(0.0, ${o.out}_uv_step.y)).a);\n${o.out}_neighbor_alpha = max(${o.out}_neighbor_alpha, Texel(tex, ${i.uv} + ${o.out}_uv_step).a);\n${o.out}_neighbor_alpha = max(${o.out}_neighbor_alpha, Texel(tex, ${i.uv} - ${o.out}_uv_step).a);\n${o.out}_neighbor_alpha = max(${o.out}_neighbor_alpha, Texel(tex, ${i.uv} + vec2(${o.out}_uv_step.x, -${o.out}_uv_step.y)).a);\n${o.out}_neighbor_alpha = max(${o.out}_neighbor_alpha, Texel(tex, ${i.uv} + vec2(-${o.out}_uv_step.x, ${o.out}_uv_step.y)).a);\nfloat ${o.out}_outline_alpha = ${i.outlineColor}.a * smoothstep(0.001, 0.5, ${o.out}_neighbor_alpha);\nfloat ${o.out}_alpha = ${o.out}_source_alpha + ${o.out}_outline_alpha * (1.0 - ${o.out}_source_alpha);\nfloat ${o.out}_source_coverage = smoothstep(0.18, 0.92, ${o.out}_source_alpha);\nvec3 ${o.out}_rgb = mix(${i.outlineColor}.rgb, ${i.color}.rgb, ${o.out}_source_coverage);\nvec4 ${o.out} = vec4(${o.out}_rgb, ${o.out}_alpha);`,
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
  WaterDisplace: {
    category: 'Effect',
    label: 'Water Displace',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'time', label: 'Time', type: 'float' },
      { id: 'speed', label: 'Speed', type: 'float' },
      { id: 'amp', label: 'Amp', type: 'float' },
      { id: 'scale', label: 'Scale', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'UV', type: 'vec2' }],
    helperKey: 'noise',
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_p = ${i.uv} * max(${i.scale}, 0.0001) + vec2(${i.time} * ${i.speed}, ${i.time} * ${i.speed} * 0.73);\nvec2 ${o.out}_cell = floor(${o.out}_p);\nvec2 ${o.out}_f = smoothstep(vec2(0.0), vec2(1.0), fract(${o.out}_p));\nfloat ${o.out}_a = mix(mix(feather_hash(${o.out}_cell), feather_hash(${o.out}_cell + vec2(1.0, 0.0)), ${o.out}_f.x), mix(feather_hash(${o.out}_cell + vec2(0.0, 1.0)), feather_hash(${o.out}_cell + vec2(1.0, 1.0)), ${o.out}_f.x), ${o.out}_f.y);\nfloat ${o.out}_b = mix(mix(feather_hash(${o.out}_cell + vec2(9.2, 3.4)), feather_hash(${o.out}_cell + vec2(10.2, 3.4)), ${o.out}_f.x), mix(feather_hash(${o.out}_cell + vec2(9.2, 4.4)), feather_hash(${o.out}_cell + vec2(10.2, 4.4)), ${o.out}_f.x), ${o.out}_f.y);\nvec2 ${o.out} = ${i.uv} + (vec2(${o.out}_a, ${o.out}_b) * 2.0 - 1.0) * ${i.amp};`,
  },
  MaskedWaterDisplace: {
    category: 'Effect',
    label: 'Masked Water',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'time', label: 'Time', type: 'float' },
      { id: 'speed', label: 'Speed', type: 'float' },
      { id: 'amp', label: 'Amp', type: 'float' },
      { id: 'scale', label: 'Scale', type: 'float' },
      { id: 'maskThreshold', label: 'Mask', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    helperKey: 'noise',
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_p = ${i.uv} * max(${i.scale}, 0.0001) + vec2(${i.time} * ${i.speed}, ${i.time} * ${i.speed} * 0.73);\nvec2 ${o.out}_cell = floor(${o.out}_p);\nvec2 ${o.out}_f = smoothstep(vec2(0.0), vec2(1.0), fract(${o.out}_p));\nfloat ${o.out}_a = mix(mix(feather_hash(${o.out}_cell), feather_hash(${o.out}_cell + vec2(1.0, 0.0)), ${o.out}_f.x), mix(feather_hash(${o.out}_cell + vec2(0.0, 1.0)), feather_hash(${o.out}_cell + vec2(1.0, 1.0)), ${o.out}_f.x), ${o.out}_f.y);\nfloat ${o.out}_b = mix(mix(feather_hash(${o.out}_cell + vec2(9.2, 3.4)), feather_hash(${o.out}_cell + vec2(10.2, 3.4)), ${o.out}_f.x), mix(feather_hash(${o.out}_cell + vec2(9.2, 4.4)), feather_hash(${o.out}_cell + vec2(10.2, 4.4)), ${o.out}_f.x), ${o.out}_f.y);\nvec2 ${o.out}_uv = ${i.uv} + (vec2(${o.out}_a, ${o.out}_b) * 2.0 - 1.0) * ${i.amp};\nvec4 ${o.out}_source = Texel(tex, ${o.out}_uv);\nfloat ${o.out}_mask = step(${i.maskThreshold}, min(${i.color}.a, ${o.out}_source.a));\nvec4 ${o.out} = mix(${i.color}, ${o.out}_source, ${o.out}_mask);`,
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
      { id: 'offset', label: 'Offset', type: 'vec2' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_center = vec2(0.5) + ${i.offset};\nvec2 ${o.out}_delta = ${i.uv} - ${o.out}_center;\nvec2 ${o.out}_dir = length(${o.out}_delta) > 0.0001 ? normalize(${o.out}_delta) : vec2(0.0);\nvec2 ${o.out}_off = ${o.out}_dir * ${i.amount};\nvec4 ${o.out}_base = Texel(tex, ${i.uv});\nvec4 ${o.out} = vec4(Texel(tex, ${i.uv} + ${o.out}_off).r, ${o.out}_base.g, Texel(tex, ${i.uv} - ${o.out}_off).b, ${o.out}_base.a);`,
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
  VertexWave2D: {
    category: 'Vertex',
    label: 'Vertex Wave 2D',
    inputs: [
      { id: 'pos', label: 'Pos', type: 'vec4' },
      { id: 'time', label: 'Time', type: 'float' },
      { id: 'amp', label: 'Amp', type: 'float' },
      { id: 'freq', label: 'Freq', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Pos', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec4 ${o.out} = ${i.pos};\n${o.out}.xy += vec2(sin((${i.pos}.y + ${i.time} * 60.0) * ${i.freq}), cos((${i.pos}.x + ${i.time} * 60.0) * ${i.freq})) * ${i.amp};`,
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

  // ─── Math (extended) ─────────────────────────────────────────────────────────
  Sqrt: {
    category: 'Math',
    label: 'Sqrt',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('sqrt'),
  },
  Ceil: {
    category: 'Math',
    label: 'Ceil',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('ceil'),
  },
  Round: {
    category: 'Math',
    label: 'Round',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('round'),
  },
  Sign: {
    category: 'Math',
    label: 'Sign',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('sign'),
  },
  Tan: {
    category: 'Math',
    label: 'Tan',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('tan'),
  },
  Log: {
    category: 'Math',
    label: 'Log',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = log(max(${i.in0}, 0.0001));`,
  },
  Exp: {
    category: 'Math',
    label: 'Exp',
    inputs: [{ id: 'in0', label: 'X', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    emitGlsl: unary('exp'),
  },
  Atan2: {
    category: 'Math',
    label: 'Atan2',
    inputs: [
      { id: 'y', label: 'Y', type: 'float' },
      { id: 'x', label: 'X', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Angle', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = atan(${i.y}, ${i.x});`,
  },

  // ─── Vector (extended) ───────────────────────────────────────────────────────
  CrossVec3: {
    category: 'Vector',
    label: 'Cross Vec3',
    inputs: [
      { id: 'a', label: 'A', type: 'vec3' },
      { id: 'b', label: 'B', type: 'vec3' },
    ],
    outputs: [{ id: 'out', label: 'XYZ', type: 'vec3' }],
    emitGlsl: (i, o) => `vec3 ${o.out} = cross(${i.a}, ${i.b});`,
  },
  LerpVec4: {
    category: 'Vector',
    label: 'Lerp Vec4',
    inputs: [
      { id: 'a', label: 'A', type: 'vec4' },
      { id: 'b', label: 'B', type: 'vec4' },
      { id: 't', label: 'T', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = mix(${i.a}, ${i.b}, clamp(${i.t}, 0.0, 1.0));`,
  },
  ScaleVec2: {
    category: 'Vector',
    label: 'Scale Vec2',
    inputs: [
      { id: 'vec', label: 'XY', type: 'vec2' },
      { id: 'scale', label: 'Scale', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'XY', type: 'vec2' }],
    emitGlsl: (i, o) => `vec2 ${o.out} = ${i.vec} * ${i.scale};`,
  },
  ScaleVec4: {
    category: 'Vector',
    label: 'Scale Vec4',
    inputs: [
      { id: 'vec', label: 'RGBA', type: 'vec4' },
      { id: 'scale', label: 'Scale', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = ${i.vec} * ${i.scale};`,
  },

  // ─── Color (extended) ────────────────────────────────────────────────────────
  BlendAdd: {
    category: 'Color',
    label: 'Blend Add',
    inputs: [
      { id: 'a', label: 'A', type: 'vec4' },
      { id: 'b', label: 'B', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = vec4(clamp(${i.a}.rgb + ${i.b}.rgb, 0.0, 1.0), clamp(${i.a}.a + ${i.b}.a, 0.0, 1.0));`,
  },
  BlendScreen: {
    category: 'Color',
    label: 'Blend Screen',
    inputs: [
      { id: 'a', label: 'A', type: 'vec4' },
      { id: 'b', label: 'B', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = vec4(1.0 - (1.0 - ${i.a}.rgb) * (1.0 - ${i.b}.rgb), max(${i.a}.a, ${i.b}.a));`,
  },
  BlendOverlay: {
    category: 'Color',
    label: 'Blend Overlay',
    inputs: [
      { id: 'a', label: 'A', type: 'vec4' },
      { id: 'b', label: 'B', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) =>
      `vec3 ${o.out}_dark = 2.0 * ${i.a}.rgb * ${i.b}.rgb;\nvec3 ${o.out}_light = 1.0 - 2.0 * (1.0 - ${i.a}.rgb) * (1.0 - ${i.b}.rgb);\nvec4 ${o.out} = vec4(mix(${o.out}_dark, ${o.out}_light, step(vec3(0.5), ${i.a}.rgb)), max(${i.a}.a, ${i.b}.a));`,
  },
  CompositeAlpha: {
    category: 'Composite',
    label: 'Composite',
    inputs: [
      { id: 'a', label: 'A', type: 'vec4', defaultValue: [1, 1, 1, 1], min: 0, max: 1, step: 0.01 },
      { id: 'b', label: 'B', type: 'vec4', defaultValue: [0, 0, 0, 0], min: 0, max: 1, step: 0.01 },
      { id: 'mode', label: 'Mode', type: 'float', defaultValue: 0, min: 0, max: 4, step: 1 },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => {
      const safe = (alpha: string) => `max(${alpha}, 0.0001)`;
      return [
        `vec4 ${o.out}_a = vec4(${i.a}.rgb, clamp(${i.a}.a, 0.0, 1.0));`,
        `vec4 ${o.out}_b = vec4(${i.b}.rgb, clamp(${i.b}.a, 0.0, 1.0));`,
        `float ${o.out}_mode = clamp(floor(${i.mode} + 0.5), 0.0, 4.0);`,
        `float ${o.out}_over_alpha = ${o.out}_a.a + ${o.out}_b.a * (1.0 - ${o.out}_a.a);`,
        `vec4 ${o.out}_over = vec4((${o.out}_a.rgb * ${o.out}_a.a + ${o.out}_b.rgb * ${o.out}_b.a * (1.0 - ${o.out}_a.a)) / ${safe(`${o.out}_over_alpha`)}, ${o.out}_over_alpha);`,
        `float ${o.out}_in_alpha = ${o.out}_a.a * ${o.out}_b.a;`,
        `vec4 ${o.out}_in = vec4((${o.out}_a.rgb * ${o.out}_a.a * ${o.out}_b.a) / ${safe(`${o.out}_in_alpha`)}, ${o.out}_in_alpha);`,
        `float ${o.out}_out_alpha = ${o.out}_a.a * (1.0 - ${o.out}_b.a);`,
        `vec4 ${o.out}_out = vec4((${o.out}_a.rgb * ${o.out}_a.a * (1.0 - ${o.out}_b.a)) / ${safe(`${o.out}_out_alpha`)}, ${o.out}_out_alpha);`,
        `float ${o.out}_atop_alpha = ${o.out}_b.a;`,
        `vec4 ${o.out}_atop = vec4((${o.out}_a.rgb * ${o.out}_a.a * ${o.out}_b.a + ${o.out}_b.rgb * ${o.out}_b.a * (1.0 - ${o.out}_a.a)) / ${safe(`${o.out}_atop_alpha`)}, ${o.out}_atop_alpha);`,
        `float ${o.out}_xor_alpha = ${o.out}_a.a + ${o.out}_b.a - 2.0 * ${o.out}_a.a * ${o.out}_b.a;`,
        `vec4 ${o.out}_xor = vec4((${o.out}_a.rgb * ${o.out}_a.a * (1.0 - ${o.out}_b.a) + ${o.out}_b.rgb * ${o.out}_b.a * (1.0 - ${o.out}_a.a)) / ${safe(`${o.out}_xor_alpha`)}, ${o.out}_xor_alpha);`,
        `float ${o.out}_is_over = 1.0 - step(0.5, abs(${o.out}_mode - 0.0));`,
        `float ${o.out}_is_in = 1.0 - step(0.5, abs(${o.out}_mode - 1.0));`,
        `float ${o.out}_is_out = 1.0 - step(0.5, abs(${o.out}_mode - 2.0));`,
        `float ${o.out}_is_atop = 1.0 - step(0.5, abs(${o.out}_mode - 3.0));`,
        `float ${o.out}_is_xor = 1.0 - step(0.5, abs(${o.out}_mode - 4.0));`,
        `vec4 ${o.out} = ${o.out}_over * ${o.out}_is_over + ${o.out}_in * ${o.out}_is_in + ${o.out}_out * ${o.out}_is_out + ${o.out}_atop * ${o.out}_is_atop + ${o.out}_xor * ${o.out}_is_xor;`,
      ].join('\n');
    },
  },
  Brightness: {
    category: 'Color',
    label: 'Brightness',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'amount', label: 'Amount', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = vec4(clamp(${i.color}.rgb * max(${i.amount}, 0.0), 0.0, 1.0), ${i.color}.a);`,
  },
  GammaCorrect: {
    category: 'Color',
    label: 'Gamma Correct',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4' },
      { id: 'gamma', label: 'Gamma', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => `vec4 ${o.out} = vec4(pow(clamp(${i.color}.rgb, 0.0001, 1.0), vec3(1.0 / max(${i.gamma}, 0.0001))), ${i.color}.a);`,
  },

  // ─── Lab/LCH color helpers ──────────────────────────────────────────────────
  LabColorConvert: {
    category: 'Color',
    label: 'Lab Convert',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4', defaultValue: [1, 1, 1, 1], min: 0, max: 1, step: 0.01 },
      { id: 'from', label: 'From', type: 'float', defaultValue: 0, min: 0, max: 2, step: 1 },
      { id: 'to', label: 'To', type: 'float', defaultValue: 1, min: 0, max: 2, step: 1 },
    ],
    outputs: [{ id: 'out', label: 'Color', type: 'vec4' }],
    helperKey: 'lab-color',
    emitGlsl: (i, o) => [
      `float ${o.out}_from = clamp(floor(${i.from} + 0.5), 0.0, 2.0);`,
      `float ${o.out}_to = clamp(floor(${i.to} + 0.5), 0.0, 2.0);`,
      `vec3 ${o.out}_lab = ${i.color}.rgb;`,
      `if (${o.out}_from < 0.5) { ${o.out}_lab = feather_rgb_to_lab(${i.color}.rgb); }`,
      `else if (${o.out}_from > 1.5) { ${o.out}_lab = feather_lch_to_lab(${i.color}.rgb); }`,
      `vec3 ${o.out}_converted = ${o.out}_lab;`,
      `if (${o.out}_to < 0.5) { ${o.out}_converted = feather_lab_to_rgb(${o.out}_lab); }`,
      `else if (${o.out}_to > 1.5) { ${o.out}_converted = feather_lab_to_lch(${o.out}_lab); }`,
      `vec4 ${o.out} = vec4(${o.out}_converted, ${i.color}.a);`,
    ].join('\n'),
  },
  LabComplementary: {
    category: 'Color',
    label: 'Lab Complementary',
    inputs: [{ id: 'color', label: 'Color', type: 'vec4', defaultValue: [1, 1, 1, 1], min: 0, max: 1, step: 0.01 }],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    helperKey: 'lab-color',
    emitGlsl: (i, o) => [
      `vec3 ${o.out}_lab = feather_rgb_to_lab(${i.color}.rgb);`,
      `${o.out}_lab.yz = -${o.out}_lab.yz;`,
      `vec4 ${o.out} = vec4(feather_lab_to_rgb(${o.out}_lab), ${i.color}.a);`,
    ].join('\n'),
  },
  LabSplitScheme: {
    category: 'Color',
    label: 'Lab Split Scheme',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4', defaultValue: [1, 1, 1, 1], min: 0, max: 1, step: 0.01 },
      { id: 'angle', label: 'Angle', type: 'float', defaultValue: 120, min: 0, max: 180, step: 1 },
    ],
    outputs: [
      { id: 'plus', label: '+Angle', type: 'vec4' },
      { id: 'minus', label: '-Angle', type: 'vec4' },
    ],
    helperKey: 'lab-color',
    emitGlsl: (i, o) => [
      `vec3 ${o.plus}_lch = feather_lab_to_lch(feather_rgb_to_lab(${i.color}.rgb));`,
      `float ${o.plus}_angle = radians(${i.angle});`,
      `vec3 ${o.plus}_plus_lab = feather_lch_to_lab(vec3(${o.plus}_lch.x, ${o.plus}_lch.y, ${o.plus}_lch.z + ${o.plus}_angle));`,
      `vec3 ${o.plus}_minus_lab = feather_lch_to_lab(vec3(${o.plus}_lch.x, ${o.plus}_lch.y, ${o.plus}_lch.z - ${o.plus}_angle));`,
      `vec4 ${o.plus} = vec4(feather_lab_to_rgb(${o.plus}_plus_lab), ${i.color}.a);`,
      `vec4 ${o.minus} = vec4(feather_lab_to_rgb(${o.plus}_minus_lab), ${i.color}.a);`,
    ].join('\n'),
  },
  LabDualScheme: {
    category: 'Color',
    label: 'Lab Dual Scheme',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4', defaultValue: [1, 1, 1, 1], min: 0, max: 1, step: 0.01 },
      { id: 'angle', label: 'Angle', type: 'float', defaultValue: 90, min: 0, max: 180, step: 1 },
    ],
    outputs: [
      { id: 'plus', label: '+Angle', type: 'vec4' },
      { id: 'opposite', label: 'Opposite', type: 'vec4' },
      { id: 'oppositePlus', label: 'Opposite +Angle', type: 'vec4' },
    ],
    helperKey: 'lab-color',
    emitGlsl: (i, o) => [
      `vec3 ${o.plus}_lch = feather_lab_to_lch(feather_rgb_to_lab(${i.color}.rgb));`,
      `float ${o.plus}_angle = radians(${i.angle});`,
      `vec3 ${o.plus}_plus_lab = feather_lch_to_lab(vec3(${o.plus}_lch.x, ${o.plus}_lch.y, ${o.plus}_lch.z + ${o.plus}_angle));`,
      `vec3 ${o.plus}_opposite_lab = feather_lch_to_lab(vec3(${o.plus}_lch.x, ${o.plus}_lch.y, ${o.plus}_lch.z + 3.14159265359));`,
      `vec3 ${o.plus}_opposite_plus_lab = feather_lch_to_lab(vec3(${o.plus}_lch.x, ${o.plus}_lch.y, ${o.plus}_lch.z + 3.14159265359 + ${o.plus}_angle));`,
      `vec4 ${o.plus} = vec4(feather_lab_to_rgb(${o.plus}_plus_lab), ${i.color}.a);`,
      `vec4 ${o.opposite} = vec4(feather_lab_to_rgb(${o.plus}_opposite_lab), ${i.color}.a);`,
      `vec4 ${o.oppositePlus} = vec4(feather_lab_to_rgb(${o.plus}_opposite_plus_lab), ${i.color}.a);`,
    ].join('\n'),
  },

  // ─── Noise (extended) ────────────────────────────────────────────────────────
  GradientNoise: {
    category: 'Noise',
    label: 'Gradient Noise',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'scale', label: 'Scale', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Noise', type: 'float' }],
    helperKey: 'noise',
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_p = ${i.uv} * max(${i.scale}, 0.0001);\nvec2 ${o.out}_cell = floor(${o.out}_p);\nvec2 ${o.out}_f = smoothstep(vec2(0.0), vec2(1.0), fract(${o.out}_p));\nfloat ${o.out} = mix(mix(feather_hash(${o.out}_cell), feather_hash(${o.out}_cell + vec2(1.0, 0.0)), ${o.out}_f.x), mix(feather_hash(${o.out}_cell + vec2(0.0, 1.0)), feather_hash(${o.out}_cell + vec2(1.0, 1.0)), ${o.out}_f.x), ${o.out}_f.y);`,
  },
  FBMNoise: {
    category: 'Noise',
    label: 'FBM Noise',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'scale', label: 'Scale', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Noise', type: 'float' }],
    helperKey: 'noise',
    emitGlsl: (i, o) => {
      const p = `${o.out}_p`;
      const oct = (n: number, mult: number) =>
        `vec2 ${o.out}_p${n} = ${p} * ${glslFloat(mult)};\nvec2 ${o.out}_c${n} = floor(${o.out}_p${n});\nvec2 ${o.out}_f${n} = smoothstep(vec2(0.0), vec2(1.0), fract(${o.out}_p${n}));\nfloat ${o.out}_n${n} = mix(mix(feather_hash(${o.out}_c${n}), feather_hash(${o.out}_c${n} + vec2(1.0, 0.0)), ${o.out}_f${n}.x), mix(feather_hash(${o.out}_c${n} + vec2(0.0, 1.0)), feather_hash(${o.out}_c${n} + vec2(1.0, 1.0)), ${o.out}_f${n}.x), ${o.out}_f${n}.y);`;
      return [
        `vec2 ${p} = ${i.uv} * max(${i.scale}, 0.0001);`,
        oct(0, 1), oct(1, 2), oct(2, 4), oct(3, 8),
        `float ${o.out} = (${o.out}_n0 * 0.5 + ${o.out}_n1 * 0.25 + ${o.out}_n2 * 0.125 + ${o.out}_n3 * 0.0625) / 0.9375;`,
      ].join('\n');
    },
  },
  TruchetTiles: {
    category: 'Noise',
    label: 'Truchet Tiles',
    inputs: [
      { id: 'position', label: 'Position', type: 'vec2' },
      { id: 'size', label: 'Size', type: 'float', defaultValue: 0.18, min: 0.001, max: 1, step: 0.01 },
      { id: 'number', label: 'Variants', type: 'float', defaultValue: 2, min: 1, max: 16, step: 1 },
      { id: 'seed', label: 'Seed', type: 'float', defaultValue: 1, step: 1 },
      { id: 'mode', label: 'Tile Mode', type: 'float', defaultValue: 0, min: 0, max: 2, step: 1 },
      { id: 'rotate', label: 'Rotate', type: 'float', defaultValue: 1, min: 0, max: 1, step: 1 },
      { id: 'reflect', label: 'Reflect', type: 'float', defaultValue: 1, min: 0, max: 1, step: 1 },
      { id: 'width', label: 'Width', type: 'float', defaultValue: 0.08, min: 0, max: 0.5, step: 0.005 },
      { id: 'time', label: 'Time', type: 'float', defaultValue: 0 },
      { id: 'scroll', label: 'Scroll', type: 'vec2', defaultValue: [0, 0] },
    ],
    outputs: [
      { id: 'uv', label: 'Tile UV', type: 'vec2' },
      { id: 'index', label: 'Index', type: 'float' },
      { id: 'mask', label: 'Mask', type: 'float' },
    ],
    helperKey: 'noise',
    emitGlsl: (i, o) => [
      `float ${o.uv}_mode = clamp(floor(${i.mode} + 0.5), 0.0, 2.0);`,
      `float ${o.uv}_rotate_enabled = step(0.5, ${i.rotate});`,
      `float ${o.uv}_reflect_enabled = step(0.5, ${i.reflect});`,
      `float ${o.uv}_tile_count = max(floor(${i.number}), 1.0);`,
      `vec2 ${o.uv}_position = ${i.position} + ${i.scroll} * ${i.time};`,
      `vec2 ${o.uv} = vec2(0.5);`,
      `float ${o.index} = 0.0;`,
      `if (${o.uv}_mode < 0.5) {`,
      `vec2 ${o.uv}_square_grid = ${o.uv}_position / max(${i.size}, 0.0001);`,
      `vec2 ${o.uv}_square_cell = floor(${o.uv}_square_grid);`,
      `vec2 ${o.uv}_square_local = ${o.uv}_square_grid - ${o.uv}_square_cell - vec2(0.5);`,
      `float ${o.uv}_square_rand = feather_hash(${o.uv}_square_cell + vec2(${i.seed}));`,
      `float ${o.uv}_square_rotation_count = mix(1.0, 4.0, ${o.uv}_rotate_enabled);`,
      `float ${o.uv}_square_reflection_count = mix(1.0, 2.0, ${o.uv}_reflect_enabled);`,
      `float ${o.uv}_square_choice = floor(${o.uv}_square_rand * ${o.uv}_tile_count * ${o.uv}_square_rotation_count * ${o.uv}_square_reflection_count);`,
      `${o.index} = mod(${o.uv}_square_choice, ${o.uv}_tile_count);`,
      `${o.uv}_square_choice = floor(${o.uv}_square_choice / ${o.uv}_tile_count);`,
      `float ${o.uv}_square_rot = mod(${o.uv}_square_choice, ${o.uv}_square_rotation_count);`,
      `${o.uv}_square_choice = floor(${o.uv}_square_choice / ${o.uv}_square_rotation_count);`,
      `float ${o.uv}_square_refl = mod(${o.uv}_square_choice, ${o.uv}_square_reflection_count);`,
      `${o.uv}_square_local.x *= 1.0 - 2.0 * ${o.uv}_square_refl;`,
      `float ${o.uv}_square_angle = ${o.uv}_square_rot * 1.57079632679;`,
      `float ${o.uv}_square_c = cos(${o.uv}_square_angle);`,
      `float ${o.uv}_square_s = sin(${o.uv}_square_angle);`,
      `${o.uv} = vec2(${o.uv}_square_local.x * ${o.uv}_square_c - ${o.uv}_square_local.y * ${o.uv}_square_s, ${o.uv}_square_local.x * ${o.uv}_square_s + ${o.uv}_square_local.y * ${o.uv}_square_c) + vec2(0.5);`,
      `} else if (${o.uv}_mode < 1.5) {`,
      `vec2 ${o.uv}_tri_grid = ${o.uv}_position / max(${i.size}, 0.0001);`,
      `vec2 ${o.uv}_tri_a = vec2(1.0, 0.0);`,
      `vec2 ${o.uv}_tri_b = vec2(0.5, 0.86602540378);`,
      `float ${o.uv}_tri_det = ${o.uv}_tri_a.x * ${o.uv}_tri_b.y - ${o.uv}_tri_a.y * ${o.uv}_tri_b.x;`,
      `float ${o.uv}_tri_ta = (${o.uv}_tri_b.y * ${o.uv}_tri_grid.x - ${o.uv}_tri_b.x * ${o.uv}_tri_grid.y) / ${o.uv}_tri_det;`,
      `float ${o.uv}_tri_tb = (${o.uv}_tri_a.x * ${o.uv}_tri_grid.y - ${o.uv}_tri_a.y * ${o.uv}_tri_grid.x) / ${o.uv}_tri_det;`,
      `vec3 ${o.uv}_tri_cell = floor(vec3(${o.uv}_tri_ta, ${o.uv}_tri_tb, fract(${o.uv}_tri_ta) + fract(${o.uv}_tri_tb)));`,
      `float ${o.uv}_tri_rand = fract(sin(dot(${o.uv}_tri_cell + vec3(${i.seed}), vec3(12.9898, 78.233, 45.652))) * 43758.5453);`,
      `float ${o.uv}_tri_rotation_count = mix(1.0, 3.0, ${o.uv}_rotate_enabled);`,
      `float ${o.uv}_tri_reflection_count = mix(1.0, 2.0, ${o.uv}_reflect_enabled);`,
      `float ${o.uv}_tri_choice = floor(${o.uv}_tri_rand * ${o.uv}_tile_count * ${o.uv}_tri_rotation_count * ${o.uv}_tri_reflection_count);`,
      `${o.index} = mod(${o.uv}_tri_choice, ${o.uv}_tile_count);`,
      `${o.uv}_tri_choice = floor(${o.uv}_tri_choice / ${o.uv}_tile_count);`,
      `float ${o.uv}_tri_rot = ${o.uv}_tri_cell.z + 2.0 * mod(${o.uv}_tri_choice, ${o.uv}_tri_rotation_count);`,
      `${o.uv}_tri_choice = floor(${o.uv}_tri_choice / ${o.uv}_tri_rotation_count);`,
      `float ${o.uv}_tri_refl = mod(${o.uv}_tri_choice, ${o.uv}_tri_reflection_count);`,
      `vec2 ${o.uv}_tri_local = ${o.uv}_tri_grid - ${o.uv}_tri_a * (${o.uv}_tri_cell.x + 0.33333333333 * (1.0 + ${o.uv}_tri_cell.z)) - ${o.uv}_tri_b * (${o.uv}_tri_cell.y + 0.33333333333 * (1.0 + ${o.uv}_tri_cell.z));`,
      `${o.uv}_tri_local.x *= 1.0 - 2.0 * ${o.uv}_tri_refl;`,
      `${o.uv}_tri_local *= 1.73205080757;`,
      `float ${o.uv}_tri_angle = mod(${o.uv}_tri_rot, 3.0) * 1.0471975512;`,
      `float ${o.uv}_tri_sign = mix(1.0, -1.0, step(3.0, ${o.uv}_tri_rot));`,
      `float ${o.uv}_tri_c = cos(${o.uv}_tri_angle);`,
      `float ${o.uv}_tri_s = sin(${o.uv}_tri_angle);`,
      `${o.uv} = vec2(0.5) + 0.5 * ${o.uv}_tri_sign * vec2(${o.uv}_tri_local.x * ${o.uv}_tri_c - ${o.uv}_tri_local.y * ${o.uv}_tri_s, ${o.uv}_tri_local.x * ${o.uv}_tri_s + ${o.uv}_tri_local.y * ${o.uv}_tri_c);`,
      `} else {`,
      `vec2 ${o.uv}_hex_grid = 2.0 * ${o.uv}_position / max(${i.size}, 0.0001);`,
      `vec2 ${o.uv}_hex_a = vec2(1.0, 0.0);`,
      `vec2 ${o.uv}_hex_b = vec2(0.5, 0.86602540378);`,
      `float ${o.uv}_hex_det = ${o.uv}_hex_a.x * ${o.uv}_hex_b.y - ${o.uv}_hex_a.y * ${o.uv}_hex_b.x;`,
      `float ${o.uv}_hex_ta = (${o.uv}_hex_b.y * ${o.uv}_hex_grid.x - ${o.uv}_hex_b.x * ${o.uv}_hex_grid.y) / ${o.uv}_hex_det;`,
      `float ${o.uv}_hex_tb = (${o.uv}_hex_a.x * ${o.uv}_hex_grid.y - ${o.uv}_hex_a.y * ${o.uv}_hex_grid.x) / ${o.uv}_hex_det;`,
      `vec3 ${o.uv}_hex_cell3 = floor(vec3(${o.uv}_hex_ta, ${o.uv}_hex_tb, fract(${o.uv}_hex_ta) + fract(${o.uv}_hex_tb)));`,
      `float ${o.uv}_hex_mod = ${o.uv}_hex_cell3.x - ${o.uv}_hex_cell3.y;`,
      `${o.uv}_hex_mod = ${o.uv}_hex_mod - 3.0 * floor(${o.uv}_hex_mod * 0.33333333333);`,
      `float ${o.uv}_hex_m0 = 1.0 - step(0.5, abs(${o.uv}_hex_mod - 0.0));`,
      `float ${o.uv}_hex_m1 = 1.0 - step(0.5, abs(${o.uv}_hex_mod - 1.0));`,
      `float ${o.uv}_hex_m2 = 1.0 - step(0.5, abs(${o.uv}_hex_mod - 2.0));`,
      `vec2 ${o.uv}_hex_cell = vec2(${o.uv}_hex_cell3.x + ${o.uv}_hex_m0 * ${o.uv}_hex_cell3.z + ${o.uv}_hex_m2, ${o.uv}_hex_cell3.y + ${o.uv}_hex_m0 * ${o.uv}_hex_cell3.z + ${o.uv}_hex_m1);`,
      `float ${o.uv}_hex_rand = feather_hash(${o.uv}_hex_cell + vec2(${i.seed}));`,
      `float ${o.uv}_hex_rotation_count = mix(1.0, 6.0, ${o.uv}_rotate_enabled);`,
      `float ${o.uv}_hex_reflection_count = mix(1.0, 2.0, ${o.uv}_reflect_enabled);`,
      `float ${o.uv}_hex_choice = floor(${o.uv}_hex_rand * ${o.uv}_tile_count * ${o.uv}_hex_rotation_count * ${o.uv}_hex_reflection_count);`,
      `${o.index} = mod(${o.uv}_hex_choice, ${o.uv}_tile_count);`,
      `${o.uv}_hex_choice = floor(${o.uv}_hex_choice / ${o.uv}_tile_count);`,
      `float ${o.uv}_hex_rot = mod(${o.uv}_hex_choice, ${o.uv}_hex_rotation_count);`,
      `${o.uv}_hex_choice = floor(${o.uv}_hex_choice / ${o.uv}_hex_rotation_count);`,
      `float ${o.uv}_hex_refl = mod(${o.uv}_hex_choice, ${o.uv}_hex_reflection_count);`,
      `vec2 ${o.uv}_hex_local = ${o.uv}_hex_grid - ${o.uv}_hex_a * ${o.uv}_hex_cell.x - ${o.uv}_hex_b * ${o.uv}_hex_cell.y;`,
      `${o.uv}_hex_local.x *= 1.0 - 2.0 * ${o.uv}_hex_refl;`,
      `float ${o.uv}_hex_angle = mod(${o.uv}_hex_rot, 3.0) * 1.0471975512;`,
      `float ${o.uv}_hex_sign = mix(1.0, -1.0, step(3.0, ${o.uv}_hex_rot));`,
      `float ${o.uv}_hex_c = cos(${o.uv}_hex_angle);`,
      `float ${o.uv}_hex_s = sin(${o.uv}_hex_angle);`,
      `${o.uv} = vec2(0.5) + 0.5 * ${o.uv}_hex_sign * vec2(${o.uv}_hex_local.x * ${o.uv}_hex_c - ${o.uv}_hex_local.y * ${o.uv}_hex_s, ${o.uv}_hex_local.x * ${o.uv}_hex_s + ${o.uv}_hex_local.y * ${o.uv}_hex_c);`,
      `}`,
      `float ${o.mask}_a = abs(length(${o.uv} - vec2(0.0, 0.0)) - 0.5);`,
      `float ${o.mask}_b = abs(length(${o.uv} - vec2(1.0, 1.0)) - 0.5);`,
      `float ${o.mask}_d = min(${o.mask}_a, ${o.mask}_b);`,
      `float ${o.mask}_aa = max(fwidth(${o.mask}_d), 0.0001);`,
      `float ${o.mask} = 1.0 - smoothstep(max(${i.width}, 0.0), max(${i.width}, 0.0) + ${o.mask}_aa, ${o.mask}_d);`,
    ].join('\n'),
  },

  // ─── Halftone ───────────────────────────────────────────────────────────────
  HalftoneMono: {
    category: 'Halftone',
    label: 'Halftone Mono',
    inputs: [
      { id: 'base', label: 'Base', type: 'float', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'offset', label: 'Offset', type: 'vec2', defaultValue: [0.01, 0], step: 0.001 },
      { id: 'scale', label: 'Scale', type: 'float', defaultValue: 1, min: 0.1, max: 16, step: 0.1 },
      { id: 'mode', label: 'Mode', type: 'float', defaultValue: 0, min: 0, max: 2, step: 1 },
    ],
    outputs: [{ id: 'out', label: 'Mask', type: 'float' }],
    emitGlsl: (i, o) => halftoneChannel(i.base, i.uv, i.offset, i.scale, i.mode, o.out, `${o.out}_mono`).join('\n'),
  },
  HalftoneColor: {
    category: 'Halftone',
    label: 'Halftone Color',
    inputs: [
      { id: 'color', label: 'Color', type: 'vec4', defaultValue: [1, 1, 1, 1], min: 0, max: 1, step: 0.01 },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'offsetR', label: 'Offset R', type: 'vec2', defaultValue: [0.01, 0], step: 0.001 },
      { id: 'offsetG', label: 'Offset G', type: 'vec2', defaultValue: [0.00866, 0.005], step: 0.001 },
      { id: 'offsetB', label: 'Offset B', type: 'vec2', defaultValue: [0.005, 0.00866], step: 0.001 },
      { id: 'scale', label: 'Scale', type: 'float', defaultValue: 1, min: 0.001, max: 16, step: 0.05 },
      { id: 'mode', label: 'Mode', type: 'float', defaultValue: 0, min: 0, max: 2, step: 1 },
    ],
    outputs: [{ id: 'out', label: 'RGBA', type: 'vec4' }],
    emitGlsl: (i, o) => [
      ...halftoneChannel(`${i.color}.r`, i.uv, i.offsetR, i.scale, i.mode, `${o.out}_r`, `${o.out}_r`),
      ...halftoneChannel(`${i.color}.g`, i.uv, i.offsetG, i.scale, i.mode, `${o.out}_g`, `${o.out}_g`),
      ...halftoneChannel(`${i.color}.b`, i.uv, i.offsetB, i.scale, i.mode, `${o.out}_b`, `${o.out}_b`),
      `vec4 ${o.out} = vec4(${o.out}_r, ${o.out}_g, ${o.out}_b, ${i.color}.a);`,
    ].join('\n'),
  },

  // ─── UV (extended) ───────────────────────────────────────────────────────────
  ZoomUV: {
    category: 'UV',
    label: 'Zoom UV',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'zoom', label: 'Zoom', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'UV', type: 'vec2' }],
    emitGlsl: (i, o) => `vec2 ${o.out} = (${i.uv} - vec2(0.5)) * max(${i.zoom}, 0.0001) + vec2(0.5);`,
  },
  FlipUV: {
    category: 'UV',
    label: 'Flip UV',
    inputs: [{ id: 'uv', label: 'UV', type: 'vec2' }],
    outputs: [
      { id: 'flipX', label: 'Flip X', type: 'vec2' },
      { id: 'flipY', label: 'Flip Y', type: 'vec2' },
      { id: 'flipXY', label: 'Flip XY', type: 'vec2' },
    ],
    emitGlsl: (i, o) =>
      `vec2 ${o.flipX} = vec2(1.0 - ${i.uv}.x, ${i.uv}.y);\nvec2 ${o.flipY} = vec2(${i.uv}.x, 1.0 - ${i.uv}.y);\nvec2 ${o.flipXY} = vec2(1.0 - ${i.uv}.x, 1.0 - ${i.uv}.y);`,
  },

  // ─── SDF ─────────────────────────────────────────────────────────────────────
  SDFLine: {
    category: 'SDF',
    label: 'SDF Line',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'position', label: 'Position', type: 'float', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
      { id: 'width', label: 'Width', type: 'float', defaultValue: 0.1, min: 0, max: 1, step: 0.01 },
    ],
    outputs: [{ id: 'out', label: 'SDF', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = abs(${i.uv}.x - ${i.position}) - 0.5 * ${i.width};`,
  },
  SDFCircle: {
    category: 'SDF',
    label: 'SDF Circle',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'position', label: 'Position', type: 'vec2', defaultValue: [0.5, 0.5], min: 0, max: 1, step: 0.01 },
      { id: 'radius', label: 'Radius', type: 'float', defaultValue: 0.25, min: 0, max: 1, step: 0.01 },
    ],
    outputs: [{ id: 'out', label: 'SDF', type: 'float' }],
    emitGlsl: (i, o) => `float ${o.out} = length(${i.uv} - ${i.position}) - ${i.radius};`,
  },
  SDFRect: {
    category: 'SDF',
    label: 'SDF Rectangle',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'position', label: 'Position', type: 'vec2', defaultValue: [0.5, 0.5], min: 0, max: 1, step: 0.01 },
      { id: 'width', label: 'Width', type: 'float', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
      { id: 'height', label: 'Height', type: 'float', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
      { id: 'corner', label: 'Corner R', type: 'float', defaultValue: 0, min: 0, max: 0.5, step: 0.01 },
    ],
    outputs: [{ id: 'out', label: 'SDF', type: 'float' }],
    emitGlsl: (i, o) =>
      `vec2 ${o.out}_d = abs(${i.uv} - ${i.position}) - 0.5 * vec2(${i.width}, ${i.height});\nfloat ${o.out} = min(max(${o.out}_d.x, ${o.out}_d.y), 0.0) + length(max(${o.out}_d, vec2(0.0))) - ${i.corner};`,
  },
  SDFPolygon: {
    category: 'SDF',
    label: 'SDF Polygon',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'position', label: 'Position', type: 'vec2', defaultValue: [0.5, 0.5], min: 0, max: 1, step: 0.01 },
      { id: 'radius', label: 'Radius', type: 'float', defaultValue: 0.25, min: 0, max: 1, step: 0.01 },
      { id: 'sides', label: 'Sides', type: 'float', defaultValue: 6, min: 3, max: 12, step: 1 },
      { id: 'corner', label: 'Corner R', type: 'float', defaultValue: 0, min: 0, max: 0.5, step: 0.01 },
    ],
    outputs: [{ id: 'out', label: 'SDF', type: 'float' }],
    emitGlsl: (i, o) => [
      `vec2 ${o.out}_f = ${i.uv} - ${i.position};`,
      `float ${o.out}_sides = max(${i.sides}, 3.0);`,
      `float ${o.out}_angle = atan(${o.out}_f.y, ${o.out}_f.x) + 3.14159265359;`,
      `float ${o.out}_sector = 6.28318530718 / ${o.out}_sides;`,
      `float ${o.out}_radial = cos(floor(0.5 + ${o.out}_angle / ${o.out}_sector) * ${o.out}_sector - ${o.out}_angle) * length(${o.out}_f);`,
      `float ${o.out} = ${o.out}_radial - ${i.radius} - ${i.corner};`,
    ].join('\n'),
  },
  SDFSample: {
    category: 'SDF',
    label: 'SDF Sample',
    inputs: [
      { id: 'sdf', label: 'SDF', type: 'float' },
      { id: 'offset', label: 'Offset', type: 'float', defaultValue: 0, step: 0.01 },
    ],
    outputs: [{ id: 'out', label: 'Mask', type: 'float' }],
    emitGlsl: (i, o) => [
      `float ${o.out}_d = ${i.sdf} - ${i.offset};`,
      `float ${o.out} = clamp(-${o.out}_d / max(fwidth(${o.out}_d), 0.0001), 0.0, 1.0);`,
    ].join('\n'),
  },
  SDFSampleStrip: {
    category: 'SDF',
    label: 'SDF Sample Strip',
    inputs: [
      { id: 'sdf', label: 'SDF', type: 'float' },
      { id: 'offsetMin', label: 'Min', type: 'float', defaultValue: -0.05, step: 0.01 },
      { id: 'offsetMax', label: 'Max', type: 'float', defaultValue: 0.05, step: 0.01 },
    ],
    outputs: [{ id: 'out', label: 'Mask', type: 'float' }],
    emitGlsl: (i, o) => [
      `float ${o.out}_d = max(-(${i.sdf} - ${i.offsetMin}), ${i.sdf} - ${i.offsetMax});`,
      `float ${o.out} = clamp(-${o.out}_d / max(fwidth(${o.out}_d), 0.0001), 0.0, 1.0);`,
    ].join('\n'),
  },
  SDFBoolean: {
    category: 'SDF',
    label: 'SDF Boolean',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    outputs: [
      { id: 'union', label: 'Union', type: 'float' },
      { id: 'intersect', label: 'Intersect', type: 'float' },
      { id: 'diff', label: 'Diff A-B', type: 'float' },
    ],
    emitGlsl: (i, o) => [
      `float ${o.union} = min(${i.a}, ${i.b});`,
      `float ${o.intersect} = max(${i.a}, ${i.b});`,
      `float ${o.diff} = max(${i.a}, -${i.b});`,
    ].join('\n'),
  },
  SDFSoftBoolean: {
    category: 'SDF',
    label: 'SDF Soft Boolean',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'smoothing', label: 'Smooth', type: 'float', defaultValue: 0.1, min: 0, max: 1, step: 0.01 },
    ],
    outputs: [
      { id: 'union', label: 'Union', type: 'float' },
      { id: 'intersect', label: 'Intersect', type: 'float' },
      { id: 'diff', label: 'Diff A-B', type: 'float' },
    ],
    emitGlsl: (i, o) => {
      const s = `max(${i.smoothing}, 0.0001)`;
      return [
        `float ${o.union}_t = clamp(0.5 * (1.0 + (${i.b} - ${i.a}) / ${s}), 0.0, 1.0);`,
        `float ${o.union} = mix(${i.b}, ${i.a}, ${o.union}_t) - ${s} * ${o.union}_t * (1.0 - ${o.union}_t);`,
        `float ${o.intersect}_t = clamp(0.5 * (1.0 + (${i.a} - ${i.b}) / ${s}), 0.0, 1.0);`,
        `float ${o.intersect} = -(mix(-${i.b}, -${i.a}, ${o.intersect}_t) - ${s} * ${o.intersect}_t * (1.0 - ${o.intersect}_t));`,
        `float ${o.diff}_t = clamp(0.5 * (1.0 + (${i.a} + ${i.b}) / ${s}), 0.0, 1.0);`,
        `float ${o.diff} = -(mix(${i.b}, -${i.a}, ${o.diff}_t) - ${s} * ${o.diff}_t * (1.0 - ${o.diff}_t));`,
      ].join('\n');
    },
  },
};

export const CATEGORY_COLORS: Record<string, string> = {
  Input: 'border-l-blue-500',
  Math: 'border-l-orange-500',
  Vector: 'border-l-purple-500',
  Color: 'border-l-pink-500',
  Composite: 'border-l-rose-500',
  Noise: 'border-l-green-500',
  Halftone: 'border-l-lime-500',
  UV: 'border-l-indigo-500',
  Effect: 'border-l-cyan-500',
  Output: 'border-l-red-500',
  Vertex: 'border-l-yellow-500',
  SDF: 'border-l-teal-500',
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
      'Tan',
      'Abs',
      'Fract',
      'Floor',
      'Ceil',
      'Round',
      'Sign',
      'Min',
      'Max',
      'Modulo',
      'Negate',
      'Saturate',
      'Remap',
      'Sqrt',
      'Log',
      'Exp',
      'Atan2',
    ],
  },
  {
    category: 'Vector',
    nodes: [
      'Combine2',
      'Combine3',
      'Combine4',
      'CombineRGB',
      'Split4',
      'SplitRGB',
      'SplitVec2',
      'SplitVec3',
      'SwizzleVec2',
      'Normalize',
      'Length',
      'Dot',
      'DistanceVec2',
      'LengthVec2',
      'NormalizeVec2',
      'DotVec2',
      'CrossVec3',
      'LerpVec4',
      'ScaleVec2',
      'ScaleVec4',
    ],
  },
  { category: 'Color', nodes: ['Desaturate', 'OneMinus', 'HueShift', 'InvertColor', 'Contrast', 'PosterizeColor', 'MultiplyColor', 'BlendAdd', 'BlendScreen', 'BlendOverlay', 'Brightness', 'GammaCorrect', 'LabColorConvert', 'LabComplementary', 'LabSplitScheme', 'LabDualScheme'] },
  { category: 'Composite', nodes: ['CompositeAlpha'] },
  { category: 'Noise', nodes: ['SimpleNoise', 'GradientNoise', 'FBMNoise', 'TruchetTiles', 'Ripple', 'VoronoiCells', 'Checkerboard'] },
  { category: 'Halftone', nodes: ['HalftoneMono', 'HalftoneColor'] },
  { category: 'UV', nodes: ['TilingOffset', 'RotateUV', 'TwirlUV', 'PolarCoordinates', 'ZoomUV', 'FlipUV'] },
  {
    category: 'Effect',
    nodes: [
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
    ],
  },
  { category: 'Output', nodes: ['FragmentOutput'] },
  { category: 'Vertex', nodes: ['VertexPosition', 'VertexWave2D', 'TransformMatrix', 'MatVecMul', 'VertexOutput'] },
  { category: 'SDF', nodes: ['SDFLine', 'SDFCircle', 'SDFRect', 'SDFPolygon', 'SDFSample', 'SDFSampleStrip', 'SDFBoolean', 'SDFSoftBoolean'] },
];
