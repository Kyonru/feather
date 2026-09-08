import React, { useState, useEffect, type ReactNode } from 'react';
import { Text, Box, useInput } from 'ink';
import { createHash } from 'node:crypto';
import { useTextInput } from '../hooks/use-text-input.js';

export interface UrlFile {
  name: string;
  url: string;
  sha256: string;
  target: string;
  buffer: Buffer;
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

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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

export function Header({ step, total, title }: { step?: number; total?: number; title?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        {'  '}
        {title ?? 'feather package add'}
      </Text>
      {step !== undefined && total !== undefined && <Text dimColor>{`  Step ${step} of ${total}`}</Text>}
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

export function TextInputStep({
  stepNum,
  total,
  label,
  hint,
  defaultValue = '',
  validate,
  onSubmit,
  title,
}: {
  stepNum?: number;
  total?: number;
  label: string;
  hint?: string;
  defaultValue?: string;
  validate?: (v: string) => string | null;
  onSubmit: (value: string) => void;
  title?: string;
}) {
  const inp = useTextInput(defaultValue);
  const [error, setError] = useState<string | null>(null);

  useInput((char, key) => {
    if (key.return) {
      const err = validate ? validate(inp.value.trim()) : null;
      if (err) {
        setError(err);
        return;
      }
      onSubmit(inp.value.trim());
      return;
    }
    inp.handleKey(char, key);
    setError(null);
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>
        {'  '}
        {label}
      </Text>
      {hint && <Hint>{hint}</Hint>}
      <Box marginTop={1}>
        <Text>{'  '}</Text>
        <CursorText before={inp.before} at={inp.at} after={inp.after} />
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">
            {'  ✖ '}
            {error}
          </Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>{'  ←→ move · Backspace/Delete edit · Enter confirm'}</Text>
      </Box>
    </Box>
  );
}

const WINDOW_SIZE = 10;

function clampWindow(windowStart: number, cursor: number, total: number): number {
  if (cursor < windowStart) return cursor;
  if (cursor >= windowStart + WINDOW_SIZE) return cursor - WINDOW_SIZE + 1;
  return Math.max(0, Math.min(windowStart, total - WINDOW_SIZE));
}

export function SelectStep({
  stepNum,
  total,
  label,
  hint,
  options,
  labels,
  descriptions,
  initialIndex = 0,
  onSelect,
  onCancel,
  title,
}: {
  stepNum?: number;
  total?: number;
  label: string;
  hint?: string;
  options: string[];
  labels?: string[];
  descriptions?: string[];
  initialIndex?: number;
  onSelect: (value: string) => void;
  onCancel?: () => void;
  title?: string;
}) {
  const [cursor, setCursor] = useState(initialIndex);
  const [windowStart, setWindowStart] = useState(() => clampWindow(0, initialIndex, options.length));

  const moveTo = (next: number) => {
    setCursor(next);
    setWindowStart((ws) => clampWindow(ws, next, options.length));
  };

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (key.upArrow || input === 'k') { moveTo(Math.max(0, cursor - 1)); return; }
    if (key.downArrow || input === 'j') { moveTo(Math.min(options.length - 1, cursor + 1)); return; }
    const n = Number(input);
    if (n >= 1 && n <= options.length) { moveTo(n - 1); return; }
    if (key.return) onSelect(options[cursor]!);
  });

  const visibleEnd = Math.min(windowStart + WINDOW_SIZE, options.length);
  const hiddenAbove = windowStart;
  const hiddenBelow = options.length - visibleEnd;

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>
        {'  '}
        {label}
      </Text>
      {hint && <Hint>{hint}</Hint>}
      <Box flexDirection="column" marginTop={1}>
        {hiddenAbove > 0 && (
          <Text dimColor>{'  '}↑ {hiddenAbove} more</Text>
        )}
        {options.slice(windowStart, visibleEnd).map((opt, relIdx) => {
          const i = windowStart + relIdx;
          return (
            <Box key={`${i}:${opt}`} flexDirection="column">
              <Text color={i === cursor ? 'cyan' : undefined}>
                {'  '}
                {i === cursor ? '❯ ' : '  '}
                {labels?.[i] ?? opt}
              </Text>
              {descriptions?.[i] && <Text dimColor>{'    '}{descriptions[i]}</Text>}
            </Box>
          );
        })}
        {hiddenBelow > 0 && (
          <Text dimColor>{'  '}↓ {hiddenBelow} more</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  ↑↓ or j/k navigate · Enter select'}</Text>
      </Box>
    </Box>
  );
}

export function MultiSelectStep({
  stepNum,
  total,
  label,
  hint,
  options,
  labels,
  descriptions,
  initialSelected,
  onSubmit,
  onCancel,
  title,
}: {
  stepNum?: number;
  total?: number;
  label: string;
  hint?: string;
  options: string[];
  labels?: string[];
  descriptions?: string[];
  initialSelected?: Set<number>;
  onSubmit: (selected: string[]) => void;
  onCancel?: () => void;
  title?: string;
}) {
  const [cursor, setCursor] = useState(0);
  const [windowStart, setWindowStart] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(initialSelected ?? new Set(options.map((_, i) => i)));

  const moveTo = (next: number) => {
    setCursor(next);
    setWindowStart((ws) => clampWindow(ws, next, options.length));
  };

  useInput((input, key) => {
    if (key.escape) { onCancel?.(); return; }
    if (key.upArrow || input === 'k') { moveTo(Math.max(0, cursor - 1)); return; }
    if (key.downArrow || input === 'j') { moveTo(Math.min(options.length - 1, cursor + 1)); return; }
    if (input === 'a') { setSelected(new Set(options.map((_, i) => i))); return; }
    if (input === ' ') {
      setSelected((s) => {
        const next = new Set(s);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        next.has(cursor) ? next.delete(cursor) : next.add(cursor);
        return next;
      });
      return;
    }
    if (key.return) {
      const chosen = options.filter((_, i) => selected.has(i));
      if (chosen.length > 0) onSubmit(chosen);
    }
  });

  const visibleEnd = Math.min(windowStart + WINDOW_SIZE, options.length);
  const hiddenAbove = windowStart;
  const hiddenBelow = options.length - visibleEnd;

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>
        {'  '}
        {label}
      </Text>
      {hint && <Hint>{hint}</Hint>}
      <Box flexDirection="column" marginTop={1}>
        {hiddenAbove > 0 && (
          <Text dimColor>{'  '}↑ {hiddenAbove} more</Text>
        )}
        {options.slice(windowStart, visibleEnd).map((opt, relIdx) => {
          const i = windowStart + relIdx;
          return (
            <Box key={`${i}:${opt}`} flexDirection="column">
              <Text color={i === cursor ? 'cyan' : undefined}>
                {'  '}
                {i === cursor ? '❯ ' : '  '}
                {selected.has(i) ? '◉ ' : '○ '}
                {labels?.[i] ?? opt}
              </Text>
              {descriptions?.[i] && <Text dimColor>{'    '}{descriptions[i]}</Text>}
            </Box>
          );
        })}
        {hiddenBelow > 0 && (
          <Text dimColor>{'  '}↓ {hiddenBelow} more</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  ↑↓ or j/k navigate · Space toggle · a select all · Enter confirm'}</Text>
      </Box>
    </Box>
  );
}

export function BooleanStep({
  stepNum,
  total,
  title,
  label,
  hint,
  children,
  defaultYes = true,
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  stepNum?: number;
  total?: number;
  title?: string;
  label: string;
  hint?: string;
  children?: ReactNode;
  defaultYes?: boolean;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [yes, setYes] = useState(defaultYes);

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (input === 'y' || input === 'Y' || key.leftArrow) setYes(true);
    else if (input === 'n' || input === 'N' || key.rightArrow) setYes(false);
    else if (key.return) {
      if (yes) onConfirm();
      else onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold color={tone === 'danger' ? 'red' : undefined}>{'  '}{label}</Text>
      {hint && <Hint>{hint}</Hint>}
      {children}
      <Box marginTop={1}>
        <Text>{'  '}</Text>
        <Text color={yes ? (tone === 'danger' ? 'red' : 'cyan') : undefined}>Yes</Text>
        <Text dimColor> / </Text>
        <Text color={!yes ? 'cyan' : undefined}>No</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  y/← = yes · n/→ = no · Enter confirm'}</Text>
      </Box>
    </Box>
  );
}

export function AutoStep({
  label,
  run,
  onError,
}: {
  label: string;
  run: () => Promise<void>;
  onError: (msg: string) => void;
}) {
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

export function TargetsStep({
  stepNum,
  total,
  id,
  files,
  initialTargets,
  onSubmit,
  title,
}: {
  stepNum?: number;
  total?: number;
  id: string;
  files: string[];
  initialTargets?: Record<string, string>;
  onSubmit: (targets: Record<string, string>) => void;
  title?: string;
}) {
  const defaultTarget = (f: string) => initialTargets?.[f] ?? (files.length === 1 ? `lib/${f}` : `lib/${id}/${f}`);
  const [index, setIndex] = useState(0);
  const [targets, setTargets] = useState<Record<string, string>>(
    Object.fromEntries(files.map((f) => [f, defaultTarget(f)])),
  );
  const inp = useTextInput(defaultTarget(files[0]!));
  const [error, setError] = useState<string | null>(null);
  const file = files[index]!;

  useInput((char, key) => {
    if (key.return) {
      const val = inp.value.trim();
      if (!val) {
        setError('Required');
        return;
      }
      if (!val.endsWith('.lua')) {
        setError('Must end in .lua');
        return;
      }
      const next = { ...targets, [file]: val };
      setTargets(next);
      if (index + 1 < files.length) {
        const nextFile = files[index + 1]!;
        setIndex(index + 1);
        inp.reset(next[nextFile] ?? defaultTarget(nextFile));
        setError(null);
      } else {
        onSubmit(next);
      }
      return;
    }
    inp.handleKey(char, key);
    setError(null);
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>{'  '}Install target paths</Text>
      <Hint>{`File ${index + 1} of ${files.length}: ${file}`}</Hint>
      <Box marginTop={1}>
        <Text>{'  '}</Text>
        <CursorText before={inp.before} at={inp.at} after={inp.after} />
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">
            {'  ✖ '}
            {error}
          </Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>{'  ←→ move · Backspace/Delete edit · Enter confirm'}</Text>
      </Box>
    </Box>
  );
}

export function FileFetchStep({
  url,
  onDone,
  onError,
}: {
  url: string;
  onDone: (sha256: string, buffer: Buffer) => void;
  onError: (msg: string) => void;
}) {
  const [done, setDone] = useState(false);
  const [sha, setSha] = useState('');

  useEffect(() => {
    const run = async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const hash = createHash('sha256').update(buf).digest('hex');
      setSha(hash);
      setDone(true);
      onDone(hash, buf);
    };
    run().catch((err: Error) => onError(err.message));
  }, []);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {done ? <Text color="green">✔ sha256: {sha.slice(0, 16)}…</Text> : <Spinner label={`Fetching ${url}`} />}
    </Box>
  );
}

export function FileMoreStep({
  urlFiles,
  step = 2,
  total,
  onYes,
  onNo,
}: {
  urlFiles: UrlFile[];
  step?: number;
  total?: number;
  onYes: () => void;
  onNo: () => void;
}) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onYes();
    else if (input === 'n' || input === 'N' || key.return || key.escape) onNo();
  });

  return (
    <Box flexDirection="column">
      <Header step={step} total={total} />
      <Text bold>{'  '}Add another file?</Text>
      <Box flexDirection="column" marginTop={1}>
        {urlFiles.map((f) => (
          <Text key={f.url} color="green">
            {'  ✔ '}
            {f.name}
            {'  '}
            <Text dimColor>→ {f.target}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  y = add another · n/Enter = done'}</Text>
      </Box>
    </Box>
  );
}
