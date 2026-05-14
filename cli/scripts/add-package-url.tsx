#!/usr/bin/env node
/**
 * Interactive wizard to add a new package from direct file URLs.
 * Use this when there is no GitHub repo with tags (e.g. single-file libraries
 * hosted elsewhere, or repos without versioned releases).
 *
 * Usage (from repo root):
 *   npm run package:add-url
 */

import { render, Text, Box, useApp, useInput } from 'ink';
import { useState, useEffect } from 'react';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  root,
  packagesDir,
  TextInputStep,
  SelectStep,
  AutoStep,
  SubpackagesStep,
  YesNoStep,
  ReviewStep,
  Header,
  Hint,
  Spinner,
} from './wizard-shared.js';

interface UrlFile {
  name: string;
  url: string;
  sha256: string;
  target: string;
}

interface FormData {
  id: string;
  trust: 'verified' | 'known';
  description: string;
  tags: string[];
  homepage: string;
  license: string;
  require: string;
  example: string;
  subpackages?: Record<string, { files: string[]; require: string }>;
}

type Step =
  | 'id'
  | 'trust'
  | 'description'
  | 'pkg-tags'
  | 'homepage'
  | 'license'
  | 'file-url'
  | 'file-fetch'
  | 'file-target'
  | 'file-more'
  | 'require'
  | 'subpkgs'
  | 'review'
  | 'write'
  | 'done'
  | 'error';

const TITLE = 'feather package:add-url';
const TOTAL = 10;

function buildPackageJson(
  data: FormData,
  urlFiles: UrlFile[],
): object {
  const obj: Record<string, unknown> = {
    type: 'love2d-library',
    trust: data.trust,
    description: data.description,
    tags: data.tags,
    homepage: data.homepage || undefined,
    license: data.license || undefined,
    source: { type: 'url' },
    install: {
      files: urlFiles.map((f) => ({ name: f.name, url: f.url, sha256: f.sha256, target: f.target })),
    },
    require: data.require,
    example: data.example,
  };
  if (data.subpackages && Object.keys(data.subpackages).length > 0) {
    obj.subpackages = data.subpackages;
  }
  return obj;
}

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split('/').filter(Boolean).pop() ?? 'file.lua';
  } catch {
    return url.split('/').pop() ?? 'file.lua';
  }
}

function FileFetchStep({
  url,
  onDone,
  onError,
}: {
  url: string;
  onDone: (sha256: string) => void;
  onError: (msg: string) => void;
}) {
  const [status, setStatus] = useState<'running' | 'done'>('running');
  const [sha, setSha] = useState('');

  useEffect(() => {
    const run = async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      const buf = await res.arrayBuffer();
      const hash = createHash('sha256').update(Buffer.from(buf)).digest('hex');
      setSha(hash);
      setStatus('done');
      onDone(hash);
    };
    run().catch((err: Error) => onError(err.message));
  }, []);

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {status === 'running' ? (
        <Spinner label={`Fetching ${url}`} />
      ) : (
        <Text color="green">✔ sha256: {sha.slice(0, 16)}…</Text>
      )}
    </Box>
  );
}

function FileMoreStep({
  stepNum,
  urlFiles,
  onYes,
  onNo,
}: {
  stepNum: number;
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
      <Header step={stepNum} total={TOTAL} title={TITLE} />
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

function DoneStep({ id, onExit }: { id: string; onExit: () => void }) {
  useEffect(() => {
    const t = setTimeout(onExit, 300);
    return () => clearTimeout(t);
  }, [onExit]);

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="green" bold>
        ✔ Done!
      </Text>
      <Text>{'  '}packages/{id}.json written</Text>
      <Text>{'  '}Registry regenerated</Text>
      <Box marginTop={1}>
        <Text dimColor>Commit packages/{id}.json and cli/src/generated/registry.json</Text>
      </Box>
    </Box>
  );
}

function Wizard() {
  const { exit } = useApp();
  const [step, _setStep] = useState<Step>('id');
  const setStep = (next: Step) => { process.stdout.write('\x1B[2J\x1B[H'); _setStep(next); };
  const [data, setData] = useState<Partial<FormData>>({});
  const [urlFiles, setUrlFiles] = useState<UrlFile[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentSha, setCurrentSha] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [outputJson, setOutputJson] = useState('');

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStep('error');
  };

  if (step === 'id') {
    return (
      <TextInputStep
        stepNum={1}
        total={TOTAL}
        title={TITLE}
        label="Package ID"
        hint="Lowercase letters, numbers, dots, hyphens (e.g. anim8, hump.camera)"
        validate={(v) => {
          if (!v) return 'Required';
          if (!/^[a-z0-9][a-z0-9.-]*$/.test(v)) return 'Use only a-z, 0-9, dots, hyphens';
          if (existsSync(join(packagesDir, `${v}.json`)))
            return `packages/${v}.json already exists — use package:update to edit it`;
          return null;
        }}
        onSubmit={(id) => {
          setData((d) => ({ ...d, id }));
          setStep('trust');
        }}
      />
    );
  }

  if (step === 'trust') {
    return (
      <SelectStep
        stepNum={2}
        total={TOTAL}
        title={TITLE}
        label="Trust level"
        hint="verified = Feather-reviewed · known = popular, checksum-pinned"
        options={['verified', 'known']}
        onSelect={(trust) => {
          setData((d) => ({ ...d, trust: trust as FormData['trust'] }));
          setStep('description');
        }}
      />
    );
  }

  if (step === 'description') {
    return (
      <TextInputStep
        stepNum={3}
        total={TOTAL}
        title={TITLE}
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

  if (step === 'pkg-tags') {
    return (
      <TextInputStep
        stepNum={4}
        total={TOTAL}
        title={TITLE}
        label="Tags"
        hint="Comma-separated (e.g. animation,sprites)"
        validate={(v) => (v ? null : 'Required')}
        onSubmit={(tagStr) => {
          const tags = tagStr
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          setData((d) => ({ ...d, tags }));
          setStep('homepage');
        }}
      />
    );
  }

  if (step === 'homepage') {
    return (
      <TextInputStep
        stepNum={5}
        total={TOTAL}
        title={TITLE}
        label="Homepage URL"
        hint="Optional — leave blank to skip"
        onSubmit={(homepage) => {
          setData((d) => ({ ...d, homepage }));
          setStep('license');
        }}
      />
    );
  }

  if (step === 'license') {
    return (
      <TextInputStep
        stepNum={6}
        total={TOTAL}
        title={TITLE}
        label="License"
        hint="SPDX identifier (e.g. MIT, Apache-2.0) — leave blank if unknown"
        onSubmit={(license) => {
          setData((d) => ({ ...d, license }));
          setStep('file-url');
        }}
      />
    );
  }

  if (step === 'file-url') {
    const n = urlFiles.length;
    return (
      <TextInputStep
        stepNum={7}
        total={TOTAL}
        title={TITLE}
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
        onDone={(sha256) => {
          setCurrentSha(sha256);
          setStep('file-target');
        }}
        onError={handleError}
      />
    );
  }

  if (step === 'file-target') {
    const name = fileNameFromUrl(currentUrl);
    const suggested =
      urlFiles.length === 0
        ? `lib/${name}`
        : `lib/${data.id}/${name}`;
    return (
      <TextInputStep
        stepNum={7}
        total={TOTAL}
        title={TITLE}
        label={`Install target for ${name}`}
        hint="Path relative to project root (e.g. lib/anim8.lua)"
        defaultValue={suggested}
        validate={(v) => {
          if (!v) return 'Required';
          if (!v.endsWith('.lua')) return 'Must end in .lua';
          return null;
        }}
        onSubmit={(target) => {
          setUrlFiles((fs) => [
            ...fs,
            { name, url: currentUrl, sha256: currentSha, target },
          ]);
          setStep('file-more');
        }}
      />
    );
  }

  if (step === 'file-more') {
    return (
      <FileMoreStep
        stepNum={7}
        urlFiles={urlFiles}
        onYes={() => setStep('file-url')}
        onNo={() => setStep('require')}
      />
    );
  }

  if (step === 'require') {
    const firstName = urlFiles[0]?.name ?? `${data.id}.lua`;
    const suggested = `lib.${firstName.replace(/\.lua$/, '').replace(/\//g, '.')}`;
    return (
      <TextInputStep
        stepNum={8}
        total={TOTAL}
        title={TITLE}
        label="Require path"
        defaultValue={suggested}
        validate={(v) => (v ? null : 'Required')}
        onSubmit={(req) => {
          const example = `local ${data.id!.replace(/[.-]/g, '_')} = require('${req}')`;
          setData((d) => ({ ...d, require: req, example }));
          setStep('subpkgs');
        }}
      />
    );
  }

  if (step === 'subpkgs') {
    return (
      <SubpackagesStep
        stepNum={9}
        total={TOTAL}
        title={TITLE}
        selectedFiles={urlFiles.map((f) => f.name)}
        onSubmit={(subpackages) => {
          setData((d) => ({ ...d, subpackages }));
          const full = { ...data, subpackages } as FormData;
          setOutputJson(JSON.stringify(buildPackageJson(full, urlFiles), null, 2));
          setStep('review');
        }}
      />
    );
  }

  if (step === 'review') {
    return (
      <ReviewStep
        stepNum={10}
        total={TOTAL}
        title={TITLE}
        json={outputJson}
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
      <AutoStep
        label={`Writing packages/${data.id}.json and regenerating registry…`}
        run={async () => {
          writeFileSync(join(packagesDir, `${data.id}.json`), outputJson + '\n', 'utf8');
          const result = spawnSync(process.execPath, [join(root, 'scripts', 'generate-registry.mjs')], {
            cwd: root,
            stdio: 'pipe',
            encoding: 'utf8',
          });
          if (result.status !== 0) throw new Error(result.stderr || 'generate-registry.mjs failed');
          setStep('done');
        }}
        onError={handleError}
      />
    );
  }

  if (step === 'done') return <DoneStep id={data.id!} onExit={exit} />;

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="red" bold>
        ✖ Error
      </Text>
      <Text>{errorMsg}</Text>
    </Box>
  );
}

process.stdout.write('\x1B[2J\x1B[H');
const { waitUntilExit } = render(<Wizard />);
await waitUntilExit();
