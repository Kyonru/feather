import { render, Text, Box, useApp } from 'ink';
import { useState } from 'react';
import type { PackageAddPlan } from '../../lib/package/add-plan.js';
import type { Lockfile } from '../../lib/package/lockfile.js';
import {
  type UrlFile,
  TextInputStep,
  SelectStep,
  MultiSelectStep,
  AutoStep,
  TargetsStep,
  FileFetchStep,
  FileMoreStep,
} from '../components.js';
import { fetchCommitSha, fetchLuaFiles } from '../../lib/github.js';
import { listGitLuaFiles, listGitRefs, resolveGitRef } from '../../lib/package/git-source.js';
import { fileNameFromUrl } from '../../lib/url.js';
import { fetchRepoMeta, REPO_TOTAL, URL_TOTAL } from './add-helpers.js';
import { RepoConfirmStep, UrlConfirmStep } from './add-steps.js';

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
  | 'error';

function Wizard({ lockfile, onPlan }: { lockfile: Lockfile; onPlan: (plan: PackageAddPlan | null) => void }) {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<'repo' | 'git-repo' | 'url' | null>(null);

  // Shared
  const [id, setId] = useState('');
  const [requirePath, setRequirePath] = useState('');

  // Repo flow
  const [repoName, setRepoName] = useState('');
  const [tag, setTag] = useState('');
  const [commitSha, setCommitSha] = useState('');
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
  const repoMode = mode === 'repo' || mode === 'git-repo';

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStep('error');
  };

  const finishWithPlan = (plan: PackageAddPlan | null) => {
    onPlan(plan);
    exit();
  };

  if (step === 'choose') {
    return (
      <SelectStep
        label="How do you want to add this package?"
        options={['repo', 'git-repo', 'url']}
        labels={[
          'From public GitHub repository  (commit-SHA pinned, reproducible)',
          'From Git repository using local git credentials',
          'From direct URL(s)',
        ]}
        onSelect={(v) => {
          setMode(v as 'repo' | 'git-repo' | 'url');
          setStep('id');
        }}
      />
    );
  }

  if (step === 'id') {
    return (
      <TextInputStep
        key="package-add-id"
        stepNum={1}
        total={repoMode ? REPO_TOTAL : URL_TOTAL}
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
          setStep(repoMode ? 'repo' : 'file-url');
        }}
      />
    );
  }

  if (step === 'repo') {
    return (
      <TextInputStep
        key="package-add-repo"
        stepNum={2}
        total={REPO_TOTAL}
        label="GitHub repository"
        hint="owner/repo  (e.g. kikito/anim8)"
        validate={(v) => {
          if (!v) return 'Required';
          if (mode === 'repo' && !/^[^/]+\/[^/]+$/.test(v)) return 'Must be owner/repo format';
          if (mode === 'git-repo' && !/^(?:[^/]+\/[^/]+|https?:\/\/.+|ssh:\/\/.+|git@.+:.+)$/.test(v)) {
            return 'Use owner/repo, https://..., ssh://..., or git@host:owner/repo.git';
          }
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
        key="fetch-tags"
        label={`Fetching tags for ${repoName}…`}
        run={async () => {
          const { values, labels } = mode === 'git-repo'
            ? (() => {
                const result = listGitRefs(repoName);
                if (!result.ok) throw new Error(result.error);
                return { values: result.refs.map((ref) => ref.value), labels: result.refs.map((ref) => ref.label) };
              })()
            : await fetchRepoMeta(repoName);
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
        key="resolve-commit"
        label={`Resolving ${tag} to commit SHA…`}
        run={async () => {
          const sha = mode === 'git-repo'
            ? (() => {
                const result = resolveGitRef(repoName, tag);
                if (!result.ok) throw new Error(result.error);
                return result.commitSha;
              })()
            : await fetchCommitSha(repoName, tag);
          setCommitSha(sha);
          setBaseUrl(mode === 'git-repo' ? '' : `https://raw.githubusercontent.com/${repoName}/${sha}/`);
          setStep('fetch-files');
        }}
        onError={handleError}
      />
    );
  }

  if (step === 'fetch-files') {
    return (
      <AutoStep
        key="fetch-files"
        label={`Fetching file list for ${repoName}@${commitSha.slice(0, 12)}…`}
        run={async () => {
          const files = mode === 'git-repo'
            ? (() => {
                const result = listGitLuaFiles({ repo: repoName, tag, commitSha });
                if (!result.ok) throw new Error(result.error);
                return result.files;
              })()
            : await fetchLuaFiles(repoName, commitSha);
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
      repoMode ? (Object.values(targetMap)[0] ?? `lib/${id}.lua`) : (urlFiles[0]?.target ?? `lib/${id}.lua`);
    const suggested = firstTarget.replace(/\.lua$/, '').replace(/\//g, '.');
    return (
      <TextInputStep
        key="package-add-require"
        stepNum={repoMode ? 6 : 3}
        total={repoMode ? REPO_TOTAL : URL_TOTAL}
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
    if (repoMode) {
      return (
        <RepoConfirmStep
          id={id}
          repoName={repoName}
          tag={tag}
          selectedFiles={selectedFiles}
          targetMap={targetMap}
          transport={mode === 'git-repo' ? 'git' : 'raw'}
          onConfirm={() =>
            finishWithPlan({
              kind: 'repo',
              id,
              requirePath,
              repoName,
              tag,
              commitSha,
              baseUrl,
              ...(mode === 'git-repo' ? { transport: 'git' as const } : {}),
              selectedFiles,
              targetMap,
            })
          }
          onAbort={() => finishWithPlan(null)}
        />
      );
    }
    return (
      <UrlConfirmStep
        id={id}
        urlFiles={urlFiles}
        onConfirm={() =>
          finishWithPlan({
            kind: 'url',
            id,
            requirePath,
            urlFiles,
          })
        }
        onAbort={() => finishWithPlan(null)}
      />
    );
  }

  if (step === 'file-url') {
    const n = urlFiles.length;
    return (
      <TextInputStep
        key={`package-add-file-url-${n}`}
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
        key={`package-add-file-target-${currentUrl}`}
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

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="red" bold>
        ✖ Error
      </Text>
      <Text>{errorMsg}</Text>
    </Box>
  );
}

export async function showAddWizard(opts: { projectDir: string; lockfile: Lockfile }): Promise<PackageAddPlan | null> {
  let plan: PackageAddPlan | null = null;
  const { waitUntilExit } = render(<Wizard lockfile={opts.lockfile} onPlan={(nextPlan) => (plan = nextPlan)} />, {
    alternateScreen: true,
  });
  await waitUntilExit();
  return plan;
}
