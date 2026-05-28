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

function graphForVec4Node(nodeType, outputHandle) {
  const id = nodeType.toLowerCase();
  return {
    nodes: [node(id, nodeType), node('out', 'FragmentOutput')],
    edges: [edge(id, outputHandle, 'out', 'color')],
  };
}

function graphForFloatNode(nodeType, outputHandle) {
  const id = nodeType.toLowerCase();
  return {
    nodes: [node(id, nodeType), node('combine', 'Combine4'), node('out', 'FragmentOutput')],
    edges: [
      edge(id, outputHandle, 'combine', 'r'),
      edge(id, outputHandle, 'combine', 'g'),
      edge(id, outputHandle, 'combine', 'b'),
      edge('combine', 'out', 'out', 'color'),
    ],
  };
}

test('composition helper nodes emit expected GLSL outputs', () => {
  const cases = [
    { type: 'EffectMix', graph: graphForVec4Node('EffectMix', 'out'), snippets: ['float v_effectmix_out_mix', 'vec4 v_effectmix_out'] },
    { type: 'AlphaMask', graph: graphForVec4Node('AlphaMask', 'rgba'), snippets: ['float v_alphamask_mask', 'vec4 v_alphamask_rgba'] },
    { type: 'LumaMask', graph: graphForFloatNode('LumaMask', 'mask'), snippets: ['dot(', 'float v_lumamask_mask'] },
    { type: 'MaskRange', graph: graphForFloatNode('MaskRange', 'mask'), snippets: ['float v_maskrange_mask_min', 'float v_maskrange_mask'] },
    { type: 'GradientMap', graph: graphForVec4Node('GradientMap', 'rgba'), snippets: ['vec4 v_gradientmap_rgba'] },
    { type: 'MaskCombine', graph: graphForFloatNode('MaskCombine', 'multiply'), snippets: ['float v_maskcombine_multiply', 'float v_maskcombine_subtract'] },
    { type: 'BlendModes', graph: graphForVec4Node('BlendModes', 'normal'), snippets: ['vec4 v_blendmodes_normal', 'vec4 v_blendmodes_difference'] },
    { type: 'ColorRamp', graph: graphForVec4Node('ColorRamp', 'rgba'), snippets: ['vec4 v_colorramp_rgba_low_mid', 'vec4 v_colorramp_rgba'] },
  ];

  for (const item of cases) {
    const generated = codegen(item.graph.nodes, item.graph.edges);
    for (const snippet of item.snippets) {
      assert.match(generated.pixel, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${item.type} missing ${snippet}`);
    }
  }
});
