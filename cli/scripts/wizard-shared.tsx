/**
 * Shared primitives for add-package and update-package wizards.
 */

import { Text, Box, useInput } from 'ink';
import { useState, useEffect } from 'react';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const __dirname = dirname(fileURLToPath(import.meta.url));
export const root = resolve(__dirname, '../..');
export const packagesDir = join(root, 'packages');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  target: string;
  sha256: string;
}

export interface FormData {
  id: string;
  repo: string;
  homepage: string;
  license: string;
  tag: string;
  baseUrl: string;
  trust: 'verified' | 'known';
  description: string;
  tags: string[];
  selectedFiles: string[];
  targetMap: Record<string, string>;
  require: string;
  example: string;
  files: FileEntry[];
}

export type InkKey = Parameters<Parameters<typeof useInput>[0]>[1];

// ─── Header & Hint ───────────────────────────────────────────────────────────

export function Header({ step, total, title }: { step: number; total: number; title?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        {'  '}{title ?? 'feather package:add'}
      </Text>
      <Text dimColor>{`  Step ${step} of ${total}`}</Text>
    </Box>
  );
}

export function Hint({ children }: { children: string }) {
  return (
    <Text dimColor>
      {'  '}
      {children}
    </Text>
  );
}

// ─── Cursor-aware text input ──────────────────────────────────────────────────

export function useTextInput(initial: string) {
  const [value, setValue] = useState(initial);
  const [cursor, setCursor] = useState(initial.length);

  const reset = (next: string) => {
    setValue(next);
    setCursor(next.length);
  };

  const handleKey = (input: string, key: InkKey) => {
    if (key.leftArrow) { setCursor((c) => Math.max(0, c - 1)); return true; }
    if (key.rightArrow) { setCursor((c) => Math.min(value.length, c + 1)); return true; }
    if (key.backspace) {
      if (cursor === 0) return true;
      const pos = cursor;
      setValue((v) => v.slice(0, pos - 1) + v.slice(pos));
      setCursor((c) => c - 1);
      return true;
    }
    if (key.delete) {
      const pos = cursor;
      setValue((v) => v.slice(0, pos) + v.slice(pos + 1));
      return true;
    }
    if (!key.ctrl && !key.meta && input) {
      const pos = cursor;
      setValue((v) => v.slice(0, pos) + input + v.slice(pos));
      setCursor((c) => c + 1);
      return true;
    }
    return false;
  };

  return {
    value,
    cursor,
    reset,
    handleKey,
    before: value.slice(0, cursor),
    at: value[cursor] ?? '',
    after: value.slice(cursor + 1),
  };
}

export function CursorText({ before, at, after }: { before: string; at: string; after: string }) {
  return (
    <Box>
      <Text color="cyan">{before}</Text>
      <Text inverse>{at || ' '}</Text>
      <Text color="cyan">{after}</Text>
    </Box>
  );
}

// ─── TextInputStep ────────────────────────────────────────────────────────────

interface TextInputStepProps {
  stepNum: number;
  total: number;
  label: string;
  hint?: string;
  defaultValue?: string;
  validate?: (v: string) => string | null;
  onSubmit: (value: string) => void;
  title?: string;
}

export function TextInputStep({ stepNum, total, label, hint, defaultValue = '', validate, onSubmit, title }: TextInputStepProps) {
  const input = useTextInput(defaultValue);
  const [error, setError] = useState<string | null>(null);

  useInput((char, key) => {
    if (key.return) {
      const err = validate ? validate(input.value.trim()) : null;
      if (err) { setError(err); return; }
      onSubmit(input.value.trim());
      return;
    }
    input.handleKey(char, key);
    setError(null);
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>{'  '}{label}</Text>
      {hint && <Hint>{hint}</Hint>}
      <Box marginTop={1}>
        <Text>{'  '}</Text>
        <CursorText before={input.before} at={input.at} after={input.after} />
      </Box>
      {error && <Box marginTop={1}><Text color="red">{'  ✖ '}{error}</Text></Box>}
      <Box marginTop={1}>
        <Text dimColor>{'  ←→ move · Backspace/Delete edit · Enter confirm'}</Text>
      </Box>
    </Box>
  );
}

// ─── SelectStep ───────────────────────────────────────────────────────────────

interface SelectStepProps {
  stepNum: number;
  total: number;
  label: string;
  hint?: string;
  options: string[];
  initialIndex?: number;
  onSelect: (value: string) => void;
  title?: string;
}

export function SelectStep({ stepNum, total, label, hint, options, initialIndex = 0, onSelect, title }: SelectStepProps) {
  const [cursor, setCursor] = useState(initialIndex);

  useInput((_, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(options.length - 1, c + 1));
    if (key.return) onSelect(options[cursor]!);
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>{'  '}{label}</Text>
      {hint && <Hint>{hint}</Hint>}
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => (
          <Box key={opt}>
            <Text color={i === cursor ? 'cyan' : undefined}>
              {'  '}{i === cursor ? '❯ ' : '  '}{opt}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  ↑↓ navigate · Enter to select'}</Text>
      </Box>
    </Box>
  );
}

// ─── MultiSelectStep ──────────────────────────────────────────────────────────

interface MultiSelectStepProps {
  stepNum: number;
  total: number;
  label: string;
  hint?: string;
  options: string[];
  initialSelected?: Set<number>;
  onSubmit: (selected: string[]) => void;
  title?: string;
}

export function MultiSelectStep({ stepNum, total, label, hint, options, initialSelected, onSubmit, title }: MultiSelectStepProps) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(
    initialSelected ?? new Set(options.map((_, i) => i)),
  );

  useInput((input, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(options.length - 1, c + 1));
    if (input === ' ') {
      setSelected((s) => {
        const next = new Set(s);
        next.has(cursor) ? next.delete(cursor) : next.add(cursor);
        return next;
      });
    }
    if (key.return) {
      const chosen = options.filter((_, i) => selected.has(i));
      if (chosen.length > 0) onSubmit(chosen);
    }
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>{'  '}{label}</Text>
      {hint && <Hint>{hint}</Hint>}
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => (
          <Box key={opt}>
            <Text color={i === cursor ? 'cyan' : undefined}>
              {'  '}{i === cursor ? '❯ ' : '  '}
              {selected.has(i) ? '◉ ' : '○ '}
              {opt}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  ↑↓ navigate · Space toggle · Enter confirm'}</Text>
      </Box>
    </Box>
  );
}

// ─── Spinner & AutoStep ───────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function Spinner({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);

  return (
    <Box>
      <Text color="cyan">{SPINNER_FRAMES[frame]} </Text>
      <Text>{label}</Text>
    </Box>
  );
}

interface AutoStepProps {
  label: string;
  run: () => Promise<void>;
  onError: (msg: string) => void;
}

export function AutoStep({ label, run, onError }: AutoStepProps) {
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running');
  const [error, setError] = useState('');

  useEffect(() => {
    run()
      .then(() => setStatus('done'))
      .catch((err: Error) => {
        setError(err.message);
        setStatus('error');
        onError(err.message);
      });
  }, []);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {status === 'running' && <Spinner label={label} />}
      {status === 'done' && <Text color="green">✔ {label}</Text>}
      {status === 'error' && <Text color="red">✖ {error}</Text>}
    </Box>
  );
}

// ─── TargetsStep ──────────────────────────────────────────────────────────────

interface TargetsStepProps {
  stepNum: number;
  total: number;
  id: string;
  files: string[];
  initialTargets?: Record<string, string>;
  onSubmit: (targets: Record<string, string>) => void;
  title?: string;
}

export function TargetsStep({ stepNum, total, id, files, initialTargets, onSubmit, title }: TargetsStepProps) {
  const defaultTarget = (f: string) =>
    initialTargets?.[f] ?? (files.length === 1 ? `lib/${f}` : `lib/${id}/${f}`);

  const [index, setIndex] = useState(0);
  const [targets, setTargets] = useState<Record<string, string>>(
    Object.fromEntries(files.map((f) => [f, defaultTarget(f)])),
  );
  const textInput = useTextInput(defaultTarget(files[0]!));
  const [error, setError] = useState<string | null>(null);

  const file = files[index]!;

  const advance = () => {
    const val = textInput.value.trim();
    if (!val) { setError('Target path is required'); return; }
    if (!val.endsWith('.lua')) { setError('Target path must end in .lua'); return; }
    const next = { ...targets, [file]: val };
    setTargets(next);
    if (index + 1 < files.length) {
      const nextFile = files[index + 1]!;
      setIndex(index + 1);
      textInput.reset(next[nextFile] ?? defaultTarget(nextFile));
      setError(null);
    } else {
      onSubmit(next);
    }
  };

  useInput((char, key) => {
    if (key.return) { advance(); return; }
    textInput.handleKey(char, key);
    setError(null);
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>{'  '}Install target paths</Text>
      <Hint>{`File ${index + 1} of ${files.length}: ${file}`}</Hint>
      <Box marginTop={1}>
        <Text>{'  '}</Text>
        <CursorText before={textInput.before} at={textInput.at} after={textInput.after} />
      </Box>
      {error && <Box marginTop={1}><Text color="red">{'  ✖ '}{error}</Text></Box>}
      <Box marginTop={1}>
        <Text dimColor>{'  ←→ move · Backspace/Delete edit · Enter confirm'}</Text>
      </Box>
    </Box>
  );
}

// ─── ReviewStep ───────────────────────────────────────────────────────────────

interface ReviewStepProps {
  stepNum: number;
  total: number;
  json: string;
  onConfirm: () => void;
  onAbort: () => void;
  title?: string;
}

export function ReviewStep({ stepNum, total, json, onConfirm, onAbort, title }: ReviewStepProps) {
  useInput((input, key) => {
    if (key.return || input === 'y' || input === 'Y') onConfirm();
    if (input === 'n' || input === 'N' || key.escape) onAbort();
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>{'  '}Review generated package</Text>
      <Box marginTop={1} flexDirection="column">
        {json.split('\n').map((line, i) => (
          <Text key={i}>{'  '}{line}</Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  '}y/Enter to write · n/Esc to abort</Text>
      </Box>
    </Box>
  );
}

// ─── ChecksumStep ─────────────────────────────────────────────────────────────

interface ChecksumStepProps {
  files: Array<{ name: string; url: string }>;
  onDone: (checksums: Record<string, string>) => void;
  onError: (msg: string) => void;
}

export function ChecksumStep({ files, onDone, onError }: ChecksumStepProps) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(files[0]?.name ?? '');

  useEffect(() => {
    const run = async () => {
      const results: Record<string, string> = {};
      for (const f of files) {
        setCurrent(f.name);
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${f.url}`);
        const buf = await res.arrayBuffer();
        const hash = createHash('sha256').update(Buffer.from(buf)).digest('hex');
        results[f.name] = hash;
        setDone((d) => ({ ...d, [f.name]: hash }));
      }
      onDone(results);
    };
    run().catch((err: Error) => onError(err.message));
  }, []);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text bold>Computing SHA-256 checksums…</Text>
      {files.map((f) => {
        const sha = done[f.name];
        const isActive = f.name === current && !sha;
        return (
          <Box key={f.name}>
            {sha ? (
              <Text color="green">{'  ✔ '}{f.name}</Text>
            ) : isActive ? (
              <Box><Text color="cyan">{'  '}</Text><Spinner label={f.name} /></Box>
            ) : (
              <Text dimColor>{'  ○ '}{f.name}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

// ─── GitHub API helpers ───────────────────────────────────────────────────────

const GH_HEADERS = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

export async function fetchRepoMeta(repo: string): Promise<{ tags: string[]; license: string }> {
  const [tagsRes, repoRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}/tags?per_page=20`, { headers: GH_HEADERS }),
    fetch(`https://api.github.com/repos/${repo}`, { headers: GH_HEADERS }),
  ]);
  if (!tagsRes.ok) throw new Error(`GitHub API ${tagsRes.status} for ${repo}/tags`);
  if (!repoRes.ok) throw new Error(`GitHub API ${repoRes.status} for ${repo}`);
  const [tagsData, repoData] = await Promise.all([
    tagsRes.json() as Promise<Array<{ name: string }>>,
    repoRes.json() as Promise<{ license?: { spdx_id?: string } }>,
  ]);
  return { tags: tagsData.map((t) => t.name), license: repoData.license?.spdx_id ?? 'unknown' };
}

export async function fetchLuaFiles(repo: string, tag: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${tag}?recursive=1`, {
    headers: GH_HEADERS,
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${repo}@${tag}`);
  const data = (await res.json()) as { tree: Array<{ path: string; type: string }> };
  return data.tree
    .filter((node) => node.type === 'blob' && node.path.endsWith('.lua'))
    .map((node) => node.path)
    .sort();
}

// ─── Registry regeneration ────────────────────────────────────────────────────

export function buildPackageJson(data: FormData): object {
  return {
    type: 'love2d-library',
    trust: data.trust,
    description: data.description,
    tags: data.tags,
    homepage: data.homepage,
    license: data.license,
    source: { repo: data.repo, tag: data.tag, baseUrl: data.baseUrl },
    install: {
      files: data.files.map((f) => ({ name: f.name, sha256: f.sha256, target: f.target })),
    },
    require: data.require,
    example: data.example,
  };
}
