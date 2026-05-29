import assert from 'node:assert/strict';
import test from 'node:test';
import { linkSuggestions } from '../../src/pages/shader-graph/graphUtils.ts';

function shaderNode(id, nodeType) {
  return {
    id,
    type: 'shaderNode',
    position: { x: 0, y: 0 },
    data: { label: id, nodeType },
  };
}

test('image outputs suggest Sample Texture instead of Texture Uniform Color', () => {
  const suggestions = linkSuggestions(
    [shaderNode('texture', 'TextureInput')],
    {
      nodeId: 'texture',
      nodeLabel: 'Texture Input',
      portId: 'texture',
      portLabel: 'Image',
      type: 'image',
      direction: 'output',
    },
  );

  assert.equal(suggestions.some((item) => item.kind === 'node' && item.nodeType === 'SampleTexture'), true);
  assert.equal(suggestions.some((item) => item.kind === 'node' && item.nodeType === 'TextureUniformColor'), false);
});

test('uv outputs still suggest Texture Uniform Color sampling', () => {
  const suggestions = linkSuggestions(
    [shaderNode('uv', 'TextureCoords')],
    {
      nodeId: 'uv',
      nodeLabel: 'Texture Coords',
      portId: 'out',
      portLabel: 'UV',
      type: 'vec2',
      direction: 'output',
    },
  );

  assert.equal(suggestions.some((item) => item.kind === 'node' && item.nodeType === 'TextureUniformColor'), true);
});
