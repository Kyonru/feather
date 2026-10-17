import assert from 'node:assert/strict';
import test from 'node:test';

import { parseShaderGraphFile } from '../../apps/studio/src/tools/shader-graph/file-format.ts';

const base = {
  type: 'feather.shader-graph',
  version: 3,
  shaderName: ' Imported shader ',
  nodes: [
    {
      id: 'color',
      type: 'anything-from-disk',
      position: { x: 12, y: 'bad' },
      selected: true,
      style: { position: 'fixed' },
      data: { label: 42, nodeType: 'Vec4Constant', values: { value: [1, 0, 0, 1] } },
    },
    {
      id: 'output',
      position: { x: 200, y: 0 },
      data: { label: 'Output', nodeType: 'FragmentOutput' },
    },
  ],
  edges: [{ id: 'edge', source: 'color', target: 'output', sourceHandle: 'value', targetHandle: 'color' }],
};

test('shader graph imports coerce external values before they reach rendering', () => {
  const graph = parseShaderGraphFile({
    ...base,
    playgroundTarget: { composite: 'Fire', systemIndex: '2' },
    activeTemplateInstanceId: 'missing',
    lastGeneratedGlsl: { pixel: 'stale third-party cache', vertex: null, hash: 'x' },
  });

  assert.equal(graph.shaderName, 'Imported shader');
  assert.deepEqual(graph.playgroundTarget, { composite: 'Fire', systemIndex: 2 });
  assert.equal(graph.nodes[0].type, 'shaderNode');
  assert.equal(graph.nodes[0].position.y, 0);
  assert.equal(graph.nodes[0].selected, false);
  assert.equal(graph.nodes[0].data.label, 'Vec4Constant');
  assert.equal('style' in graph.nodes[0], false);
  assert.equal(graph.activeTemplateInstanceId, null);
  assert.equal(graph.lastGeneratedGlsl, null);
});

test('shader graph imports reject unknown nodes and dangling edges', () => {
  assert.throws(
    () => parseShaderGraphFile({ ...base, nodes: [{ ...base.nodes[0], data: { nodeType: 'MadeUpNode' } }] }),
    /supported shader node/,
  );
  assert.throws(
    () => parseShaderGraphFile({ ...base, edges: [{ id: 'edge', source: 'missing', target: 'output' }] }),
    /missing node/,
  );
});
