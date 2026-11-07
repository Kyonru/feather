/**
 * Validate and normalize one plugin manifest for the generated catalog.
 *
 * The vocabulary (capability tokens, runtime policy values, schema versions)
 * comes from `packages/runtime-lua/feather/plugin_contract.lua`, the same table
 * the Lua runtime validates against, so the two cannot disagree.
 */

const KNOWN_FIELDS = new Set([
  'id',
  'name',
  'description',
  'version',
  'api',
  'minApi',
  'maxApi',
  'capabilities',
  'optionalCapabilities',
  'runtime',
  'opts',
  'optIn',
  'disabled',
  'actions',
]);

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isEmptyList = (value) => Array.isArray(value) && value.length === 0;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

function stringList(value, field, problems, vocabulary) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    problems.push(`${field} must be a list of strings`);
    return [];
  }
  const out = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '') {
      problems.push(`${field} contains a non-string entry`);
      continue;
    }
    if (vocabulary && !vocabulary.includes(entry)) {
      problems.push(`${field} has unknown capability '${entry}' (known: ${vocabulary.join(', ')})`);
      continue;
    }
    if (out.includes(entry)) {
      problems.push(`${field} lists '${entry}' twice`);
      continue;
    }
    out.push(entry);
  }
  return out;
}

function normalizeApi(manifest, problems) {
  const { api, minApi, maxApi } = manifest;
  for (const [field, value] of [
    ['minApi', minApi],
    ['maxApi', maxApi],
  ]) {
    if (value !== undefined && !isPositiveInteger(value)) problems.push(`${field} must be a positive integer`);
  }

  if (api === undefined) {
    if (minApi === undefined && maxApi === undefined) return null;
    return { min: minApi ?? null, max: maxApi ?? null, exact: null };
  }
  if (typeof api === 'number') {
    if (!isPositiveInteger(api)) problems.push('api must be a positive integer');
    return { min: null, max: null, exact: [api] };
  }
  if (Array.isArray(api)) {
    if (api.length === 0 || !api.every(isPositiveInteger)) problems.push('api list must contain positive integers');
    return { min: null, max: null, exact: api };
  }
  if (isPlainObject(api)) {
    const unknown = Object.keys(api).filter((key) => key !== 'min' && key !== 'max');
    if (unknown.length > 0) problems.push(`api has unknown fields: ${unknown.join(', ')}`);
    const min = api.min ?? minApi ?? null;
    const max = api.max ?? maxApi ?? null;
    if (min !== null && !isPositiveInteger(min)) problems.push('api.min must be a positive integer');
    if (max !== null && !isPositiveInteger(max)) problems.push('api.max must be a positive integer');
    if (min !== null && max !== null && min > max) problems.push(`api range is empty (min ${min} > max ${max})`);
    if (min === null && max === null) problems.push('api table must declare min and/or max');
    return { min, max, exact: null };
  }
  problems.push('api must be a number, a list of numbers, or { min, max }');
  return null;
}

function normalizeRuntime(runtime, contract, problems) {
  if (runtime === undefined) {
    problems.push(
      'runtime policy is missing; declare runtime = { cost, update, push, sampleRate } (see plugins/README.md, Runtime Cost Policy)',
    );
    return null;
  }
  if (!isPlainObject(runtime)) {
    problems.push('runtime must be a table');
    return null;
  }
  const unknown = Object.keys(runtime).filter((key) => !['cost', 'update', 'push', 'sampleRate'].includes(key));
  if (unknown.length > 0) problems.push(`runtime has unknown fields: ${unknown.join(', ')}`);
  for (const field of ['cost', 'update', 'push']) {
    const allowed = contract.runtime[field];
    if (runtime[field] === undefined) problems.push(`runtime.${field} is required (${allowed.join(' | ')})`);
    else if (!allowed.includes(runtime[field])) {
      problems.push(`runtime.${field} must be one of ${allowed.join(', ')}; got '${runtime[field]}'`);
    }
  }
  if (runtime.sampleRate === undefined) problems.push('runtime.sampleRate is required (seconds between pushes)');
  else if (typeof runtime.sampleRate !== 'number' || !(runtime.sampleRate > 0)) {
    problems.push('runtime.sampleRate must be a positive number of seconds');
  }
  return {
    cost: runtime.cost,
    update: runtime.update,
    push: runtime.push,
    sampleRate: runtime.sampleRate,
  };
}

function normalizeActions(actions, contract, problems) {
  if (actions === undefined) return null;
  if (!Array.isArray(actions)) {
    problems.push('actions must be a list of { name, cancellable }');
    return null;
  }
  const names = new Set();
  const out = [];
  for (const action of actions) {
    if (!isPlainObject(action) || typeof action.name !== 'string' || action.name === '') {
      problems.push('every action needs a non-empty name');
      continue;
    }
    const unknown = Object.keys(action).filter((key) => !['name', 'cancellable', 'description'].includes(key));
    if (unknown.length > 0) problems.push(`action '${action.name}' has unknown fields: ${unknown.join(', ')}`);
    if (names.has(action.name)) problems.push(`action '${action.name}' is declared twice`);
    if (action.cancellable !== undefined && typeof action.cancellable !== 'boolean') {
      problems.push(`action '${action.name}'.cancellable must be a boolean`);
    }
    names.add(action.name);
    out.push({
      name: action.name,
      cancellable: action.cancellable === true,
      schemaVersion: contract.actionSchemaVersion,
      ...(typeof action.description === 'string' ? { description: action.description } : {}),
    });
  }
  return out;
}

/**
 * @param {unknown} manifest Parsed manifest table
 * @param {{ sourceDir: string, contract: object, hasReadme: boolean, hasE2e: boolean }} context
 * @returns {{ entry: object, problems: string[] }}
 */
export function validateManifest(manifest, context) {
  const problems = [];
  const { contract, sourceDir } = context;
  if (!isPlainObject(manifest)) {
    return { entry: null, problems: ['manifest must return a table of fields'] };
  }

  const unknown = Object.keys(manifest).filter((key) => !KNOWN_FIELDS.has(key));
  if (unknown.length > 0) problems.push(`unknown manifest fields: ${unknown.join(', ')}`);

  const id = manifest.id;
  if (typeof id !== 'string' || !ID.test(id)) {
    problems.push(`id must be a lowercase identifier (letters, digits, '-' and '.'); got ${JSON.stringify(id)}`);
  } else if (id.replace(/\./g, '/') !== sourceDir) {
    problems.push(`id '${id}' does not match its directory '${sourceDir}' (dotted ids map to nested directories)`);
  }

  for (const field of ['name', 'description']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') {
      problems.push(`${field} must be a non-empty string`);
    }
  }
  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
    problems.push(`version must be a semantic version (x.y.z); got ${JSON.stringify(manifest.version)}`);
  }
  for (const field of ['optIn', 'disabled']) {
    if (manifest[field] !== undefined && typeof manifest[field] !== 'boolean') {
      problems.push(`${field} must be a boolean`);
    }
  }
  if (manifest.opts !== undefined && !isPlainObject(manifest.opts) && !isEmptyList(manifest.opts)) {
    problems.push('opts must be a table of named options');
  }

  const capabilities = stringList(manifest.capabilities, 'capabilities', problems, contract.capabilities);
  const optionalCapabilities = stringList(
    manifest.optionalCapabilities,
    'optionalCapabilities',
    problems,
    contract.capabilities,
  );
  for (const token of optionalCapabilities) {
    if (capabilities.includes(token)) problems.push(`capability '${token}' is both required and optional`);
  }

  const api = normalizeApi(manifest, problems);
  const runtime = normalizeRuntime(manifest.runtime, contract, problems);
  const actions = normalizeActions(manifest.actions, contract, problems);

  if (!context.hasReadme) problems.push(`missing documentation: plugins/${sourceDir}/README.md`);
  if (!context.hasE2e) {
    problems.push(`missing Lua e2e suite: e2e/plugins/${String(id).replace(/[.-]/g, '_')}.lua`);
  }

  return {
    problems,
    entry: {
      id,
      sourceDir,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      capabilities,
      optionalCapabilities,
      optIn: manifest.optIn === true,
      disabled: manifest.disabled !== false,
      api,
      runtime,
      actions,
      uiSchemaVersion: contract.uiSchemaVersion,
    },
  };
}
