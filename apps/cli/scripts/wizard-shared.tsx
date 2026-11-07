/**
 * Shared primitives for add-package and update-package wizards.
 */

import { Text, Box, useInput } from 'ink';
import { useState, useEffect, type ReactNode } from 'react';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { useTextInput } from '../src/hooks/use-text-input.js';
import {
  CursorText,
  Spinner,
  Header,
  Hint,
  TextInputStep,
  SelectStep,
  MultiSelectStep,
  AutoStep,
  TargetsStep,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
} from '../src/ui/components.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { GH_HEADERS, fetchCommitSha, fetchLuaFiles } from '../src/lib/github.js';

export { CursorText, Spinner, Header, Hint, TextInputStep, SelectStep, MultiSelectStep, AutoStep, TargetsStep };
export { GH_HEADERS, fetchCommitSha, fetchLuaFiles };

export const __dirname = dirname(fileURLToPath(import.meta.url));
export const root = resolve(__dirname, '../..');
export const packagesDir = join(root, 'packages');

export interface FileEntry {
  name: string;
  url?: string;
  target: string;
  sha256: string;
}

export interface FormData {
  id: string;
  repo: string;
  homepage: string;
  license: string;
  tag: string;
  commitSha: string;
  baseUrl: string;
  trust: 'verified' | 'known';
  description: string;
  tags: string[];
  selectedFiles: string[];
  targetMap: Record<string, string>;
  require: string;
  example: string;
  files: FileEntry[];
  subpackages?: Record<string, { files: string[]; require: string }>;
}

export type InkKey = Parameters<Parameters<typeof useInput>[0]>[1];

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
          <Text key={i}>
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

interface YesNoStepProps {
  stepNum: number;
  total: number;
  title?: string;
  label: string;
  hint?: string;
  children?: ReactNode;
  onYes: () => void;
  onNo: () => void;
}

export function YesNoStep({ stepNum, total, title, label, hint, children, onYes, onNo }: YesNoStepProps) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onYes();
    else if (input === 'n' || input === 'N' || key.return || key.escape) onNo();
  });

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>
        {'  '}
        {label}
      </Text>
      {hint && <Hint>{hint}</Hint>}
      {children}
      <Box marginTop={1}>
        <Text dimColor>{'  y = yes · n/Enter = no'}</Text>
      </Box>
    </Box>
  );
}

type SubPkgPhase = 'ask' | 'id' | 'files' | 'require' | 'add-more';

interface SubpackagesStepProps {
  stepNum: number;
  total: number;
  title?: string;
  selectedFiles: string[];
  initialSubpackages?: Record<string, { files: string[]; require: string }>;
  onSubmit: (subpackages: Record<string, { files: string[]; require: string }>) => void;
}

export function SubpackagesStep({
  stepNum,
  total,
  title,
  selectedFiles,
  initialSubpackages,
  onSubmit,
}: SubpackagesStepProps) {
  const hasInitial = Object.keys(initialSubpackages ?? {}).length > 0;
  const [phase, setPhase] = useState<SubPkgPhase>(hasInitial ? 'add-more' : 'ask');
  const [accumulated, setAccumulated] = useState<Record<string, { files: string[]; require: string }>>(
    initialSubpackages ?? {},
  );
  const [currentId, setCurrentId] = useState('');
  const [currentFiles, setCurrentFiles] = useState<string[]>([]);
  const idInput = useTextInput('');
  const reqInput = useTextInput('');
  const [fileCursor, setFileCursor] = useState(0);
  const [fileSelected, setFileSelected] = useState<Set<number>>(new Set());
  const [idError, setIdError] = useState<string | null>(null);
  const [reqError, setReqError] = useState<string | null>(null);

  useInput((input, key) => {
    if (phase === 'ask' || phase === 'add-more') {
      if (input === 'y' || input === 'Y') {
        idInput.reset('');
        setIdError(null);
        setPhase('id');
      } else if (input === 'n' || input === 'N' || key.return || key.escape) {
        onSubmit(accumulated);
      }
    } else if (phase === 'id') {
      if (key.return) {
        const val = idInput.value.trim();
        if (!val) {
          setIdError('Required');
          return;
        }
        setCurrentId(val);
        setFileSelected(new Set());
        setFileCursor(0);
        setPhase('files');
        return;
      }
      if (idInput.handleKey(input, key)) setIdError(null);
    } else if (phase === 'files') {
      if (key.upArrow) setFileCursor((c) => Math.max(0, c - 1));
      if (key.downArrow) setFileCursor((c) => Math.min(selectedFiles.length - 1, c + 1));
      if (input === ' ') {
        setFileSelected((s) => {
          const next = new Set(s);
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          next.has(fileCursor) ? next.delete(fileCursor) : next.add(fileCursor);
          return next;
        });
      }
      if (key.return) {
        const chosen = selectedFiles.filter((_, i) => fileSelected.has(i));
        if (chosen.length === 0) return;
        setCurrentFiles(chosen);
        const suggested = chosen[0]!.replace(/\.lua$/, '').replace(/\//g, '.');
        reqInput.reset(suggested);
        setReqError(null);
        setPhase('require');
      }
    } else if (phase === 'require') {
      if (key.return) {
        const val = reqInput.value.trim();
        if (!val) {
          setReqError('Required');
          return;
        }
        setAccumulated((a) => ({ ...a, [currentId]: { files: currentFiles, require: val } }));
        setPhase('add-more');
        return;
      }
      if (reqInput.handleKey(input, key)) setReqError(null);
    }
  });

  const accKeys = Object.keys(accumulated);

  if (phase === 'ask') {
    return (
      <Box flexDirection="column">
        <Header step={stepNum} total={total} title={title} />
        <Text bold>{'  '}Define submodules?</Text>
        <Hint>Like hump.camera, hump.timer — named subsets of the package files</Hint>
        <Box marginTop={1}>
          <Text dimColor>{'  y = define submodules · n/Enter = skip'}</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'add-more') {
    return (
      <Box flexDirection="column">
        <Header step={stepNum} total={total} title={title} />
        <Text bold>{'  '}Add another submodule?</Text>
        <Box flexDirection="column" marginTop={1}>
          {accKeys.map((k) => (
            <Text key={k} color="green">
              {'  ✔ '}
              {k}{' '}
              <Text dimColor>
                ({accumulated[k]!.files.length} file{accumulated[k]!.files.length === 1 ? '' : 's'})
              </Text>
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>{'  y = add another · n/Enter = done'}</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'id') {
    return (
      <Box flexDirection="column">
        <Header step={stepNum} total={total} title={title} />
        <Text bold>{'  '}Submodule ID</Text>
        <Hint>e.g. hump.camera, hump.timer</Hint>
        <Box marginTop={1}>
          <Text>{'  '}</Text>
          <CursorText before={idInput.before} at={idInput.at} after={idInput.after} />
        </Box>
        {idError && (
          <Box marginTop={1}>
            <Text color="red">
              {'  ✖ '}
              {idError}
            </Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>{'  ←→ move · Backspace/Delete edit · Enter confirm'}</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'files') {
    return (
      <Box flexDirection="column">
        <Header step={stepNum} total={total} title={title} />
        <Text bold>
          {'  '}Files for {currentId}
        </Text>
        <Hint>Select which files belong to this submodule</Hint>
        <Box flexDirection="column" marginTop={1}>
          {selectedFiles.map((f, i) => (
            <Box key={f}>
              <Text color={i === fileCursor ? 'cyan' : undefined}>
                {'  '}
                {i === fileCursor ? '❯ ' : '  '}
                {fileSelected.has(i) ? '◉ ' : '○ '}
                {f}
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

  return (
    <Box flexDirection="column">
      <Header step={stepNum} total={total} title={title} />
      <Text bold>
        {'  '}Require path for {currentId}
      </Text>
      <Hint>e.g. lib.hump.camera</Hint>
      <Box marginTop={1}>
        <Text>{'  '}</Text>
        <CursorText before={reqInput.before} at={reqInput.at} after={reqInput.after} />
      </Box>
      {reqError && (
        <Box marginTop={1}>
          <Text color="red">
            {'  ✖ '}
            {reqError}
          </Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>{'  ←→ move · Backspace/Delete edit · Enter confirm'}</Text>
      </Box>
    </Box>
  );
}

export interface RepoMeta {
  tags: string[];
  branches: string[];
  defaultBranch: string;
  license: string;
}

export async function fetchRepoMeta(repo: string): Promise<RepoMeta> {
  const [tagsRes, repoRes, branchesRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}/tags?per_page=20`, { headers: GH_HEADERS }),
    fetch(`https://api.github.com/repos/${repo}`, { headers: GH_HEADERS }),
    fetch(`https://api.github.com/repos/${repo}/branches?per_page=30`, { headers: GH_HEADERS }),
  ]);
  if (!tagsRes.ok) throw new Error(`GitHub API ${tagsRes.status} for ${repo}/tags`);
  if (!repoRes.ok) throw new Error(`GitHub API ${repoRes.status} for ${repo}`);
  if (!branchesRes.ok) throw new Error(`GitHub API ${branchesRes.status} for ${repo}/branches`);
  const [tagsData, repoData, branchesData] = await Promise.all([
    tagsRes.json() as Promise<Array<{ name: string }>>,
    repoRes.json() as Promise<{ license?: { spdx_id?: string }; default_branch?: string }>,
    branchesRes.json() as Promise<Array<{ name: string }>>,
  ]);
  return {
    tags: tagsData.map((t) => t.name),
    branches: branchesData.map((b) => b.name),
    defaultBranch: repoData.default_branch ?? 'main',
    license: repoData.license?.spdx_id ?? 'unknown',
  };
}

export function buildPackageJson(data: FormData): object {
  const obj: Record<string, unknown> = {
    type: 'love2d-library',
    trust: data.trust,
    description: data.description,
    tags: data.tags,
    homepage: data.homepage,
    license: data.license,
    source: {
      repo: data.repo,
      tag: data.tag,
      commitSha: data.commitSha,
      baseUrl: `https://raw.githubusercontent.com/${data.repo}/${data.commitSha}/`,
    },
    install: {
      files: data.files.map((f) => ({ name: f.name, sha256: f.sha256, target: f.target })),
    },
    require: data.require,
    example: data.example,
  };
  if (data.subpackages && Object.keys(data.subpackages).length > 0) {
    obj.subpackages = data.subpackages;
  }
  return obj;
}
