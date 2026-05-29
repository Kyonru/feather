/* eslint-disable no-undef */
import assert from 'node:assert/strict';
import test from 'node:test';
import { codegen } from '../../src/pages/shader-graph/codegen.ts';
import { diagnoseShaderGraph } from '../../src/pages/shader-graph/diagnostics.ts';
import { instantiateShaderGraphPreset, SHADER_GRAPH_PRESETS } from '../../src/pages/shader-graph/presets.ts';

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
}

function shaderNode(id, nodeType, data = {}) {
  return {
    id,
    type: 'shaderNode',
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, ...data },
  };
}

test('preset templates load as root subgraph instances with explicit boundary nodes', () => {
  const preset = SHADER_GRAPH_PRESETS.find((item) => item.id === 'outline');
  assert.ok(preset);

  const template = instantiateShaderGraphPreset(preset);
  const instance = template.nodes.find((node) => node.data.nodeType === 'SubgraphInstance');
  assert.ok(instance);
  assert.equal(template.activeTemplateInstanceId, instance.id);
  assert.equal(template.subgraphs.length, 1);
  assert.ok(template.subgraphs[0].nodes.some((node) => node.data.nodeType === 'SubgraphInput'));
  assert.ok(template.subgraphs[0].nodes.some((node) => node.data.nodeType === 'SubgraphOutput'));
  assert.ok(template.subgraphs[0].inputs.some((port) => port.id === 'strength' && port.uiRole === 'control'));
  assert.ok(template.subgraphs[0].outputs.some((port) => port.id === 'rgba'));

  const generated = codegen(template.nodes, template.edges, template.subgraphs);
  assert.match(generated.pixel, /feather_template_outline_/);
  assert.match(generated.pixel, /return v_/);
});

test('editing a template instance control changes generated GLSL arguments', () => {
  const preset = SHADER_GRAPH_PRESETS.find((item) => item.id === 'outline');
  assert.ok(preset);
  const template = instantiateShaderGraphPreset(preset);
  const instance = template.nodes.find((node) => node.data.nodeType === 'SubgraphInstance');
  assert.ok(instance);

  const before = codegen(template.nodes, template.edges, template.subgraphs).pixel;
  instance.data.values = { ...instance.data.values, strength: 7 };
  const after = codegen(template.nodes, template.edges, template.subgraphs).pixel;
  assert.notEqual(before, after);
  assert.match(after, /,\s*7\.0,\s*vec4/);
});

test('root-level boundary nodes and missing explicit outputs are diagnostics', () => {
  const rootDiagnostics = diagnoseShaderGraph({
    nodes: [
      shaderNode('boundary', 'SubgraphInput', {
        boundaryPort: { id: 'strength', label: 'Strength', type: 'float', defaultValue: 1, uiRole: 'control' },
      }),
      shaderNode('out', 'FragmentOutput'),
    ],
    edges: [],
  });
  assert.ok(rootDiagnostics.some((item) => item.severity === 'error' && /only be used while editing inside a subgraph/i.test(item.message)));

  const subgraphDiagnostics = diagnoseShaderGraph({
    nodes: [shaderNode('tex', 'TextureColor'), shaderNode('out', 'FragmentOutput')],
    edges: [{ id: 'tex:out->out:color', source: 'tex', sourceHandle: 'out', target: 'out', targetHandle: 'color' }],
    subgraphs: [
      {
        id: 'sg',
        name: 'Missing Output Template',
        functionName: 'missing_output_template',
        nodes: [
          shaderNode('input', 'SubgraphInput', {
            boundaryPort: { id: 'strength', label: 'Strength', type: 'float', defaultValue: 1, uiRole: 'control' },
          }),
        ],
        edges: [],
        inputs: [],
        outputs: [],
        inputMappings: {},
        outputMappings: {},
      },
    ],
  });
  assert.ok(subgraphDiagnostics.some((item) => item.severity === 'error' && /needs at least one Subgraph Output/i.test(item.message)));
});

test('texture uniform diagnostics require node-specific uploads', () => {
  const graph = {
    nodes: [
      shaderNode('uv', 'TextureCoords'),
      shaderNode('sample', 'TextureUniformColor'),
      shaderNode('out', 'FragmentOutput'),
    ],
    edges: [
      { id: 'uv:out->sample:uv', source: 'uv', sourceHandle: 'out', target: 'sample', targetHandle: 'uv' },
      { id: 'sample:out->out:color', source: 'sample', sourceHandle: 'out', target: 'out', targetHandle: 'color' },
    ],
  };

  const missing = diagnoseShaderGraph(graph);
  assert.ok(missing.some((item) => /Upload a texture for sample/i.test(item.message)));

  const withoutNodeTexture = diagnoseShaderGraph({
    ...graph,
    textureUploads: {},
  });
  assert.ok(withoutNodeTexture.some((item) => /texture uniforms need their own upload/i.test(item.message)));

  const withNodeTexture = diagnoseShaderGraph({
    ...graph,
    textureUploads: {
      sample: { filename: 'uniform.png', dataBase64: 'abc123' },
    },
  });
  assert.equal(withNodeTexture.some((item) => /Upload a texture for sample/i.test(item.message)), false);
});

test('texture noise water template emits Image subgraph inputs', () => {
  const preset = SHADER_GRAPH_PRESETS.find((item) => item.id === 'texture-noise-water');
  assert.ok(preset);
  const template = instantiateShaderGraphPreset(preset);
  const generated = codegen(template.nodes, template.edges, template.subgraphs);

  assert.match(generated.pixel, /Image sg_in_noiseTexture/);
  assert.doesNotMatch(generated.pixel, /\bimage sg_in_noiseTexture\b/);
  assert.ok(generated.textures.some((texture) => texture.label === 'Noise Texture'));
});
