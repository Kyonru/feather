/**
 * A restricted parser for Lua files of the form `return { ... }`.
 *
 * Plugin manifests are Lua, and the catalog generator used to read them with
 * regular expressions: a commented-out field was still "found", single quotes
 * and long strings were invisible, and nested tables (`runtime = { ... }`)
 * were cut off at the first `}`. This parses the subset a manifest is allowed
 * to use and rejects everything else by name, instead of guessing:
 *
 * - one `return <value>` statement (optionally followed by `;`)
 * - tables with positional entries, `name = value` and `["key"] = value`
 * - strings ('…', "…" with Lua escapes, [[…]] / [==[…]==] long strings)
 * - numbers (decimal, exponent, hex, unary minus), `true`, `false`, `nil`
 * - `--` line comments and `--[[ … ]]` block comments
 *
 * Function calls, variables, concatenation and arithmetic are errors: a
 * manifest is data, and Node cannot evaluate Lua.
 *
 * A table with only positional entries becomes an array, one with only keyed
 * entries an object, and `{}` an empty array (callers that expect an object
 * accept it). Mixing both in one table is rejected. A key assigned `nil` is
 * omitted, as it would be in Lua.
 */

export class LuaTableParseError extends Error {
  constructor(message, source, offset) {
    const { line, column } = position(source, offset);
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'LuaTableParseError';
    this.line = line;
    this.column = column;
  }
}

function position(source, offset) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < Math.min(offset, source.length); i++) {
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
const KEYWORDS = new Set(['true', 'false', 'nil', 'return']);
const PUNCTUATION = new Set(['{', '}', '[', ']', '=', ',', ';', '-']);

function longBracketLevel(source, index) {
  // Returns the level of a long bracket opening at `index` ("[[" = 0, "[=[" = 1), or -1.
  if (source[index] !== '[') return -1;
  let level = 0;
  let i = index + 1;
  while (source[i] === '=') {
    level++;
    i++;
  }
  return source[i] === '[' ? level : -1;
}

function readLongBracket(source, index, level) {
  const openLength = level + 2;
  const close = `]${'='.repeat(level)}]`;
  const end = source.indexOf(close, index + openLength);
  if (end === -1) throw new LuaTableParseError('Unterminated long bracket', source, index);
  let body = source.slice(index + openLength, end);
  // Lua skips a newline that immediately follows the opening bracket.
  if (body.startsWith('\r\n')) body = body.slice(2);
  else if (body.startsWith('\n')) body = body.slice(1);
  return { value: body, next: end + close.length };
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'", '\n': '\n' };

function readQuoted(source, index) {
  const quote = source[index];
  let out = '';
  let i = index + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === quote) return { value: out, next: i + 1 };
    if (ch === '\n') throw new LuaTableParseError('Unterminated string', source, index);
    if (ch === '\\') {
      const next = source[i + 1];
      if (next in ESCAPES) {
        out += ESCAPES[next];
        i += 2;
        continue;
      }
      if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(source.slice(i + 2, i + 4))) {
        out += String.fromCharCode(parseInt(source.slice(i + 2, i + 4), 16));
        i += 4;
        continue;
      }
      if (next === 'z') {
        i += 2;
        while (/\s/.test(source[i] ?? '')) i++;
        continue;
      }
      const digits = /^\d{1,3}/.exec(source.slice(i + 1));
      if (digits) {
        out += String.fromCharCode(Number(digits[0]));
        i += 1 + digits[0].length;
        continue;
      }
      throw new LuaTableParseError(`Unsupported escape \\${next}`, source, i);
    }
    out += ch;
    i++;
  }
  throw new LuaTableParseError('Unterminated string', source, index);
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '-' && source[i + 1] === '-') {
      const level = longBracketLevel(source, i + 2);
      if (level >= 0) {
        i = readLongBracket(source, i + 2, level).next;
      } else {
        const end = source.indexOf('\n', i);
        i = end === -1 ? source.length : end + 1;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const { value, next } = readQuoted(source, i);
      tokens.push({ kind: 'string', value, offset: i });
      i = next;
      continue;
    }
    if (ch === '[') {
      const level = longBracketLevel(source, i);
      if (level >= 0) {
        const { value, next } = readLongBracket(source, i, level);
        tokens.push({ kind: 'string', value, offset: i });
        i = next;
        continue;
      }
    }
    NUMBER.lastIndex = i;
    const number = NUMBER.exec(source);
    if (number && /[\d.]/.test(ch)) {
      tokens.push({ kind: 'number', value: Number(number[0]), offset: i });
      i += number[0].length;
      continue;
    }
    NAME.lastIndex = i;
    const name = NAME.exec(source);
    if (name) {
      tokens.push({ kind: KEYWORDS.has(name[0]) ? name[0] : 'name', value: name[0], offset: i });
      i += name[0].length;
      continue;
    }
    if (PUNCTUATION.has(ch)) {
      tokens.push({ kind: ch, value: ch, offset: i });
      i++;
      continue;
    }
    throw new LuaTableParseError(`Unexpected character '${ch}' — manifests may only contain a table literal`, source, i);
  }
  tokens.push({ kind: 'eof', value: null, offset: source.length });
  return tokens;
}

export function parseLuaTable(source) {
  const tokens = tokenize(source);
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const expect = (kind) => {
    const token = take();
    if (token.kind !== kind) {
      throw new LuaTableParseError(`Expected '${kind}' but found '${token.value ?? token.kind}'`, source, token.offset);
    }
    return token;
  };

  function parseValue() {
    const token = take();
    switch (token.kind) {
      case 'string':
      case 'number':
        return token.value;
      case 'true':
        return true;
      case 'false':
        return false;
      case 'nil':
        return undefined;
      case '-': {
        const number = expect('number');
        return -number.value;
      }
      case '{':
        return parseTable(token);
      case 'name':
        throw new LuaTableParseError(
          `'${token.value}' is a variable or call; manifest values must be literals`,
          source,
          token.offset,
        );
      default:
        throw new LuaTableParseError(`Unexpected '${token.value ?? token.kind}'`, source, token.offset);
    }
  }

  function parseTable(open) {
    const array = [];
    const object = {};
    let hasKeys = false;
    const seen = new Set();
    const assign = (key, value, offset) => {
      if (seen.has(key)) throw new LuaTableParseError(`Duplicate key '${key}'`, source, offset);
      seen.add(key);
      hasKeys = true;
      if (value !== undefined) object[key] = value;
    };

    while (peek().kind !== '}') {
      const token = peek();
      if (token.kind === 'eof') throw new LuaTableParseError("Unterminated table: missing '}'", source, open.offset);
      if (token.kind === 'name' && tokens[index + 1].kind === '=') {
        take();
        take();
        assign(token.value, parseValue(), token.offset);
      } else if (token.kind === '[') {
        take();
        const key = take();
        if (key.kind !== 'string') {
          throw new LuaTableParseError('Only string keys are supported in [key] = value', source, key.offset);
        }
        expect(']');
        expect('=');
        assign(key.value, parseValue(), key.offset);
      } else {
        const value = parseValue();
        if (value === undefined) {
          throw new LuaTableParseError('nil is not allowed as a list entry', source, token.offset);
        }
        array.push(value);
      }

      const separator = peek();
      if (separator.kind === ',' || separator.kind === ';') {
        take();
      } else if (separator.kind !== '}') {
        throw new LuaTableParseError(
          `Expected ',' or '}' but found '${separator.value ?? separator.kind}'`,
          source,
          separator.offset,
        );
      }
    }
    take();

    if (hasKeys && array.length > 0) {
      throw new LuaTableParseError('A table may not mix list entries and keyed fields', source, open.offset);
    }
    return hasKeys ? object : array;
  }

  expect('return');
  const value = parseValue();
  if (peek().kind === ';') take();
  const rest = peek();
  if (rest.kind !== 'eof') {
    throw new LuaTableParseError(`Unexpected '${rest.value ?? rest.kind}' after the returned value`, source, rest.offset);
  }
  return value;
}
