import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_COLLAPSED_SHADER_GRAPH_NODE_CATEGORIES,
  normalizeShaderGraphNodeCategories,
} from '../../src/constants/shader-graph.ts';

test('shader graph palette collapsed categories default to specialized sections', () => {
  assert.deepEqual(normalizeShaderGraphNodeCategories(undefined), DEFAULT_COLLAPSED_SHADER_GRAPH_NODE_CATEGORIES);
});

test('shader graph palette collapsed categories drop unknown persisted values', () => {
  assert.deepEqual(
    normalizeShaderGraphNodeCategories(['SDF', 'Missing', 'Complex', 'SDF', 42], []),
    ['Complex', 'SDF'],
  );
});

