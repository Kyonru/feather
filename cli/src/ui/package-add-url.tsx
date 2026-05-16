import { render, Text, Box, useInput, useApp } from 'ink';
import { useState, useEffect } from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Lockfile } from '../lib/package/lockfile.js';
import { addToLockfile, writeLockfile } from '../lib/package/lockfile.js';
import {
  type UrlFile,
  Header,
  TextInputStep,
  FileFetchStep,
  FileMoreStep,
} from './components.js';

type Step =
  | 'id'
  | 'file-url'
  | 'file-fetch'
  | 'file-target'
  | 'file-more'
  | 'require'
  | 'confirm'
  | 'write'
  | 'done'
  | 'error';

const TOTAL = 5;

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split('/').filter(Boolean).pop() ?? 'file.lua';
  } catch {
    return url.split('/').pop() ?? 'file.lua';
  }
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
        <Text>
          {'  '}Package: <Text color="cyan">{id}</Text>
        </Text>
        <Text>
          {'  '}Trust: <Text color="yellow">experimental ⚠</Text>
        </Text>
        <Text dimColor>{'  '}These files have NOT been reviewed by the Feather team.</Text>
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
      {status === 'running' && <Text>Installing…</Text>}
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
  useInput((_, key) => {
    if (key.return || key.escape) onExit();
  });

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="green" bold>
        ✔ Installed
      </Text>
      {urlFiles.map((f) => (
        <Text key={f.url}>
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
  const [step, setStep] = useState<Step>('id');
  const [id, setId] = useState('');
  const [requirePath, setRequirePath] = useState('');
  const [urlFiles, setUrlFiles] = useState<UrlFile[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentSha, setCurrentSha] = useState('');
  const [currentBuffer, setCurrentBuffer] = useState<Buffer>(Buffer.alloc(0));
  const [errorMsg, setErrorMsg] = useState('');

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStep('error');
  };

  if (step === 'id') {
    return (
      <TextInputStep
        stepNum={1}
        total={TOTAL}
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
          setStep('file-url');
        }}
      />
    );
  }

  if (step === 'file-url') {
    const n = urlFiles.length;
    return (
      <TextInputStep
        stepNum={2}
        total={TOTAL}
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
        total={TOTAL}
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
        total={TOTAL}
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
        total={TOTAL}
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
    return (
      <ConfirmStep
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
    return <DoneStep id={id} urlFiles={urlFiles} require={requirePath} onExit={exit} />;
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

export async function showAddFromUrlWizard(opts: { projectDir: string; lockfile: Lockfile }): Promise<void> {
  const { waitUntilExit } = render(<Wizard projectDir={opts.projectDir} lockfile={opts.lockfile} />, {
    alternateScreen: true,
  });
  await waitUntilExit();
}
