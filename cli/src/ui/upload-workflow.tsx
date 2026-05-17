import React, { useMemo, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildTargets, uploadTargets, type BuildTarget, type UploadTarget, loadBuildConfig } from '../lib/build/config.js';
import { readLatestManifest } from '../lib/build/files.js';
import { BooleanStep, SelectStep, TextInputStep } from './components.js';

export type UploadWorkflowResult =
  | { cancelled: true }
  | {
      cancelled: false;
      target: UploadTarget;
      buildTarget: BuildTarget;
      dir: string;
      config?: string;
      buildDir?: string;
      project?: string;
      channel?: string;
      userVersion?: string;
      build: boolean;
      dryRun: boolean;
      allowFeatherRuntime: boolean;
      confirmed: boolean;
    };

type UploadWorkflowInput = {
  dir?: string;
  config?: string;
  buildDir?: string;
  project?: string;
  channel?: string;
  userVersion?: string;
};

type Phase =
  | 'dir'
  | 'target'
  | 'buildTarget'
  | 'project'
  | 'channel'
  | 'version'
  | 'build'
  | 'dryRun'
  | 'allowRuntime'
  | 'confirm';

const title = 'feather upload';
const total = 10;

function defaultBuildTarget(dir: string, buildDir?: string): BuildTarget {
  const config = loadConfigSafe(dir);
  const outDir = buildDir ?? config?.outDir ?? 'builds';
  const manifest = readLatestManifest(join(dir, outDir));
  const target = manifest?.target;
  return buildTargets.includes(target as BuildTarget) ? (target as BuildTarget) : 'web';
}

function loadConfigSafe(dir: string, config?: string) {
  try {
    return loadBuildConfig({ projectDir: dir, configPath: config });
  } catch {
    return null;
  }
}

function Summary({
  values,
  onConfirm,
  onCancel,
}: {
  values: Extract<UploadWorkflowResult, { cancelled: false }>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useInput((input, key) => {
    if (key.escape || input === 'n' || input === 'N') onCancel();
    if (key.return || input === 'y' || input === 'Y') onConfirm();
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{'  '}feather upload</Text>
      <Text dimColor>{'  '}Review upload plan</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>{'  '}Target: {values.target}</Text>
        <Text>{'  '}Build: {values.buildTarget}</Text>
        <Text>{'  '}Project dir: {values.dir}</Text>
        <Text>{'  '}Itch project: {values.project || '(from feather.build.json)'}</Text>
        <Text>{'  '}Channel: {values.channel || '(from feather.build.json/default)'}</Text>
        <Text>{'  '}Version: {values.userVersion || '(from feather.build.json)'}</Text>
        <Text>{'  '}Build first: {values.build ? 'yes' : 'no'}</Text>
        <Text>{'  '}Action: {values.dryRun ? 'dry run' : 'upload'}</Text>
        <Text>{'  '}Runtime override: {values.allowFeatherRuntime ? 'yes' : 'no'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  '}Enter/y upload plan · n/Esc cancel</Text>
      </Box>
    </Box>
  );
}

function UploadWorkflow({ input, onComplete }: { input: UploadWorkflowInput; onComplete: (result: UploadWorkflowResult) => void }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('dir');
  const [dir, setDir] = useState(input.dir ?? '.');
  const [target, setTarget] = useState<UploadTarget>('itch');
  const [buildTarget, setBuildTarget] = useState<BuildTarget>(() => defaultBuildTarget(input.dir ?? '.', input.buildDir));
  const [project, setProject] = useState(input.project ?? '');
  const [channel, setChannel] = useState(input.channel ?? '');
  const [version, setVersion] = useState(input.userVersion ?? '');
  const [build, setBuild] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [allowRuntime, setAllowRuntime] = useState(false);

  const config = useMemo(() => loadConfigSafe(dir, input.config), [dir, input.config]);
  const configProject = config?.upload.itch?.project ?? '';
  const configChannel = config?.upload.itch?.channels?.[buildTarget] ?? buildTarget;
  const configVersion = config?.version ?? '';
  const manifestExists = useMemo(() => {
    const outDir = input.buildDir ?? config?.outDir ?? 'builds';
    return existsSync(join(dir, outDir, 'feather-build-manifest.json'));
  }, [dir, input.buildDir, config?.outDir]);

  const finish = (result: UploadWorkflowResult) => {
    onComplete(result);
    exit();
  };

  const cancel = () => finish({ cancelled: true });
  const result = (): Extract<UploadWorkflowResult, { cancelled: false }> => ({
    cancelled: false,
    target,
    buildTarget,
    dir,
    config: input.config,
    buildDir: input.buildDir,
    project: project || configProject || undefined,
    channel: channel || configChannel || undefined,
    userVersion: version || configVersion || undefined,
    build,
    dryRun,
    allowFeatherRuntime: allowRuntime,
    confirmed: true,
  });

  if (phase === 'dir') {
    return (
      <TextInputStep
        stepNum={1}
        total={total}
        title={title}
        label="Project directory"
        defaultValue={dir}
        onSubmit={(value) => {
          setDir(value || '.');
          setBuildTarget(defaultBuildTarget(value || '.', input.buildDir));
          setPhase('target');
        }}
      />
    );
  }

  if (phase === 'target') {
    return (
      <SelectStep
        stepNum={2}
        total={total}
        title={title}
        label="Upload target"
        options={[...uploadTargets]}
        descriptions={uploadTargets.map((value) => value === 'itch' ? 'Upload with butler.' : 'Planned, not supported yet.')}
        onSelect={(value) => {
          setTarget(value as UploadTarget);
          setPhase('buildTarget');
        }}
        onCancel={cancel}
      />
    );
  }

  if (phase === 'buildTarget') {
    return (
      <SelectStep
        stepNum={3}
        total={total}
        title={title}
        label="Build target to upload"
        hint={manifestExists ? 'Detected an existing build manifest.' : 'No build manifest detected; choose a target to build or upload.'}
        options={[...buildTargets]}
        initialIndex={Math.max(0, buildTargets.indexOf(buildTarget))}
        onSelect={(value) => {
          setBuildTarget(value as BuildTarget);
          setPhase('project');
        }}
        onCancel={cancel}
      />
    );
  }

  if (phase === 'project') {
    return (
      <TextInputStep
        stepNum={4}
        total={total}
        title={title}
        label="Itch project"
        hint='Format: "user/game". Leave the default if feather.build.json has it.'
        defaultValue={project || configProject}
        onSubmit={(value) => {
          setProject(value);
          setPhase('channel');
        }}
      />
    );
  }

  if (phase === 'channel') {
    return (
      <TextInputStep
        stepNum={5}
        total={total}
        title={title}
        label="Upload channel"
        defaultValue={channel || configChannel}
        onSubmit={(value) => {
          setChannel(value);
          setPhase('version');
        }}
      />
    );
  }

  if (phase === 'version') {
    return (
      <TextInputStep
        stepNum={6}
        total={total}
        title={title}
        label="User version"
        defaultValue={version || configVersion}
        onSubmit={(value) => {
          setVersion(value);
          setPhase('build');
        }}
      />
    );
  }

  if (phase === 'build') {
    return (
      <BooleanStep
        stepNum={7}
        total={total}
        title={title}
        label={manifestExists ? 'Build a fresh artifact first?' : 'No build manifest found. Build first?'}
        defaultYes={!manifestExists}
        onConfirm={() => {
          setBuild(true);
          setPhase('dryRun');
        }}
        onCancel={() => {
          setBuild(false);
          setPhase('dryRun');
        }}
      />
    );
  }

  if (phase === 'dryRun') {
    return (
      <BooleanStep
        stepNum={8}
        total={total}
        title={title}
        label="Start with a dry run?"
        hint="Recommended. You can rerun and choose upload after reviewing the command."
        defaultYes
        onConfirm={() => {
          setDryRun(true);
          setPhase('allowRuntime');
        }}
        onCancel={() => {
          setDryRun(false);
          setPhase('allowRuntime');
        }}
      />
    );
  }

  if (phase === 'allowRuntime') {
    return (
      <BooleanStep
        stepNum={9}
        total={total}
        title={title}
        label="Allow upload if Feather runtime is detected or cannot be inspected?"
        hint="Use only for intentional internal builds."
        defaultYes={false}
        tone="danger"
        onConfirm={() => {
          setAllowRuntime(true);
          setPhase('confirm');
        }}
        onCancel={() => {
          setAllowRuntime(false);
          setPhase('confirm');
        }}
      />
    );
  }

  return (
    <Summary
      values={result()}
      onConfirm={() => finish(result())}
      onCancel={cancel}
    />
  );
}

export async function chooseUploadWorkflow(input: UploadWorkflowInput = {}): Promise<UploadWorkflowResult> {
  return new Promise((resolve) => {
    render(<UploadWorkflow input={input} onComplete={resolve} />);
  });
}
