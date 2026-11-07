import assert from 'node:assert/strict';
import test from 'node:test';
import type { Node } from '@xyflow/react';
import { useShaderGraphStore } from '../../apps/studio/src/store/shader-graph.ts';
import type { ShaderNodeData } from '../../apps/studio/src/types/shader-graph.ts';

test('Shader Graph palette node additions can be undone and redone', () => {
  const store = useShaderGraphStore;
  store.getState().loadGraph({ nodes: [], edges: [], subgraphs: [] });

  const node: Node<ShaderNodeData> = {
    id: 'test-sine-node',
    type: 'shaderNode',
    position: { x: 0, y: 0 },
    data: { label: 'Sine Waves', nodeType: 'PatternSineWaves' },
  };

  store.getState().addNode(node);
  assert.equal(store.getState().nodes.length, 1);
  assert.equal(store.getState().undoStack.length, 1);

  store.getState().setNodes([{
    ...node,
    position: { ...node.position },
    data: { ...node.data },
    selected: true,
    measured: { width: 120, height: 80 },
    width: 120,
    height: 80,
  }]);
  assert.equal(store.getState().nodes[0]?.selected, true);
  assert.equal(store.getState().undoStack.length, 1, 'selection and measurement updates do not create history entries');

  store.getState().setNodes([{
    ...store.getState().nodes[0]!,
    data: { ...store.getState().nodes[0]!.data, label: 'Edited Sine Waves' },
  }]);
  assert.equal(store.getState().undoStack.length, 2, 'authored node data changes remain undoable');

  store.getState().undo();
  assert.equal(store.getState().nodes[0]?.data.label, 'Sine Waves');
  store.getState().undo();
  assert.equal(store.getState().nodes.length, 0);
  assert.equal(store.getState().redoStack.length, 2);

  store.getState().redo();
  assert.equal(store.getState().nodes.length, 1);
  assert.equal(store.getState().undoStack.length, 1);
});
