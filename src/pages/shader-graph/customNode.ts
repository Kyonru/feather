import type { GlslType, NodeDef, PortDef, ShaderNodeData } from '@/types/shader-graph';

const CUSTOM_GLSL_TYPES = ['float', 'vec2', 'vec3', 'vec4', 'mat4'] as const;
const CUSTOM_TYPE_SET = new Set<string>(CUSTOM_GLSL_TYPES);
const GLSL_DECLARATION_TYPES = new Set<string>(['float', 'vec2', 'vec3', 'vec4', 'mat2', 'mat3', 'mat4', 'int', 'bool']);

type CustomGlslType = (typeof CUSTOM_GLSL_TYPES)[number];

export type CustomFunctionSignature = {
  functionName: string;
  returnType: CustomGlslType | 'void';
  inputs: PortDef[];
  outputs: PortDef[];
  outParamIds: string[];
};

export type CustomFunctionValidation = {
  signature: CustomFunctionSignature | null;
  errors: string[];
};

export const DEFAULT_CUSTOM_FUNCTION_CODE = [
  'vec4 custom_tint(vec4 color, float strength) {',
  '  return vec4(color.rgb * strength, color.a);',
  '}',
].join('\n');

function splitParams(params: string): string[] {
  return params
    .split(',')
    .map((param) => param.trim())
    .filter(Boolean);
}

function labelFromId(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeId(id: string): string {
  const normalized = id.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_]/.test(normalized) ? normalized : `p_${normalized}`;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function statementPreview(statement: string): string {
  return statement.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function hasTopLevelComma(expression: string): boolean {
  let depth = 0;
  for (const char of expression) {
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) return true;
  }
  return false;
}

function validateBodyLines(body: string, errors: string[]) {
  for (const rawLine of stripComments(body).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.endsWith(';') || line.endsWith('{') || line.endsWith('}')) continue;
    if (/^(else|do)\b/.test(line)) continue;
    errors.push(`Statement must end with a semicolon: ${statementPreview(line)}`);
  }
}

function validateStatement(statement: string, errors: string[], declaredNames: Set<string>) {
  const trimmed = statement.trim();
  if (!trimmed) return;
  if (trimmed === '{' || trimmed === '}') return;
  if (/^(if|for|while|switch)\s*\(/.test(trimmed)) return;
  if (/^(else|do)\b/.test(trimmed)) return;
  if (/^(break|continue|discard)$/.test(trimmed)) return;
  if (/^return\b/.test(trimmed)) return;

  const declaration = trimmed.match(/^(?:const\s+)?(?:lowp\s+|mediump\s+|highp\s+)?([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\b/);
  if (declaration && GLSL_DECLARATION_TYPES.has(declaration[1])) {
    declaredNames.add(declaration[2]);
    return;
  }

  const assignment = trimmed.match(/^([A-Za-z_]\w*)(?:\.[xyzwrgba]{1,4})?\s*(?:=|\+=|-=|\*=|\/=)/);
  if (assignment) {
    if (!declaredNames.has(assignment[1])) {
      errors.push(`Assignment target is not a parameter or local variable: ${assignment[1]}`);
    }
    return;
  }

  if (/^[A-Za-z_]\w*\s*\(/.test(trimmed)) return;
  if (/^[A-Za-z_]\w*$/.test(trimmed)) {
    errors.push(`Bare identifier is not a valid GLSL statement: ${trimmed}`);
    return;
  }
}

function validateFunctionBody(body: string, signature: CustomFunctionSignature, errors: string[]) {
  const cleanBody = stripComments(body);
  validateBodyLines(cleanBody, errors);

  const declaredNames = new Set<string>([
    ...signature.inputs.map((port) => port.id),
    ...signature.outParamIds,
  ]);
  const statements = cleanBody
    .replace(/[{}]/g, '\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    validateStatement(statement, errors, declaredNames);
  }

  if (signature.returnType !== 'void' && !/\breturn\b/.test(cleanBody)) {
    errors.push('Non-void custom functions must contain a return statement.');
  }

  for (const returnMatch of cleanBody.matchAll(/\breturn\b([^;]*);/g)) {
    const expression = returnMatch[1].trim();
    if (signature.returnType === 'void' && expression.length > 0) {
      errors.push('Void custom functions cannot return a value. Use `out` parameters instead.');
    }
    if (signature.returnType !== 'void' && expression.length === 0) {
      errors.push('Non-void custom functions must return one expression.');
    }
    if (hasTopLevelComma(expression)) {
      errors.push('Return can only produce one value. Use `out` parameters for additional outputs.');
    }
  }

  for (const outId of signature.outParamIds) {
    const assigned = new RegExp(`\\b${outId}\\b(?:\\.[xyzwrgba]{1,4})?\\s*(?:=|\\+=|-=|\\*=|\\/=)`).test(cleanBody);
    if (!assigned) {
      errors.push(`Out parameter is never assigned: ${outId}`);
    }
  }
}

export function validateCustomFunctionSource(source: unknown): CustomFunctionValidation {
  const code = typeof source === 'string' ? source.trim() : '';
  const errors: string[] = [];

  if (!code) {
    return { signature: null, errors: ['Function code is required.'] };
  }

  const match = code.match(/\b(float|vec2|vec3|vec4|mat4|void)\s+([A-Za-z_]\w*)\s*\(([\s\S]*?)\)\s*\{/);
  if (!match) {
    return {
      signature: null,
      errors: ['Expected a GLSL function like `vec4 my_node(vec2 uv, float amount) { ... }`.'],
    };
  }

  const returnType = match[1] as CustomFunctionSignature['returnType'];
  const functionName = match[2];
  const paramSource = match[3];
  const openBraceIndex = code.indexOf('{', match.index);
  const closeBraceIndex = findMatchingBrace(code, openBraceIndex);
  const usedIds = new Set<string>();
  const inputs: PortDef[] = [];
  const outputs: PortDef[] = [];
  const outParamIds: string[] = [];

  for (const param of splitParams(paramSource)) {
    const paramMatch = param.match(/^(?:(in|out|inout)\s+)?(float|vec2|vec3|vec4|mat4)\s+([A-Za-z_]\w*)$/);
    if (!paramMatch) {
      errors.push(`Could not parse parameter: ${param}`);
      continue;
    }

    const direction = paramMatch[1] ?? 'in';
    const type = paramMatch[2] as GlslType;
    const rawId = paramMatch[3];
    const id = normalizeId(rawId);

    if (!CUSTOM_TYPE_SET.has(type)) {
      errors.push(`Unsupported parameter type for ${rawId}: ${type}`);
      continue;
    }
    if (direction === 'inout') {
      errors.push(`Parameter ${rawId} uses inout. Use separate input and out parameters instead.`);
      continue;
    }
    if (usedIds.has(id)) {
      errors.push(`Duplicate parameter name: ${rawId}`);
      continue;
    }
    usedIds.add(id);

    const port = { id, label: labelFromId(rawId), type };
    if (direction === 'out') {
      outputs.push(port);
      outParamIds.push(id);
    } else {
      inputs.push(port);
    }
  }

  if (returnType !== 'void') {
    if (usedIds.has('out')) {
      errors.push('Do not name an `out` parameter `out` when the function also returns a value.');
    }
    outputs.unshift({ id: 'out', label: 'Result', type: returnType });
  }

  if (outputs.length === 0) {
    errors.push('Custom functions must return a value or define at least one `out` parameter.');
  }

  const openBraces = (code.match(/\{/g) ?? []).length;
  const closeBraces = (code.match(/\}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    errors.push('Function braces are unbalanced.');
  }
  if (closeBraceIndex < 0) {
    errors.push('Function body is missing a closing brace.');
  } else if (code.slice(closeBraceIndex + 1).trim().length > 0) {
    errors.push('Custom nodes support one function only. Remove extra code after the closing brace.');
  }

  const signature = errors.length
    ? null
    : {
        functionName,
        returnType,
        inputs,
        outputs,
        outParamIds,
      };

  if (signature && closeBraceIndex > openBraceIndex) {
    validateFunctionBody(code.slice(openBraceIndex + 1, closeBraceIndex), signature, errors);
  }

  return {
    signature: errors.length
      ? null
      : signature,
    errors,
  };
}

export function customFunctionSource(data: ShaderNodeData): string {
  return typeof data.customCode === 'string' && data.customCode.trim().length > 0
    ? data.customCode
    : DEFAULT_CUSTOM_FUNCTION_CODE;
}

export function customFunctionNodeDef(data: ShaderNodeData): NodeDef {
  const code = customFunctionSource(data);
  const validation = validateCustomFunctionSource(code);
  const signature = validation.signature;
  return {
    category: 'Custom',
    label: 'Custom Function',
    inputs: signature?.inputs ?? [],
    outputs: signature?.outputs ?? [],
    emitGlsl: (inVars, outVars) => {
      if (!signature) return '';
      const args = signature.inputs.map((input) => inVars[input.id]);
      const lines: string[] = [];

      for (const output of signature.outputs) {
        if (output.id !== 'out' || signature.outParamIds.includes(output.id)) {
          lines.push(`${output.type} ${outVars[output.id]};`);
        }
      }

      if (signature.returnType !== 'void') {
        const outParamArgs = signature.outParamIds.map((id) => outVars[id]);
        lines.push(`${signature.returnType} ${outVars.out} = ${signature.functionName}(${[...args, ...outParamArgs].join(', ')});`);
      } else {
        const outParamArgs = signature.outParamIds.map((id) => outVars[id]);
        lines.push(`${signature.functionName}(${[...args, ...outParamArgs].join(', ')});`);
      }

      return lines.join('\n');
    },
  };
}
