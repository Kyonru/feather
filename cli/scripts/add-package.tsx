#!/usr/bin/env node
/**
 * Interactive wizard to add a new package to the Feather catalog.
 *
 * Usage (from repo root):
 *   npm run package:add
 *
 * Steps:
 *   1. Package ID
 *   2. GitHub repo (owner/name)
 *   3. Select release tag (fetched from GitHub API)
 *   4. Trust level (verified / known)
 *   5. Description
 *   6. Tags (comma-separated)
 *   7. Select .lua files (fetched from GitHub tree API)
 *   8. Set install target for each file
 *   9. Require path
 *  10. Compute SHA-256 checksums
 *  11. Review & write packages/<id>.json
 *  12. Regenerate registry
 */

import { render, Text, Box, useInput, useApp } from 'ink';
import { useState, useEffect } from 'react';
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const packagesDir = join(root, 'packages');

type Step =
  | 'id'
  | 'repo'
  | 'fetch-tags'
  | 'tag'
  | 'trust'
  | 'description'
  | 'pkg-tags'
  | 'fetch-files'
  | 'files'
  | 'targets'
  | 'require'
  | 'fetch-checksums'
  | 'review'
  | 'write'
  | 'done'
  | 'error';

interface FileEntry {
  name: string;
  target: string;
  sha256: string;
}

interface FormData {
  id: string;
  repo: string;
  homepage: string;
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

function Header({ step, total }: { step: number; total: number }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        {'  feather package:add'}
      </Text>
      <Text dimColor>{`  Step ${step} of ${total}`}</Text>
    </Box>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Text dimColor>
      {'  '}
      {children}
    </Text>
  );
}

interface TextInputStepProps {
  stepNum: number;
  total: number;
  label: string;
  hint?: string;
  defaultValue?: string;
  validate?: (v: string) => string | null;
  onSubmit: (value: string) => void;
}

function TextInputStep({ stepNum, total, label, hint, defaultValue = '', validate, onSubmit }: TextInputStepProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.return) {
      const err = validate ? validate(value.trim()) : null;
      if (err) {
        setError(err);
        return;
      }
      onSubmit(value.trim());
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      setError(null);
      return;
    }
    if (key.ctrl || key.meta) return;
    if (input) {
      setValue((v) => v + input);
      setError(null);
    }
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} />
      <Text bold>
        {'  '}
        {label}
      </Text>
      {hint && <Hint>{hint}</Hint>}
      <Box marginTop={1}>
        <Text>{'  '}</Text>
        <Text color="cyan">{value}</Text>
        <Text inverse> </Text>
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
        <Text dimColor>{'  Enter to confirm'}</Text>
      </Box>
    </Box>
  );
}

interface SelectStepProps {
  stepNum: number;
  total: number;
  label: string;
  hint?: string;
  options: string[];
  onSelect: (value: string) => void;
}

function SelectStep({ stepNum, total, label, hint, options, onSelect }: SelectStepProps) {
  const [cursor, setCursor] = useState(0);

  useInput((_, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(options.length - 1, c + 1));
    if (key.return) onSelect(options[cursor]!);
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} />
      <Text bold>
        {'  '}
        {label}
      </Text>
      {hint && <Hint>{hint}</Hint>}
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => (
          <Box key={opt}>
            <Text color={i === cursor ? 'cyan' : undefined}>
              {'  '}
              {i === cursor ? '❯ ' : '  '}
              {opt}
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

interface MultiSelectStepProps {
  stepNum: number;
  total: number;
  label: string;
  hint?: string;
  options: string[];
  onSubmit: (selected: string[]) => void;
}

function MultiSelectStep({ stepNum, total, label, hint, options, onSubmit }: MultiSelectStepProps) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set(options.map((_, i) => i)));

  useInput((input, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(options.length - 1, c + 1));
    if (input === ' ') {
      setSelected((s) => {
        const next = new Set(s);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
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
      <Header step={stepNum} total={total} />
      <Text bold>
        {'  '}
        {label}
      </Text>
      {hint && <Hint>{hint}</Hint>}
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => (
          <Box key={opt}>
            <Text color={i === cursor ? 'cyan' : undefined}>
              {'  '}
              {i === cursor ? '❯ ' : '  '}
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

interface AutoStepProps {
  label: string;
  run: () => Promise<void>;
  onError: (msg: string) => void;
}

function AutoStep({ label, run, onError }: AutoStepProps) {
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

interface TargetsStepProps {
  stepNum: number;
  total: number;
  id: string;
  files: string[];
  onSubmit: (targets: Record<string, string>) => void;
}

function TargetsStep({ stepNum, total, id, files, onSubmit }: TargetsStepProps) {
  const defaultTarget = (filename: string): string => {
    if (files.length === 1) return `lib/${filename}`;
    return `lib/${id}/${filename}`;
  };

  const [index, setIndex] = useState(0);
  const [targets, setTargets] = useState<Record<string, string>>(
    Object.fromEntries(files.map((f) => [f, defaultTarget(f)])),
  );
  const [current, setCurrent] = useState(defaultTarget(files[0]!));
  const [error, setError] = useState<string | null>(null);

  const file = files[index]!;

  const advance = () => {
    const val = current.trim();
    if (!val) {
      setError('Target path is required');
      return;
    }
    if (!val.endsWith('.lua')) {
      setError('Target path must end in .lua');
      return;
    }
    const next = { ...targets, [file]: val };
    setTargets(next);
    if (index + 1 < files.length) {
      const nextFile = files[index + 1]!;
      setIndex(index + 1);
      setCurrent(next[nextFile] ?? defaultTarget(nextFile));
      setError(null);
    } else {
      onSubmit(next);
    }
  };

  useInput((input, key) => {
    if (key.return) {
      advance();
      return;
    }
    if (key.backspace || key.delete) {
      setCurrent((v) => v.slice(0, -1));
      setError(null);
      return;
    }
    if (key.ctrl || key.meta) return;
    if (input) {
      setCurrent((v) => v + input);
      setError(null);
    }
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} />
      <Text bold>{'  '}Install target paths</Text>
      <Hint>{`File ${index + 1} of ${files.length}: ${file}`}</Hint>
      <Box marginTop={1}>
        <Text>{'  '}</Text>
        <Text color="cyan">{current}</Text>
        <Text inverse> </Text>
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
        <Text dimColor>{'  Enter to confirm path'}</Text>
      </Box>
    </Box>
  );
}

interface ReviewStepProps {
  stepNum: number;
  total: number;
  json: string;
  onConfirm: () => void;
  onAbort: () => void;
}

function ReviewStep({ stepNum, total, json, onConfirm, onAbort }: ReviewStepProps) {
  useInput((input, key) => {
    if (key.return || input === 'y' || input === 'Y') onConfirm();
    if (input === 'n' || input === 'N' || key.escape) onAbort();
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} />
      <Text bold>{'  '}Review generated package</Text>
      <Box marginTop={1} flexDirection="column">
        {json.split('\n').map((line, i) => (
          <Text key={i} dimColor={false}>
            {'  '}
            {line}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  '}y/Enter to write · n/Esc to abort</Text>
      </Box>
    </Box>
  );
}

interface ChecksumStepProps {
  files: Array<{ name: string; url: string }>;
  onDone: (checksums: Record<string, string>) => void;
  onError: (msg: string) => void;
}

function ChecksumStep({ files, onDone, onError }: ChecksumStepProps) {
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
          <Box key={f.name} marginTop={0}>
            {sha ? (
              <Text color="green">
                {'  ✔ '}
                {f.name}
              </Text>
            ) : isActive ? (
              <Box>
                <Text color="cyan">{'  '}</Text>
                <Spinner label={f.name} />
              </Box>
            ) : (
              <Text dimColor>
                {'  ○ '}
                {f.name}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

async function fetchTags(repo: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=20`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${repo}`);
  const data = (await res.json()) as Array<{ name: string }>;
  return data.map((t) => t.name);
}

async function fetchLuaFiles(repo: string, tag: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${tag}?recursive=1`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${repo}@${tag}`);
  const data = (await res.json()) as { tree: Array<{ path: string; type: string }> };
  return data.tree
    .filter((node) => node.type === 'blob' && node.path.endsWith('.lua'))
    .map((node) => node.path)
    .sort();
}

function DoneStep({ id, onExit }: { id: string; onExit: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onExit, 300);
    return () => clearTimeout(timer);
  }, [onExit]);

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="green" bold>
        ✔ Done!
      </Text>
      <Text>
        {'  '}packages/{id}.json written
      </Text>
      <Text>{'  '}Registry regenerated</Text>
      <Box marginTop={1}>
        <Text dimColor>Commit packages/{id}.json and cli/src/generated/registry.json</Text>
      </Box>
      <Box>
        <Text dimColor>Then push — GitHub Actions will publish the registry to the packages branch.</Text>
      </Box>
    </Box>
  );
}

const TOTAL_STEPS = 12;

function Wizard() {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('id');
  const [data, setData] = useState<Partial<FormData>>({});
  const [fetchedTags, setFetchedTags] = useState<string[]>([]);
  const [fetchedFiles, setFetchedFiles] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [outputJson, setOutputJson] = useState('');

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStep('error');
  };

  // Step 1: package ID
  if (step === 'id') {
    return (
      <TextInputStep
        stepNum={1}
        total={TOTAL_STEPS}
        label="Package ID"
        hint="Lowercase letters, numbers, dots, and hyphens (e.g. anim8, hump.camera)"
        validate={(v) => {
          if (!v) return 'Required';
          if (!/^[a-z0-9][a-z0-9.-]*$/.test(v)) return 'Use only a-z, 0-9, dots, hyphens';
          if (existsSync(join(packagesDir, `${v}.json`))) return `packages/${v}.json already exists`;
          return null;
        }}
        onSubmit={(id) => {
          setData((d) => ({ ...d, id }));
          setStep('repo');
        }}
      />
    );
  }

  // Step 2: GitHub repo
  if (step === 'repo') {
    return (
      <TextInputStep
        stepNum={2}
        total={TOTAL_STEPS}
        label="GitHub repository"
        hint="Format: owner/repo  (e.g. kikito/anim8)"
        validate={(v) => {
          if (!v) return 'Required';
          if (!/^[^/]+\/[^/]+$/.test(v)) return 'Must be owner/repo format';
          return null;
        }}
        onSubmit={(repo) => {
          setData((d) => ({
            ...d,
            repo,
            homepage: `https://github.com/${repo}`,
          }));
          setStep('fetch-tags');
        }}
      />
    );
  }

  // Step 3: fetch tags
  if (step === 'fetch-tags') {
    return (
      <AutoStep
        label={`Fetching tags for ${data.repo}…`}
        run={async () => {
          const tags = await fetchTags(data.repo!);
          if (tags.length === 0) throw new Error('No tags found. Push a release tag first.');
          setFetchedTags(tags);
          setStep('tag');
        }}
        onError={handleError}
      />
    );
  }

  // Step 4: select tag
  if (step === 'tag') {
    return (
      <SelectStep
        stepNum={3}
        total={TOTAL_STEPS}
        label="Select release tag to pin"
        hint={`${fetchedTags.length} tags available · most recent first`}
        options={fetchedTags}
        onSelect={(tag) => {
          const baseUrl = `https://raw.githubusercontent.com/${data.repo}/${tag}/`;
          setData((d) => ({ ...d, tag, baseUrl }));
          setStep('trust');
        }}
      />
    );
  }

  // Step 5: trust level
  if (step === 'trust') {
    return (
      <SelectStep
        stepNum={4}
        total={TOTAL_STEPS}
        label="Trust level"
        hint="verified = Feather-reviewed with pinned SHA-256 · known = popular, checksum-pinned"
        options={['verified', 'known']}
        onSelect={(trust) => {
          setData((d) => ({ ...d, trust: trust as 'verified' | 'known' }));
          setStep('description');
        }}
      />
    );
  }

  // Step 6: description
  if (step === 'description') {
    return (
      <TextInputStep
        stepNum={5}
        total={TOTAL_STEPS}
        label="Description"
        hint="One sentence describing what the library does"
        validate={(v) => (v ? null : 'Required')}
        onSubmit={(description) => {
          setData((d) => ({ ...d, description }));
          setStep('pkg-tags');
        }}
      />
    );
  }

  // Step 7: tags
  if (step === 'pkg-tags') {
    return (
      <TextInputStep
        stepNum={6}
        total={TOTAL_STEPS}
        label="Tags"
        hint="Comma-separated (e.g. animation,sprites) — used in feather package search"
        validate={(v) => (v ? null : 'Required')}
        onSubmit={(tagStr) => {
          const tags = tagStr
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          setData((d) => ({ ...d, tags }));
          setStep('fetch-files');
        }}
      />
    );
  }

  // Step 8: fetch file tree
  if (step === 'fetch-files') {
    return (
      <AutoStep
        label={`Fetching file tree for ${data.repo}@${data.tag}…`}
        run={async () => {
          const files = await fetchLuaFiles(data.repo!, data.tag!);
          if (files.length === 0) throw new Error('No .lua files found at this tag.');
          setFetchedFiles(files);
          setStep('files');
        }}
        onError={handleError}
      />
    );
  }

  // Step 9: multi-select files
  if (step === 'files') {
    return (
      <MultiSelectStep
        stepNum={7}
        total={TOTAL_STEPS}
        label="Select files to install"
        hint={`${fetchedFiles.length} .lua files · Space to toggle · all selected by default`}
        options={fetchedFiles}
        onSubmit={(selectedFiles) => {
          setData((d) => ({ ...d, selectedFiles }));
          setStep('targets');
        }}
      />
    );
  }

  // Step 10: target paths
  if (step === 'targets') {
    return (
      <TargetsStep
        stepNum={8}
        total={TOTAL_STEPS}
        id={data.id!}
        files={data.selectedFiles!}
        onSubmit={(targetMap) => {
          setData((d) => ({ ...d, targetMap }));
          setStep('require');
        }}
      />
    );
  }

  // Step 11: require path
  if (step === 'require') {
    const targets = Object.values(data.targetMap ?? {});
    const firstTarget = targets[0] ?? `lib/${data.id}.lua`;
    const suggested = firstTarget.replace(/\.lua$/, '').replace(/\//g, '.');
    return (
      <TextInputStep
        stepNum={9}
        total={TOTAL_STEPS}
        label="Require path"
        hint={`Lua require path (e.g. ${suggested})`}
        defaultValue={suggested}
        validate={(v) => (v ? null : 'Required')}
        onSubmit={(req) => {
          const example = `local ${data.id!.replace(/[.-]/g, '_')} = require('${req}')`;
          setData((d) => ({ ...d, require: req, example }));
          setStep('fetch-checksums');
        }}
      />
    );
  }

  // Step 12: compute checksums
  if (step === 'fetch-checksums') {
    const fileList = (data.selectedFiles ?? []).map((name) => ({
      name,
      url: data.baseUrl! + name,
    }));
    return (
      <ChecksumStep
        files={fileList}
        onDone={(checksums) => {
          const files: FileEntry[] = (data.selectedFiles ?? []).map((name) => ({
            name,
            target: data.targetMap![name]!,
            sha256: checksums[name]!,
          }));
          const fullData = { ...data, files } as FormData;
          setData(fullData);

          const pkg = {
            type: 'love2d-library',
            trust: fullData.trust,
            description: fullData.description,
            tags: fullData.tags,
            homepage: fullData.homepage,
            source: {
              repo: fullData.repo,
              tag: fullData.tag,
              baseUrl: fullData.baseUrl,
            },
            install: {
              files: files.map((f) => ({
                name: f.name,
                sha256: f.sha256,
                target: f.target,
              })),
            },
            require: fullData.require,
            example: fullData.example,
          };
          setOutputJson(JSON.stringify(pkg, null, 2));
          setStep('review');
        }}
        onError={handleError}
      />
    );
  }

  // Step 13: review & confirm
  if (step === 'review') {
    return (
      <ReviewStep
        stepNum={11}
        total={TOTAL_STEPS}
        json={outputJson}
        onConfirm={() => setStep('write')}
        onAbort={() => {
          setErrorMsg('Aborted by user.');
          setStep('error');
        }}
      />
    );
  }

  // Step 14: write + regenerate
  if (step === 'write') {
    return (
      <AutoStep
        label={`Writing packages/${data.id}.json and regenerating registry…`}
        run={async () => {
          const outPath = join(packagesDir, `${data.id}.json`);
          writeFileSync(outPath, outputJson + '\n', 'utf8');

          const genScript = join(root, 'scripts', 'generate-registry.mjs');
          const result = spawnSync(process.execPath, [genScript], {
            cwd: root,
            stdio: 'pipe',
            encoding: 'utf8',
          });
          if (result.status !== 0) {
            throw new Error(result.stderr || 'generate-registry.mjs failed');
          }
          setStep('done');
        }}
        onError={handleError}
      />
    );
  }

  // Done
  if (step === 'done') {
    return <DoneStep id={data.id!} onExit={exit} />;
  }

  // Error
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="red" bold>
        ✖ Error
      </Text>
      <Text>{errorMsg}</Text>
    </Box>
  );
}

const { waitUntilExit } = render(<Wizard />);
await waitUntilExit();
