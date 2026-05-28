import assert from 'node:assert/strict';
import test from 'node:test';
import { codegen } from '../../src/pages/shader-graph/codegen.ts';

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
}

function node(id, nodeType) {
  return {
    id,
    type: 'shaderNode',
    position: { x: 0, y: 0 },
    data: { label: id, nodeType },
  };
}

function edge(source, sourceHandle, target, targetHandle) {
  return {
    id: `${source}:${sourceHandle}->${target}:${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

function expectSnippets(pixel, snippets, label) {
  for (const snippet of snippets) {
    assert.match(pixel, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${label} missing ${snippet}`);
  }
}

test('fake 3d sprite illusion nodes emit expected GLSL outputs', () => {
  const cases = [
    {
      label: 'SpriteTextureSample',
      nodes: [node('sample', 'SpriteTextureSample'), node('out', 'FragmentOutput')],
      edges: [edge('sample', 'rgba', 'out', 'color')],
      snippets: ['vec4 v_sample_rgba = Texel(tex', 'v_sample_rgba.a *= clamp'],
    },
    {
      label: 'BillboardUV',
      nodes: [node('billboard', 'BillboardUV'), node('sample', 'SpriteTextureSample'), node('out', 'FragmentOutput')],
      edges: [
        edge('billboard', 'uv', 'sample', 'uv'),
        edge('billboard', 'mask', 'sample', 'mask'),
        edge('sample', 'rgba', 'out', 'color'),
      ],
      snippets: ['float v_billboard_depth', 'float v_billboard_mask', 'vec2 v_billboard_uv'],
    },
    {
      label: 'ParallaxUV',
      nodes: [node('parallax', 'ParallaxUV'), node('sample', 'SpriteTextureSample'), node('out', 'FragmentOutput')],
      edges: [
        edge('parallax', 'uv', 'sample', 'uv'),
        edge('sample', 'rgba', 'out', 'color'),
      ],
      snippets: ['vec2 v_parallax_offset', 'vec2 v_parallax_uv'],
    },
    {
      label: 'FakeDepthShade',
      nodes: [node('shade', 'FakeDepthShade'), node('out', 'FragmentOutput')],
      edges: [edge('shade', 'rgba', 'out', 'color')],
      snippets: ['vec3 v_shade_rgba_normal', 'float v_shade_rgba_shade', 'vec4 v_shade_rgba'],
    },
    {
      label: 'BillboardShadow',
      nodes: [node('shadow', 'BillboardShadow'), node('out', 'FragmentOutput')],
      edges: [edge('shadow', 'rgba', 'out', 'color')],
      snippets: ['float v_shadow_mask', 'vec4 v_shadow_rgba'],
    },
    {
      label: 'AtlasSliceUV',
      nodes: [node('slice', 'AtlasSliceUV'), node('sample', 'SpriteTextureSample'), node('out', 'FragmentOutput')],
      edges: [
        edge('slice', 'uv', 'sample', 'uv'),
        edge('slice', 'mask', 'sample', 'mask'),
        edge('sample', 'rgba', 'out', 'color'),
      ],
      snippets: ['vec2 v_slice_uv_cell', 'float v_slice_mask', 'float v_slice_depth'],
    },
    {
      label: 'StackedSpriteSample',
      nodes: [node('atlas', 'TextureInput'), node('stack', 'StackedSpriteSample'), node('out', 'FragmentOutput')],
      edges: [
        edge('atlas', 'texture', 'stack', 'texture'),
        edge('stack', 'rgba', 'out', 'color'),
      ],
      snippets: ['for (int v_stack_rgba_i = 0; v_stack_rgba_i < 16; v_stack_rgba_i++)', 'vec4 v_stack_rgba = vec4', 'float v_stack_mask'],
    },
  ];

  for (const item of cases) {
    const generated = codegen(item.nodes, item.edges);
    expectSnippets(generated.pixel, item.snippets, item.label);
  }
});
