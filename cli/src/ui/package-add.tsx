import { render, Text, Box, useInput, useApp } from 'ink';
import { useState, useEffect } from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sha256Buffer } from '../lib/package/checksum.js';
import type { Lockfile } from '../lib/package/lockfile.js';
import { addToLockfile, writeLockfile } from '../lib/package/lockfile.js';
import {
  type UrlFile,
  TextInputStep,
  SelectStep,
  MultiSelectStep,
  AutoStep,
  TargetsStep,
  FileFetchStep,
  FileMoreStep,
} from './components.js';
import { GH_HEADERS, fetchCommitSha, fetchLuaFiles } from '../lib/github.js';
import { fileNameFromUrl } from '../lib/url.js';

type Step =
  | 'choose'
  | 'id'
  | 'repo'
  | 'fetch-tags'
  | 'tag'
  | 'resolve-commit'
  | 'fetch-files'
  | 'files'
  | 'targets'
  | 'file-url'
  | 'file-fetch'
  | 'file-target'
  | 'file-more'
  | 'require'
  | 'confirm'
  | 'install'
  | 'write'
  | 'done'
  | 'error';

const REPO_TOTAL = 7;
const URL_TOTAL = 4;

async function fetchRepoMeta(repo: string): Promise<{ values: string[]; labels: string[] }> {
  const [tagsRes, repoRes, branchesRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}/tags?per_page=20`, { headers: GH_HEADERS }),
    fetch(`https://api.github.com/repos/${repo}`, { headers: GH_HEADERS }),
    fetch(`https://api.github.com/repos/${repo}/branches?per_page=30`, { headers: GH_HEADERS }),
  ]);
  if (!tagsRes.ok) throw new Error(`GitHub API ${tagsRes.status} fetching tags for ${repo}`);
  if (!repoRes.ok) throw new Error(`GitHub API ${repoRes.status} fetching repo info for ${repo}`);
  if (!branchesRes.ok) throw new Error(`GitHub API ${branchesRes.status} fetching branches for ${repo}`);
  const [tagsData, repoData, branchesData] = await Promise.all([
    tagsRes.json() as Promise<Array<{ name: string }>>,
    repoRes.json() as Promise<{ default_branch?: string }>,
    branchesRes.json() as Promise<Array<{ name: string }>>,
  ]);
  const tags = tagsData.map((t) => t.name);
  const defaultBranch = repoData.default_branch ?? 'main';
  const branches = branchesData.map((b) => b.name);
  const orderedBranches = [defaultBranch, ...branches.filter((b) => b !== defaultBranch)];
  const values = [...tags, ...orderedBranches];
  const labels = [...tags, ...orderedBranches.map((b) => `⎇  ${b}`)];
  return { values, labels };
}


function RepoConfirmStep({
  id,
  repoName,
  tag,
  selectedFiles,
  targetMap,
  onConfirm,
  onAbort,
}: {
  id: string;
  repoName: string;
  tag: string;
  selectedFiles: string[];
  targetMap: Record<string, string>;
  onConfirm: () => void;
  onAbort: () => void;
}) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y' || key.return) onConfirm();
    else if (input === 'n' || input === 'N' || key.escape) onAbort();
  });
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">
          {'  '}feather package add
        </Text>
        <Text dimColor>{`  Step ${REPO_TOTAL} of ${REPO_TOTAL}`}</Text>
      </Box>
      <Text bold>{'  '}Review before installing</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          {'  '}Package: <Text color="cyan">{id}</Text>
        </Text>
        <Text>
          {'  '}Source: <Text color="cyan">github.com/{repoName}</Text>
        </Text>
        <Text>
          {'  '}Version: <Text color="cyan">{tag}</Text> <Text dimColor>(commit SHA pinned)</Text>
        </Text>
        <Text>
          {'  '}Trust: <Text color="yellow">experimental ⚠</Text>
        </Text>
        <Text dimColor>{'  '}Not reviewed by the Feather team.</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {selectedFiles.map((f) => (
          <Text key={f}>
            {'  '}
            {f} <Text dimColor>→ {targetMap[f]}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  y/Enter = install · n/Esc = abort'}</Text>
      </Box>
    </Box>
  );
}

function UrlConfirmStep({
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
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">
          {'  '}feather package add
        </Text>
        <Text dimColor>{`  Step ${URL_TOTAL} of ${URL_TOTAL}`}</Text>
      </Box>
      <Text bold>{'  '}Review before installing</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          {'  '}Package: <Text color="cyan">{id}</Text>
        </Text>
        <Text>
          {'  '}Trust: <Text color="yellow">experimental ⚠</Text>
        </Text>
        <Text dimColor>{'  '}Not reviewed by the Feather team.</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {urlFiles.map((f) => (
          <Box key={f.url} flexDirection="column">
            <Text>
              {'  '}
              {f.name} <Text dimColor>→ {f.target}</Text>
            </Text>
            <Text dimColor>
              {'    sha256: '}
              {f.sha256.slice(0, 24)}…
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  y/Enter = install · n/Esc = abort'}</Text>
      </Box>
    </Box>
  );
}

function InstallStep({
  id,
  repoName,
  tag,
  baseUrl,
  selectedFiles,
  targetMap,
  projectDir,
  lockfile,
  onDone,
  onError,
}: {
  id: string;
  repoName: string;
  tag: string;
  baseUrl: string;
  selectedFiles: string[];
  targetMap: Record<string, string>;
  projectDir: string;
  lockfile: Lockfile;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [current, setCurrent] = useState('');
  useEffect(() => {
    const run = async () => {
      const lockedFiles: { name: string; url: string; target: string; sha256: string }[] = [];
      for (const name of selectedFiles) {
        setCurrent(name);
        const url = baseUrl + name;
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const hash = sha256Buffer(buf);
        const target = targetMap[name]!;
        mkdirSync(dirname(join(projectDir, target)), { recursive: true });
        writeFileSync(join(projectDir, target), buf);
        lockedFiles.push({ name, url, target, sha256: hash });
      }
      addToLockfile(lockfile, id, {
        version: tag,
        trust: 'experimental',
        source: { repo: repoName, tag },
        files: lockedFiles,
      });
      writeLockfile(projectDir, lockfile);
      onDone();
    };
    run().catch((err: Error) => onError(err.message));
  }, []);
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text color="cyan">{current ? `Installing ${current}…` : 'Installing…'}</Text>
    </Box>
  );
}

function WriteStep({
  id,
  urlFiles,
  projectDir,
  lockfile,
  onDone,
  onError,
}: {
  id: string;
  urlFiles: UrlFile[];
  projectDir: string;
  lockfile: Lockfile;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
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
      onDone();
    };
    run().catch((err: Error) => onError(err.message));
  }, []);
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text color="cyan">Installing…</Text>
    </Box>
  );
}

function DoneStep({
  id,
  files,
  requirePath,
  onExit,
}: {
  id: string;
  files: Array<{ name: string; target: string }>;
  requirePath: string;
  onExit: () => void;
}) {
  useInput((_, key) => {
    if (key.return || key.escape) onExit();
  });
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="green" bold>
        ✔ Installed
      </Text>
      {files.map((f) => (
        <Text key={f.name}>
          {'  '}
          {f.name} <Text dimColor>→ {f.target}</Text>
        </Text>
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          Usage:{' '}
          <Text color="cyan">
            local {id.replace(/[.-]/g, '_')} = require('{requirePath}')
          </Text>
        </Text>
      </Box>
      <Box>
        <Text color="yellow"> Trust: experimental ⚠ — not reviewed by the Feather team</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor> Press Enter to exit</Text>
      </Box>
    </Box>
  );
}

function Wizard({ projectDir, lockfile }: { projectDir: string; lockfile: Lockfile }) {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<'repo' | 'url' | null>(null);

  // Shared
  const [id, setId] = useState('');
  const [requirePath, setRequirePath] = useState('');

  // Repo flow
  const [repoName, setRepoName] = useState('');
  const [tag, setTag] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [tagLabels, setTagLabels] = useState<string[]>([]);
  const [luaFiles, setLuaFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [targetMap, setTargetMap] = useState<Record<string, string>>({});

  // URL flow
  const [urlFiles, setUrlFiles] = useState<UrlFile[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentSha, setCurrentSha] = useState('');
  const [currentBuffer, setCurrentBuffer] = useState<Buffer>(Buffer.alloc(0));

  const [errorMsg, setErrorMsg] = useState('');

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStep('error');
  };

  const doneFiles =
    mode === 'repo'
      ? selectedFiles.map((f) => ({ name: f, target: targetMap[f] ?? f }))
      : urlFiles.map((f) => ({ name: f.name, target: f.target }));

  if (step === 'choose') {
    return (
      <SelectStep
        label="How do you want to add this package?"
        options={['repo', 'url']}
        labels={['From GitHub repository  (commit-SHA pinned, reproducible)', 'From direct URL(s)']}
        onSelect={(v) => {
          setMode(v as 'repo' | 'url');
          setStep('id');
        }}
      />
    );
  }

  if (step === 'id') {
    return (
      <TextInputStep
        stepNum={1}
        total={mode === 'repo' ? REPO_TOTAL : URL_TOTAL}
        label="Package name"
        hint="How this dependency will be tracked (e.g. my-helper, utils.vec)"
        validate={(v) => {
          if (!v) return 'Required';
          if (!/^[a-z0-9][a-z0-9.-]*$/.test(v)) return 'Use only a-z, 0-9, dots, hyphens';
          if (lockfile.packages[v]) return `"${v}" is already installed`;
          return null;
        }}
        onSubmit={(v) => {
          setId(v);
          setStep(mode === 'repo' ? 'repo' : 'file-url');
        }}
      />
    );
  }

  if (step === 'repo') {
    return (
      <TextInputStep
        stepNum={2}
        total={REPO_TOTAL}
        label="GitHub repository"
        hint="owner/repo  (e.g. kikito/anim8)"
        validate={(v) => {
          if (!v) return 'Required';
          if (!/^[^/]+\/[^/]+$/.test(v)) return 'Must be owner/repo format';
          return null;
        }}
        onSubmit={(v) => {
          setRepoName(v);
          setStep('fetch-tags');
        }}
      />
    );
  }

  if (step === 'fetch-tags') {
    return (
      <AutoStep
        label={`Fetching tags for ${repoName}…`}
        run={async () => {
          const { values, labels } = await fetchRepoMeta(repoName);
          if (values.length === 0) throw new Error('No tags or branches found.');
          setTagOptions(values);
          setTagLabels(labels);
          setStep('tag');
        }}
        onError={handleError}
      />
    );
  }

  if (step === 'tag') {
    return (
      <SelectStep
        stepNum={3}
        total={REPO_TOTAL}
        label="Select tag or branch"
        hint={`${tagOptions.length} options · tags first, then branches (⎇)`}
        options={tagOptions}
        labels={tagLabels}
        onSelect={(v) => {
          setTag(v);
          setStep('resolve-commit');
        }}
      />
    );
  }

  if (step === 'resolve-commit') {
    return (
      <AutoStep
        label={`Resolving ${tag} to commit SHA…`}
        run={async () => {
          const sha = await fetchCommitSha(repoName, tag);
          setBaseUrl(`https://raw.githubusercontent.com/${repoName}/${sha}/`);
          setStep('fetch-files');
        }}
        onError={handleError}
      />
    );
  }

  if (step === 'fetch-files') {
    return (
      <AutoStep
        label={`Fetching file list for ${repoName}@${tag}…`}
        run={async () => {
          const files = await fetchLuaFiles(repoName, tag);
          if (files.length === 0) throw new Error('No .lua files found at this ref.');
          setLuaFiles(files);
          setStep('files');
        }}
        onError={handleError}
      />
    );
  }

  if (step === 'files') {
    return (
      <MultiSelectStep
        stepNum={4}
        total={REPO_TOTAL}
        label="Select files to install"
        hint={`${luaFiles.length} .lua file(s) found · all selected by default`}
        options={luaFiles}
        onSubmit={(chosen) => {
          setSelectedFiles(chosen);
          setStep('targets');
        }}
      />
    );
  }

  if (step === 'targets') {
    return (
      <TargetsStep
        stepNum={5}
        total={REPO_TOTAL}
        id={id}
        files={selectedFiles}
        onSubmit={(map) => {
          setTargetMap(map);
          setStep('require');
        }}
      />
    );
  }

  if (step === 'require') {
    const firstTarget =
      mode === 'repo' ? (Object.values(targetMap)[0] ?? `lib/${id}.lua`) : (urlFiles[0]?.target ?? `lib/${id}.lua`);
    const suggested = firstTarget.replace(/\.lua$/, '').replace(/\//g, '.');
    return (
      <TextInputStep
        stepNum={mode === 'repo' ? 6 : 3}
        total={mode === 'repo' ? REPO_TOTAL : URL_TOTAL}
        label="Require path"
        hint="How to require this package in your game"
        defaultValue={suggested}
        validate={(v) => (v ? null : 'Required')}
        onSubmit={(v) => {
          setRequirePath(v);
          setStep('confirm');
        }}
      />
    );
  }

  if (step === 'confirm') {
    if (mode === 'repo') {
      return (
        <RepoConfirmStep
          id={id}
          repoName={repoName}
          tag={tag}
          selectedFiles={selectedFiles}
          targetMap={targetMap}
          onConfirm={() => setStep('install')}
          onAbort={() => {
            setErrorMsg('Aborted.');
            setStep('error');
          }}
        />
      );
    }
    return (
      <UrlConfirmStep
        id={id}
        urlFiles={urlFiles}
        onConfirm={() => setStep('write')}
        onAbort={() => {
          setErrorMsg('Aborted.');
          setStep('error');
        }}
      />
    );
  }

  if (step === 'install') {
    return (
      <InstallStep
        id={id}
        repoName={repoName}
        tag={tag}
        baseUrl={baseUrl}
        selectedFiles={selectedFiles}
        targetMap={targetMap}
        projectDir={projectDir}
        lockfile={lockfile}
        onDone={() => setStep('done')}
        onError={handleError}
      />
    );
  }

  if (step === 'file-url') {
    const n = urlFiles.length;
    return (
      <TextInputStep
        stepNum={2}
        total={URL_TOTAL}
        label={n === 0 ? 'File URL' : `File URL (${n} added so far)`}
        hint="Direct URL to the .lua file"
        validate={(v) => {
          if (!v) return 'Required';
          try {
            new URL(v);
          } catch {
            return 'Must be a valid URL';
          }
          return null;
        }}
        onSubmit={(url) => {
          setCurrentUrl(url);
          setStep('file-fetch');
        }}
      />
    );
  }

  if (step === 'file-fetch') {
    return (
      <FileFetchStep
        url={currentUrl}
        onDone={(sha256, buffer) => {
          setCurrentSha(sha256);
          setCurrentBuffer(buffer);
          setStep('file-target');
        }}
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
        total={URL_TOTAL}
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
        step={2}
        total={URL_TOTAL}
        onYes={() => setStep('file-url')}
        onNo={() => setStep('require')}
      />
    );
  }

  if (step === 'write') {
    return (
      <WriteStep
        id={id}
        urlFiles={urlFiles}
        projectDir={projectDir}
        lockfile={lockfile}
        onDone={() => setStep('done')}
        onError={handleError}
      />
    );
  }

  if (step === 'done') {
    return <DoneStep id={id} files={doneFiles} requirePath={requirePath} onExit={exit} />;
  }

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="red" bold>
        ✖ Error
      </Text>
      <Text>{errorMsg}</Text>
    </Box>
  );
}

export async function showAddWizard(opts: { projectDir: string; lockfile: Lockfile }): Promise<void> {
  const { waitUntilExit } = render(<Wizard projectDir={opts.projectDir} lockfile={opts.lockfile} />, {
    alternateScreen: true,
  });
  await waitUntilExit();
}
