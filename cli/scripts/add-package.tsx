#!/usr/bin/env node
/**
 * Interactive wizard to add a new package to the Feather catalog.
 *
 * Usage (from repo root):
 *   npm run package:add
 */

import { render, Text, Box, useApp } from 'ink';
import { useState, useEffect } from 'react';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  root,
  packagesDir,
  type FormData,
  type FileEntry,
  TextInputStep,
  SelectStep,
  MultiSelectStep,
  AutoStep,
  TargetsStep,
  SubpackagesStep,
  ReviewStep,
  ChecksumStep,
  fetchRepoMeta,
  fetchCommitSha,
  fetchLuaFiles,
  buildPackageJson,
} from './wizard-shared.js';

type Step =
  | 'id'
  | 'repo'
  | 'fetch-tags'
  | 'tag'
  | 'resolve-commit'
  | 'trust'
  | 'description'
  | 'pkg-tags'
  | 'fetch-files'
  | 'files'
  | 'targets'
  | 'require'
  | 'subpkgs'
  | 'fetch-checksums'
  | 'review'
  | 'write'
  | 'done'
  | 'error';

const TITLE = 'feather package:add';
const TOTAL = 12;

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
      <Text>
        {'  '}packages/{id}.json written
      </Text>
      <Text>{'  '}Registry regenerated</Text>
      <Box marginTop={1}>
        <Text dimColor>Commit packages/{id}.json and cli/src/generated/registry.json</Text>
      </Box>
      <Box>
        <Text dimColor>Then push — GitHub Actions will publish to the packages branch.</Text>
      </Box>
    </Box>
  );
}

function Wizard() {
  const { exit } = useApp();
  const [step, _setStep] = useState<Step>('id');
  const setStep = (next: Step) => { process.stdout.write('\x1B[2J\x1B[H'); _setStep(next); };
  const [data, setData] = useState<Partial<FormData>>({});
  const [fetchedTags, setFetchedTags] = useState<string[]>([]);
  const [fetchedLabels, setFetchedLabels] = useState<string[]>([]);
  const [fetchedFiles, setFetchedFiles] = useState<string[]>([]);
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
          setStep('repo');
        }}
      />
    );
  }

  if (step === 'repo') {
    return (
      <TextInputStep
        stepNum={2}
        total={TOTAL}
        title={TITLE}
        label="GitHub repository"
        hint="owner/repo  (e.g. kikito/anim8)"
        validate={(v) => {
          if (!v) return 'Required';
          if (!/^[^/]+\/[^/]+$/.test(v)) return 'Must be owner/repo format';
          return null;
        }}
        onSubmit={(repo) => {
          setData((d) => ({ ...d, repo, homepage: `https://github.com/${repo}` }));
          setStep('fetch-tags');
        }}
      />
    );
  }

  if (step === 'fetch-tags') {
    return (
      <AutoStep
        label={`Fetching metadata for ${data.repo}…`}
        run={async () => {
          const { tags, branches, defaultBranch, license } = await fetchRepoMeta(data.repo!);
          if (tags.length === 0 && branches.length === 0) throw new Error('No tags or branches found.');
          const orderedBranches = [defaultBranch, ...branches.filter((b) => b !== defaultBranch)];
          const values = [...tags, ...orderedBranches];
          const labels = [...tags.map((t) => t), ...orderedBranches.map((b) => `⎇  ${b}`)];
          setFetchedTags(values);
          setFetchedLabels(labels);
          setData((d) => ({ ...d, license }));
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
        total={TOTAL}
        title={TITLE}
        label="Select tag or branch to pin"
        hint={`${fetchedTags.length} options · tags first, then branches (⎇)`}
        options={fetchedTags}
        labels={fetchedLabels}
        onSelect={(tag) => {
          setData((d) => ({ ...d, tag }));
          setStep('resolve-commit');
        }}
      />
    );
  }

  if (step === 'resolve-commit') {
    return (
      <AutoStep
        label={`Resolving ${data.tag} to commit SHA…`}
        run={async () => {
          const commitSha = await fetchCommitSha(data.repo!, data.tag!);
          setData((d) => ({
            ...d,
            commitSha,
            baseUrl: `https://raw.githubusercontent.com/${d.repo}/${commitSha}/`,
          }));
          setStep('trust');
        }}
        onError={handleError}
      />
    );
  }

  if (step === 'trust') {
    return (
      <SelectStep
        stepNum={4}
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
        stepNum={5}
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
        stepNum={6}
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
          setStep('fetch-files');
        }}
      />
    );
  }

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

  if (step === 'files') {
    return (
      <MultiSelectStep
        stepNum={7}
        total={TOTAL}
        title={TITLE}
        label="Select files to install"
        hint={`${fetchedFiles.length} .lua files · all selected by default`}
        options={fetchedFiles}
        onSubmit={(selectedFiles) => {
          setData((d) => ({ ...d, selectedFiles }));
          setStep('targets');
        }}
      />
    );
  }

  if (step === 'targets') {
    return (
      <TargetsStep
        stepNum={8}
        total={TOTAL}
        title={TITLE}
        id={data.id!}
        files={data.selectedFiles!}
        onSubmit={(targetMap) => {
          setData((d) => ({ ...d, targetMap }));
          setStep('require');
        }}
      />
    );
  }

  if (step === 'require') {
    const firstTarget = Object.values(data.targetMap ?? {})[0] ?? `lib/${data.id}.lua`;
    const suggested = firstTarget.replace(/\.lua$/, '').replace(/\//g, '.');
    return (
      <TextInputStep
        stepNum={9}
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
        stepNum={10}
        total={TOTAL}
        title={TITLE}
        selectedFiles={data.selectedFiles!}
        onSubmit={(subpackages) => {
          setData((d) => ({ ...d, subpackages }));
          setStep('fetch-checksums');
        }}
      />
    );
  }

  if (step === 'fetch-checksums') {
    const fileList = (data.selectedFiles ?? []).map((name) => ({ name, url: data.baseUrl! + name }));
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
          setOutputJson(JSON.stringify(buildPackageJson(fullData), null, 2));
          setStep('review');
        }}
        onError={handleError}
      />
    );
  }

  if (step === 'review') {
    return (
      <ReviewStep
        stepNum={11}
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
