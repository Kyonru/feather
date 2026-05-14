import { render, Text, Box, useInput, useApp } from 'ink';
import { useState, useEffect } from 'react';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Lockfile } from '../lib/package/lockfile.js';
import { addToLockfile, writeLockfile } from '../lib/package/lockfile.js';

// ── Local ink primitives (mirrors wizard-shared for consistent UX) ──────────

type InkKey = Parameters<Parameters<typeof useInput>[0]>[1];

function useTextInput(initial: string) {
  const [value, setValue] = useState(initial);
  const [cursor, setCursor] = useState(initial.length);

  const reset = (next: string) => { setValue(next); setCursor(next.length); };

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

  return { value, cursor, reset, handleKey, before: value.slice(0, cursor), at: value[cursor] ?? '', after: value.slice(cursor + 1) };
}

function CursorText({ before, at, after }: { before: string; at: string; after: string }) {
  return (
    <Box>
      <Text color="cyan">{before}</Text>
      <Text inverse>{at || ' '}</Text>
      <Text color="cyan">{after}</Text>
    </Box>
  );
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function Spinner({ label }: { label: string }) {
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

function Header({ step, total }: { step: number; total: number }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">{'  '}feather package add</Text>
      <Text dimColor>{`  Step ${step} of ${total}`}</Text>
    </Box>
  );
}

function Hint({ children }: { children: string }) {
  return <Text dimColor>{'  '}{children}</Text>;
}

// ── Wizard types ─────────────────────────────────────────────────────────────

interface UrlFile {
  name: string;
  url: string;
  sha256: string;
  target: string;
  buffer: Buffer;
}

type Step = 'id' | 'file-url' | 'file-fetch' | 'file-target' | 'file-more' | 'require' | 'confirm' | 'write' | 'done' | 'error';

const TOTAL = 5;

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split('/').filter(Boolean).pop() ?? 'file.lua';
  } catch {
    return url.split('/').pop() ?? 'file.lua';
  }
}

// ── Step components ──────────────────────────────────────────────────────────

function TextInputStep({
  stepNum,
  label,
  hint,
  defaultValue = '',
  validate,
  onSubmit,
}: {
  stepNum: number;
  label: string;
  hint?: string;
  defaultValue?: string;
  validate?: (v: string) => string | null;
  onSubmit: (value: string) => void;
}) {
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
      <Header step={stepNum} total={TOTAL} />
      <Text bold>{'  '}{label}</Text>
      {hint && <Hint>{hint}</Hint>}
      <Box marginTop={1}><Text>{'  '}</Text><CursorText before={input.before} at={input.at} after={input.after} /></Box>
      {error && <Box marginTop={1}><Text color="red">{'  ✖ '}{error}</Text></Box>}
      <Box marginTop={1}><Text dimColor>{'  ←→ move · Backspace/Delete edit · Enter confirm'}</Text></Box>
    </Box>
  );
}

function FileFetchStep({
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
      {done
        ? <Text color="green">✔ sha256: {sha.slice(0, 16)}…</Text>
        : <Spinner label={`Fetching ${url}`} />}
    </Box>
  );
}

function FileMoreStep({
  urlFiles,
  onYes,
  onNo,
}: {
  urlFiles: UrlFile[];
  onYes: () => void;
  onNo: () => void;
}) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onYes();
    else if (input === 'n' || input === 'N' || key.return || key.escape) onNo();
  });

  return (
    <Box flexDirection="column">
      <Header step={2} total={TOTAL} />
      <Text bold>{'  '}Add another file?</Text>
      <Box flexDirection="column" marginTop={1}>
        {urlFiles.map((f) => (
          <Text key={f.url} color="green">{'  ✔ '}{f.name}{'  '}<Text dimColor>→ {f.target}</Text></Text>
        ))}
      </Box>
      <Box marginTop={1}><Text dimColor>{'  y = add another · n/Enter = done'}</Text></Box>
    </Box>
  );
}

function ConfirmStep({
  id,
  urlFiles,
  onConfirm,
  onAbort,
}: {
  id: string;
  urlFiles: UrlFile[];
  onConfirm: () => void;
  onAbort: () => void;
}) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y' || key.return) onConfirm();
    else if (input === 'n' || input === 'N' || key.escape) onAbort();
  });

  return (
    <Box flexDirection="column">
      <Header step={4} total={TOTAL} />
      <Text bold>{'  '}Review before installing</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>{'  '}Package:  <Text color="cyan">{id}</Text></Text>
        <Text>{'  '}Trust:    <Text color="yellow">experimental ⚠</Text></Text>
        <Text dimColor>{'  '}These files have NOT been reviewed by the Feather team.</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {urlFiles.map((f) => (
          <Box key={f.url} flexDirection="column">
            <Text>{'  '}{f.name}  <Text dimColor>→ {f.target}</Text></Text>
            <Text dimColor>{'    sha256: '}{f.sha256.slice(0, 24)}…</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}><Text dimColor>{'  y/Enter = install · n/Esc = abort'}</Text></Box>
    </Box>
  );
}

function WriteStep({
  id,
  urlFiles,
  require: requirePath,
  projectDir,
  lockfile,
  onDone,
  onError,
}: {
  id: string;
  urlFiles: UrlFile[];
  require: string;
  projectDir: string;
  lockfile: Lockfile;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running');
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      for (const f of urlFiles) {
        const abs = join(projectDir, f.target);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, f.buffer);
      }
      addToLockfile(lockfile, id, {
        version: 'url',
        trust: 'experimental',
        source: { url: urlFiles[0]!.url },
        files: urlFiles.map((f) => ({ name: f.name, url: f.url, target: f.target, sha256: f.sha256 })),
      });
      writeLockfile(projectDir, lockfile);
      setStatus('done');
      onDone();
    };
    run().catch((err: Error) => {
      setError(err.message);
      setStatus('error');
      onError(err.message);
    });
  }, []);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {status === 'running' && <Spinner label="Installing…" />}
      {status === 'done' && <Text color="green">✔ Done</Text>}
      {status === 'error' && <Text color="red">✖ {error}</Text>}
    </Box>
  );
}

function DoneStep({
  id,
  urlFiles,
  require: requirePath,
  onExit,
}: {
  id: string;
  urlFiles: UrlFile[];
  require: string;
  onExit: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onExit, 300);
    return () => clearTimeout(t);
  }, [onExit]);

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="green" bold>✔ Installed</Text>
      {urlFiles.map((f) => <Text key={f.url}>{'  '}{f.name}  <Text dimColor>→ {f.target}</Text></Text>)}
      <Box marginTop={1}>
        <Text dimColor>
          Usage:  <Text color="cyan">local {id.replace(/[.-]/g, '_')} = require('{requirePath}')</Text>
        </Text>
      </Box>
      <Box>
        <Text color="yellow">  Trust: experimental ⚠  — not reviewed by the Feather team</Text>
      </Box>
    </Box>
  );
}

// ── Main wizard ──────────────────────────────────────────────────────────────

function Wizard({ projectDir, lockfile }: { projectDir: string; lockfile: Lockfile }) {
  const { exit } = useApp();
  const [step, _setStep] = useState<Step>('id');
  const setStep = (next: Step) => { process.stdout.write('\x1B[2J\x1B[H'); _setStep(next); };
  const [id, setId] = useState('');
  const [requirePath, setRequirePath] = useState('');
  const [urlFiles, setUrlFiles] = useState<UrlFile[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentSha, setCurrentSha] = useState('');
  const [currentBuffer, setCurrentBuffer] = useState<Buffer>(Buffer.alloc(0));
  const [errorMsg, setErrorMsg] = useState('');

  const handleError = (msg: string) => { setErrorMsg(msg); setStep('error'); };

  if (step === 'id') {
    return (
      <TextInputStep
        stepNum={1}
        label="Package name"
        hint="How this dependency will be tracked (e.g. my-helper, utils.vec)"
        validate={(v) => {
          if (!v) return 'Required';
          if (!/^[a-z0-9][a-z0-9.-]*$/.test(v)) return 'Use only a-z, 0-9, dots, hyphens';
          if (lockfile.packages[v]) return `"${v}" is already installed`;
          return null;
        }}
        onSubmit={(v) => { setId(v); setStep('file-url'); }}
      />
    );
  }

  if (step === 'file-url') {
    const n = urlFiles.length;
    return (
      <TextInputStep
        stepNum={2}
        label={n === 0 ? 'File URL' : `File URL (${n} added so far)`}
        hint="Direct URL to the .lua file"
        validate={(v) => {
          if (!v) return 'Required';
          try { new URL(v); } catch { return 'Must be a valid URL'; }
          return null;
        }}
        onSubmit={(url) => { setCurrentUrl(url); setStep('file-fetch'); }}
      />
    );
  }

  if (step === 'file-fetch') {
    return (
      <FileFetchStep
        url={currentUrl}
        onDone={(sha256, buffer) => { setCurrentSha(sha256); setCurrentBuffer(buffer); setStep('file-target'); }}
        onError={handleError}
      />
    );
  }

  if (step === 'file-target') {
    const name = fileNameFromUrl(currentUrl);
    const suggested = urlFiles.length === 0 ? `lib/${name}` : `lib/${id}/${name}`;
    return (
      <TextInputStep
        stepNum={2}
        label={`Install target for ${name}`}
        hint="Path relative to project root"
        defaultValue={suggested}
        validate={(v) => {
          if (!v) return 'Required';
          if (!v.endsWith('.lua')) return 'Must end in .lua';
          return null;
        }}
        onSubmit={(target) => {
          setUrlFiles((fs) => [...fs, { name, url: currentUrl, sha256: currentSha, target, buffer: currentBuffer }]);
          setStep('file-more');
        }}
      />
    );
  }

  if (step === 'file-more') {
    return (
      <FileMoreStep
        urlFiles={urlFiles}
        onYes={() => setStep('file-url')}
        onNo={() => setStep('require')}
      />
    );
  }

  if (step === 'require') {
    const firstName = urlFiles[0]?.name ?? `${id}.lua`;
    const suggested = `lib.${firstName.replace(/\.lua$/, '').replace(/\//g, '.')}`;
    return (
      <TextInputStep
        stepNum={3}
        label="Require path"
        hint="How to require this package in your game"
        defaultValue={suggested}
        validate={(v) => (v ? null : 'Required')}
        onSubmit={(v) => { setRequirePath(v); setStep('confirm'); }}
      />
    );
  }

  if (step === 'confirm') {
    return (
      <ConfirmStep
        id={id}
        urlFiles={urlFiles}
        onConfirm={() => setStep('write')}
        onAbort={() => { setErrorMsg('Aborted.'); setStep('error'); }}
      />
    );
  }

  if (step === 'write') {
    return (
      <WriteStep
        id={id}
        urlFiles={urlFiles}
        require={requirePath}
        projectDir={projectDir}
        lockfile={lockfile}
        onDone={() => setStep('done')}
        onError={handleError}
      />
    );
  }

  if (step === 'done') {
    return <DoneStep id={id} urlFiles={urlFiles} require={requirePath} onExit={exit} />;
  }

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="red" bold>✖ Error</Text>
      <Text>{errorMsg}</Text>
    </Box>
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function showAddFromUrlWizard(opts: {
  projectDir: string;
  lockfile: Lockfile;
}): Promise<void> {
  process.stdout.write('\x1B[2J\x1B[H');
  const { waitUntilExit } = render(
    <Wizard projectDir={opts.projectDir} lockfile={opts.lockfile} />,
  );
  await waitUntilExit();
}
