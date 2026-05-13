#!/usr/bin/env node
/**
 * Interactive wizard to update an existing package in the Feather catalog.
 *
 * Usage (from repo root):
 *   npm run package:update
 *
 * Loads packages/<id>.json, pre-fills every field so you can change only
 * what's wrong, re-computes checksums, and overwrites the file.
 */

import { render, Text, Box, useApp } from 'ink';
import { useState, useEffect } from 'react';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
  | 'pick'
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

interface RawPackage {
  trust?: string;
  description?: string;
  tags?: string[];
  homepage?: string;
  license?: string;
  source?: { repo?: string; tag?: string; commitSha?: string; baseUrl?: string };
  install?: { files?: Array<{ name: string; sha256: string; target: string }> };
  require?: string;
  example?: string;
  subpackages?: Record<string, { files: string[]; require: string }>;
}

const TITLE = 'feather package:update';
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
        {'  '}packages/{id}.json updated
      </Text>
      <Text>{'  '}Registry regenerated</Text>
      <Box marginTop={1}>
        <Text dimColor>Commit packages/{id}.json and cli/src/generated/registry.json</Text>
      </Box>
    </Box>
  );
}

function Wizard() {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('pick');
  const [data, setData] = useState<Partial<FormData>>({});
  const [fetchedTags, setFetchedTags] = useState<string[]>([]);
  const [fetchedFiles, setFetchedFiles] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [outputJson, setOutputJson] = useState('');

  // pre-selection state from the loaded package
  const [fetchedLabels, setFetchedLabels] = useState<string[]>([]);
  const [initialTagIndex, setInitialTagIndex] = useState(0);
  const [initialFileSelected, setInitialFileSelected] = useState<Set<number> | undefined>(undefined);
  const [initialTargets, setInitialTargets] = useState<Record<string, string> | undefined>(undefined);
  const [initialSubpkgs, setInitialSubpkgs] = useState<Record<string, { files: string[]; require: string }> | undefined>(undefined);

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStep('error');
  };

  // Step 1: pick which package to update
  if (step === 'pick') {
    const ids = readdirSync(packagesDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();

    return (
      <SelectStep
        stepNum={1}
        total={TOTAL}
        title={TITLE}
        label="Which package do you want to update?"
        options={ids}
        onSelect={(id) => {
          const raw: RawPackage = JSON.parse(readFileSync(join(packagesDir, `${id}.json`), 'utf8'));
          const existingFiles = raw.install?.files ?? [];
          setInitialTargets(Object.fromEntries(existingFiles.map((f) => [f.name, f.target])));
          setInitialSubpkgs(raw.subpackages ?? undefined);
          setData({
            id,
            repo: raw.source?.repo ?? '',
            homepage: raw.homepage ?? `https://github.com/${raw.source?.repo ?? ''}`,
            license: raw.license ?? '',
            tag: raw.source?.tag ?? '',
            commitSha: raw.source?.commitSha ?? '',
            baseUrl: raw.source?.baseUrl ?? '',
            trust: (raw.trust as FormData['trust']) ?? 'known',
            description: raw.description ?? '',
            tags: raw.tags ?? [],
            selectedFiles: existingFiles.map((f) => f.name),
            targetMap: Object.fromEntries(existingFiles.map((f) => [f.name, f.target])),
            require: raw.require ?? '',
            example: raw.example ?? '',
            subpackages: raw.subpackages,
          });
          setStep('repo');
        }}
      />
    );
  }

  // Step 2: repo (pre-filled)
  if (step === 'repo') {
    return (
      <TextInputStep
        stepNum={2}
        total={TOTAL}
        title={TITLE}
        label="GitHub repository"
        hint="owner/repo — edit if the source moved"
        defaultValue={data.repo ?? ''}
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

  // Step 3: fetch tags + license
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
          // pre-position cursor at the currently pinned tag/branch
          const idx = values.indexOf(data.tag ?? '');
          setInitialTagIndex(idx >= 0 ? idx : 0);
          setData((d) => ({ ...d, license }));
          setStep('tag');
        }}
        onError={handleError}
      />
    );
  }

  // Step 4: select tag or branch (cursor starts at current pin)
  if (step === 'tag') {
    return (
      <SelectStep
        stepNum={3}
        total={TOTAL}
        title={TITLE}
        label="Select tag or branch to pin"
        hint={`currently pinned: ${data.tag ?? '—'} · tags first, then branches (⎇)`}
        options={fetchedTags}
        labels={fetchedLabels}
        initialIndex={initialTagIndex}
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

  // Step 5: trust level
  if (step === 'trust') {
    const currentIdx = ['verified', 'known'].indexOf(data.trust ?? 'known');
    return (
      <SelectStep
        stepNum={4}
        total={TOTAL}
        title={TITLE}
        label="Trust level"
        hint="verified = Feather-reviewed · known = popular, checksum-pinned"
        options={['verified', 'known']}
        initialIndex={currentIdx >= 0 ? currentIdx : 0}
        onSelect={(trust) => {
          setData((d) => ({ ...d, trust: trust as FormData['trust'] }));
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
        total={TOTAL}
        title={TITLE}
        label="Description"
        defaultValue={data.description ?? ''}
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
        total={TOTAL}
        title={TITLE}
        label="Tags"
        hint="Comma-separated (e.g. animation,sprites)"
        defaultValue={(data.tags ?? []).join(', ')}
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

  // Step 8: fetch files for the (possibly new) tag
  if (step === 'fetch-files') {
    return (
      <AutoStep
        label={`Fetching file tree for ${data.repo}@${data.tag}…`}
        run={async () => {
          const files = await fetchLuaFiles(data.repo!, data.tag!);
          if (files.length === 0) throw new Error('No .lua files found at this tag.');
          setFetchedFiles(files);
          // pre-select files that were already installed
          const existing = new Set(data.selectedFiles ?? []);
          setInitialFileSelected(
            new Set(
              files
                .map((f, i) => ({ f, i }))
                .filter(({ f }) => existing.has(f))
                .map(({ i }) => i),
            ),
          );
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
        total={TOTAL}
        title={TITLE}
        label="Select files to install"
        hint={`${fetchedFiles.length} .lua files · previously installed files pre-selected`}
        options={fetchedFiles}
        initialSelected={initialFileSelected}
        onSubmit={(selectedFiles) => {
          setData((d) => ({ ...d, selectedFiles }));
          setStep('targets');
        }}
      />
    );
  }

  // Step 10: target paths (pre-filled from existing package)
  if (step === 'targets') {
    return (
      <TargetsStep
        stepNum={8}
        total={TOTAL}
        title={TITLE}
        id={data.id!}
        files={data.selectedFiles!}
        initialTargets={initialTargets}
        onSubmit={(targetMap) => {
          setData((d) => ({ ...d, targetMap }));
          setStep('require');
        }}
      />
    );
  }

  // Step 11: require path
  if (step === 'require') {
    return (
      <TextInputStep
        stepNum={9}
        total={TOTAL}
        title={TITLE}
        label="Require path"
        defaultValue={data.require ?? ''}
        validate={(v) => (v ? null : 'Required')}
        onSubmit={(req) => {
          const example = `local ${data.id!.replace(/[.-]/g, '_')} = require('${req}')`;
          setData((d) => ({ ...d, require: req, example }));
          setStep('subpkgs');
        }}
      />
    );
  }

  // Step 12: submodules
  if (step === 'subpkgs') {
    return (
      <SubpackagesStep
        stepNum={10}
        total={TOTAL}
        title={TITLE}
        selectedFiles={data.selectedFiles!}
        initialSubpackages={initialSubpkgs}
        onSubmit={(subpackages) => {
          setData((d) => ({ ...d, subpackages }));
          setStep('fetch-checksums');
        }}
      />
    );
  }

  // Step 13: compute checksums (always fresh — tag may have changed)
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

  // Step 14: review
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

  // Step 14: write + regenerate
  if (step === 'write') {
    return (
      <AutoStep
        label={`Updating packages/${data.id}.json and regenerating registry…`}
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

const { waitUntilExit } = render(<Wizard />);
await waitUntilExit();
