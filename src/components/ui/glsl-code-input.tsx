import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { clike } from '@codemirror/legacy-modes/mode/clike';
import { EditorState, type EditorSelection, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  placeholder as editorPlaceholder,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { useSyntaxTheme } from '@/hooks/use-theme';
import { cn } from '@/utils/styles';

interface GlslCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  maxHeight?: number;
}

const editorFont = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const minHeight = 180;
const functionPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?=\()/g;
const parameterPattern = /\b(?:const|in|out|inout|highp|mediump|lowp)?\s*([A-Za-z_][A-Za-z0-9_]*)\s+(?:[A-Za-z_][A-Za-z0-9_]*\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?/g;

const glslKeywords = [
  'attribute',
  'break',
  'case',
  'centroid',
  'const',
  'continue',
  'default',
  'discard',
  'do',
  'else',
  'extern',
  'flat',
  'for',
  'highp',
  'if',
  'in',
  'inout',
  'invariant',
  'layout',
  'lowp',
  'mediump',
  'noperspective',
  'out',
  'precision',
  'return',
  'smooth',
  'struct',
  'switch',
  'uniform',
  'varying',
  'while',
];

const glslTypes = [
  'ArrayImage',
  'Canvas',
  'CubeImage',
  'Image',
  'Video',
  'VolumeImage',
  'bool',
  'bvec2',
  'bvec3',
  'bvec4',
  'float',
  'int',
  'ivec2',
  'ivec3',
  'ivec4',
  'mat2',
  'mat2x2',
  'mat2x3',
  'mat2x4',
  'mat3',
  'mat3x2',
  'mat3x3',
  'mat3x4',
  'mat4',
  'mat4x2',
  'mat4x3',
  'mat4x4',
  'sampler1D',
  'sampler1DShadow',
  'sampler2D',
  'sampler2DArray',
  'sampler2DShadow',
  'sampler3D',
  'samplerCube',
  'samplerCubeShadow',
  'uint',
  'uvec2',
  'uvec3',
  'uvec4',
  'vec2',
  'vec3',
  'vec4',
  'void',
];

const glslBuiltins = [
  'Texel',
  'abs',
  'acos',
  'all',
  'any',
  'asin',
  'atan',
  'ceil',
  'clamp',
  'cos',
  'cross',
  'dFdx',
  'dFdy',
  'degrees',
  'distance',
  'dot',
  'equal',
  'exp',
  'exp2',
  'faceforward',
  'floor',
  'fract',
  'ftransform',
  'fwidth',
  'greaterThan',
  'greaterThanEqual',
  'inversesqrt',
  'length',
  'lessThan',
  'lessThanEqual',
  'log',
  'log2',
  'matrixCompMult',
  'max',
  'min',
  'mix',
  'mod',
  'noise1',
  'noise2',
  'noise3',
  'noise4',
  'normalize',
  'not',
  'notEqual',
  'pow',
  'radians',
  'reflect',
  'refract',
  'shadow1D',
  'shadow1DLod',
  'shadow1DProj',
  'shadow1DProjLod',
  'shadow2D',
  'shadow2DLod',
  'shadow2DProj',
  'shadow2DProjLod',
  'sign',
  'sin',
  'smoothstep',
  'sqrt',
  'step',
  'tan',
  'texture',
  'texture1D',
  'texture1DLod',
  'texture1DProj',
  'texture1DProjLod',
  'texture2D',
  'texture2DLod',
  'texture2DProj',
  'texture2DProjLod',
  'texture3D',
  'texture3DLod',
  'texture3DProj',
  'texture3DProjLod',
  'textureCube',
  'textureCubeLod',
];

const glslAtoms = [
  'false',
  'gl_BackColor',
  'gl_BackLightModelProduct',
  'gl_BackMaterial',
  'gl_BackSecondaryColor',
  'gl_ClipPlane',
  'gl_ClipVertex',
  'gl_DepthRange',
  'gl_EyePlaneQ',
  'gl_EyePlaneR',
  'gl_EyePlaneS',
  'gl_EyePlaneT',
  'gl_FogCoord',
  'gl_FogFragCoord',
  'gl_FogParameters',
  'gl_FragColor',
  'gl_FragCoord',
  'gl_FragData',
  'gl_FragDepth',
  'gl_FrontColor',
  'gl_FrontFacing',
  'gl_FrontLightModelProduct',
  'gl_FrontMaterial',
  'gl_FrontSecondaryColor',
  'gl_LightModel',
  'gl_LightSource',
  'gl_MaxClipPlanes',
  'gl_MaxCombineTextureImageUnits',
  'gl_MaxDrawBuffers',
  'gl_MaxFragmentUniformComponents',
  'gl_MaxLights',
  'gl_MaxTextureCoords',
  'gl_MaxTextureImageUnits',
  'gl_MaxTextureUnits',
  'gl_MaxVaryingFloats',
  'gl_MaxVertexAttribs',
  'gl_MaxVertexTextureImageUnits',
  'gl_MaxVertexUniformComponents',
  'gl_ModelViewMatrix',
  'gl_ModelViewMatrixInverse',
  'gl_ModelViewMatrixInverseTranspose',
  'gl_ModelViewProjectionMatrix',
  'gl_ModelViewProjectionMatrixInverse',
  'gl_ModelViewProjectionMatrixInverseTranspose',
  'gl_MultiTexCoord0',
  'gl_MultiTexCoord1',
  'gl_MultiTexCoord2',
  'gl_MultiTexCoord3',
  'gl_MultiTexCoord4',
  'gl_MultiTexCoord5',
  'gl_MultiTexCoord6',
  'gl_MultiTexCoord7',
  'gl_Normal',
  'gl_NormalMatrix',
  'gl_NormalScale',
  'gl_Point',
  'gl_PointCoord',
  'gl_PointSize',
  'gl_Position',
  'gl_ProjectionMatrix',
  'gl_ProjectionMatrixInverse',
  'gl_ProjectionMatrixInverseTranspose',
  'gl_SecondaryColor',
  'gl_TexCoord',
  'gl_TextureColor',
  'gl_TextureMatrix',
  'gl_TextureMatrixInverseTranspose',
  'gl_TextureMatrixTranspose',
  'gl_Vertex',
  'love_Canvases',
  'love_PixelCoord',
  'love_ScreenSize',
  'true',
];

const controlFunctionNames = new Set(['do', 'else', 'for', 'if', 'return', 'switch', 'while']);
const typeNames = new Set(glslTypes);
const modifierNames = new Set(['const', 'in', 'out', 'inout', 'highp', 'mediump', 'lowp']);

const functionDecoration = Decoration.mark({ class: 'cm-glsl-function' });
const parameterDecoration = Decoration.mark({ class: 'cm-glsl-parameter' });
const loveShaderLanguage = StreamLanguage.define(clike({
  name: 'love-shader',
  keywords: words(glslKeywords),
  types: words(glslTypes),
  builtin: words(glslBuiltins),
  atoms: words(glslAtoms),
  blockKeywords: words(['do', 'else', 'for', 'if', 'struct', 'switch', 'while']),
  indentSwitch: false,
  hooks: {
    '#': (stream: { skipToEnd: () => void }) => {
      stream.skipToEnd();
      return 'meta';
    },
  },
}));

type GlslTokenColors = {
  builtin: string;
  comment: string;
  declaration: string;
  function: string;
  invalid: string;
  keyword: string;
  number: string;
  parameter: string;
  property: string;
  punctuation: string;
  string: string;
  type: string;
  variable: string;
};

function syntaxColor(theme: Record<string, CSSProperties>, key: string, fallback: string): string {
  const color = theme[key]?.color;
  return typeof color === 'string' ? color : fallback;
}

function mixColors(base: string, basePercent: number, accent: string): string {
  return `color-mix(in srgb, ${base} ${basePercent}%, ${accent})`;
}

function getGlslTokenColors(theme: Record<string, CSSProperties>): GlslTokenColors {
  const text = syntaxColor(theme, 'hljs-params', 'var(--foreground)');
  const support = syntaxColor(theme, 'hljs-built_in', 'var(--chart-1)');
  const attribute = syntaxColor(theme, 'hljs-attribute', 'var(--chart-3)');

  return {
    builtin: support,
    comment: syntaxColor(theme, 'hljs-comment', 'var(--muted-foreground)'),
    declaration: mixColors(text, 78, support),
    function: 'var(--glsl-function-call)',
    invalid: syntaxColor(theme, 'hljs-deletion', 'var(--destructive)'),
    keyword: syntaxColor(theme, 'hljs-keyword', 'var(--primary)'),
    number: syntaxColor(theme, 'hljs-number', 'var(--chart-4)'),
    parameter: mixColors(attribute, 76, text),
    property: mixColors(support, 68, text),
    punctuation: syntaxColor(theme, 'hljs-meta', 'var(--muted-foreground)'),
    string: syntaxColor(theme, 'hljs-string', 'var(--chart-2)'),
    type: mixColors(support, 86, text),
    variable: text,
  };
}

function words(values: string[]): Record<string, boolean> {
  return Object.fromEntries(values.map((value) => [value, true]));
}

function findDeclarationFunctionNameRange(code: string): { from: number; to: number } | null {
  const match = /\b(?:const\s+)?(?:(?:highp|mediump|lowp)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(code);
  const returnType = match?.[1];
  const functionName = match?.[2];
  if (!returnType || !functionName || !typeNames.has(returnType)) return null;

  const matchText = match[0];
  const nameOffset = matchText.lastIndexOf(functionName);
  if (nameOffset === -1) return null;

  const from = (match.index ?? 0) + nameOffset;
  return { from, to: from + functionName.length };
}

function maskNonCode(line: string, blockCommentOpen: boolean): { text: string; blockCommentOpen: boolean } {
  let masked = '';
  let i = 0;
  let inBlockComment = blockCommentOpen;
  let quote: string | null = null;
  let escaped = false;

  while (i < line.length) {
    const char = line[i];
    const next = line[i + 1];

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        masked += '  ';
        i += 2;
        inBlockComment = false;
      } else {
        masked += ' ';
        i += 1;
      }
      continue;
    }

    if (quote) {
      masked += ' ';
      if (!escaped && char === quote) {
        quote = null;
      }
      escaped = !escaped && char === '\\';
      i += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      masked += ' '.repeat(line.length - i);
      break;
    }

    if (char === '/' && next === '*') {
      masked += '  ';
      i += 2;
      inBlockComment = true;
      continue;
    }

    if (char === '"' || char === "'") {
      masked += ' ';
      quote = char;
      escaped = false;
      i += 1;
      continue;
    }

    masked += char;
    i += 1;
  }

  return { text: masked, blockCommentOpen: inBlockComment };
}

function buildGlslSemanticDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  let blockCommentOpen = false;

  for (const { from, to } of view.visibleRanges) {
    let position = from;
    while (position <= to) {
      const line = view.state.doc.lineAt(position);
      const maskedLine = maskNonCode(line.text, blockCommentOpen);
      const code = maskedLine.text;
      blockCommentOpen = maskedLine.blockCommentOpen;
      const declarationFunctionNameRange = findDeclarationFunctionNameRange(code);

      functionPattern.lastIndex = 0;
      for (const match of code.matchAll(functionPattern)) {
        const name = match[1];
        const index = match.index ?? 0;
        if (!name || controlFunctionNames.has(name)) continue;
        if (
          declarationFunctionNameRange &&
          index === declarationFunctionNameRange.from &&
          index + name.length === declarationFunctionNameRange.to
        ) {
          continue;
        }
        ranges.push(functionDecoration.range(line.from + index, line.from + index + name.length));
      }

      const signatureStart = code.search(/\b[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/);
      if (signatureStart !== -1) {
        const openParen = code.indexOf('(', signatureStart);
        const closeParen = openParen === -1 ? -1 : code.indexOf(')', openParen + 1);
        if (openParen !== -1 && closeParen !== -1) {
          const params = code.slice(openParen + 1, closeParen);
          parameterPattern.lastIndex = 0;
          for (const match of params.matchAll(parameterPattern)) {
            const typeName = match[1];
            const parameterName = match[2];
            if (!typeName || !parameterName || !typeNames.has(typeName) || modifierNames.has(parameterName)) continue;
            const tokenStart = openParen + 1 + (match.index ?? 0);
            const parameterOffset = match[0].lastIndexOf(parameterName);
            if (parameterOffset === -1) continue;
            const start = line.from + tokenStart + parameterOffset;
            ranges.push(parameterDecoration.range(start, start + parameterName.length));
          }
        }
      }

      position = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

const glslSemanticHighlighting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildGlslSemanticDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildGlslSemanticDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

export function GlslCodeInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  maxHeight = 420,
}: GlslCodeInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const syncingExternalValueRef = useRef(false);
  const lastStateRef = useRef<{ doc: string; selection: EditorSelection } | null>(null);
  const syntaxTheme = useSyntaxTheme() as Record<string, CSSProperties>;
  const tokenColors = useMemo(() => getGlslTokenColors(syntaxTheme), [syntaxTheme]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editorTheme = useMemo(
    () =>
      EditorView.theme({
        '&': {
          '--glsl-function-call': '#9a6700',
          minHeight: `${minHeight}px`,
          maxHeight: `${maxHeight}px`,
          backgroundColor: 'transparent',
          color: 'var(--foreground)',
          fontFamily: editorFont,
          fontSize: '0.75rem',
          lineHeight: '1.55',
        },
        '&.cm-focused': {
          outline: 'none',
        },
        '.dark &': {
          '--glsl-function-call': '#f2cc60',
        },
        '.cm-scroller': {
          minHeight: `${minHeight}px`,
          maxHeight: `${maxHeight}px`,
          overflow: 'auto',
          fontFamily: 'inherit',
          lineHeight: 'inherit',
        },
        '.cm-content': {
          minHeight: `${minHeight}px`,
          padding: '10px 12px',
          caretColor: 'var(--foreground)',
        },
        '.cm-line': {
          padding: 0,
        },
        '.cm-cursor': {
          borderLeftColor: 'var(--foreground)',
        },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
          backgroundColor: 'color-mix(in srgb, var(--primary) 28%, transparent)',
        },
        '.cm-placeholder': {
          color: 'var(--muted-foreground)',
        },
        '.cm-matchingBracket': {
          outline: '1px solid var(--ring)',
          backgroundColor: 'color-mix(in srgb, var(--accent) 45%, transparent)',
        },
        '.cm-content .cm-glsl-function': {
          color: tokenColors.function,
          fontWeight: 600,
        },
        '.cm-content .cm-glsl-function *': {
          color: tokenColors.function,
          fontWeight: 600,
        },
        '.cm-content .cm-glsl-parameter': {
          color: tokenColors.parameter,
          fontStyle: 'italic',
        },
      }),
    [maxHeight, tokenColors],
  );

  const highlightStyle = useMemo(
    () =>
      HighlightStyle.define([
        { tag: t.comment, color: tokenColors.comment },
        { tag: t.string, color: tokenColors.string },
        { tag: [t.number, t.bool, t.atom, t.null], color: tokenColors.number },
        {
          tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier, t.operatorKeyword],
          color: tokenColors.keyword,
          fontWeight: 600,
        },
        { tag: [t.typeName, t.className], color: tokenColors.type },
        {
          tag: [t.standard(t.variableName), t.standard(t.name)],
          color: tokenColors.builtin,
          fontWeight: 500,
        },
        {
          tag: [t.function(t.variableName), t.function(t.propertyName)],
          color: tokenColors.function,
          fontWeight: 600,
        },
        {
          tag: t.definition(t.variableName),
          color: tokenColors.declaration,
          fontWeight: 600,
        },
        { tag: t.propertyName, color: tokenColors.property },
        { tag: [t.variableName, t.name], color: tokenColors.variable },
        { tag: [t.operator, t.punctuation], color: tokenColors.punctuation },
        { tag: [t.meta, t.processingInstruction], color: tokenColors.punctuation },
        { tag: t.invalid, color: tokenColors.invalid },
      ]),
    [tokenColors],
  );

  const extensions = useMemo<Extension[]>(
    () => [
      history(),
      loveShaderLanguage,
      syntaxHighlighting(highlightStyle),
      bracketMatching(),
      indentOnInput(),
      EditorView.lineWrapping,
      editorTheme,
      glslSemanticHighlighting,
      placeholder ? editorPlaceholder(placeholder) : [],
      keymap.of([indentWithTab, ...historyKeymap, ...defaultKeymap]),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (!update.docChanged || syncingExternalValueRef.current) return;
        onChangeRef.current(update.state.doc.toString());
      }),
    ],
    [editorTheme, highlightStyle, placeholder],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previousState = lastStateRef.current;
    const state = EditorState.create({
      doc: previousState?.doc ?? value,
      selection: previousState?.selection,
      extensions,
    });
    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    return () => {
      lastStateRef.current = {
        doc: view.state.doc.toString(),
        selection: view.state.selection,
      };
      view.destroy();
      if (viewRef.current === view) {
        viewRef.current = null;
      }
    };
  }, [extensions]);

  useEffect(() => {
    if (autoFocus) {
      viewRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    syncingExternalValueRef.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
    syncingExternalValueRef.current = false;
  }, [value]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border bg-background shadow-sm',
        'focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
      ref={containerRef}
    />
  );
}
