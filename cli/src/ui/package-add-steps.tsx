import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { installCustomRepoPackage, installCustomUrlPackage } from '../lib/package/custom-add.js';
import type { Lockfile } from '../lib/package/lockfile.js';
import type { UrlFile } from './components.js';
import { REPO_TOTAL, URL_TOTAL } from './package-add-helpers.js';

export function RepoConfirmStep({
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
        {selectedFiles.map((file) => (
          <Text key={file}>
            {'  '}
            {file} <Text dimColor>→ {targetMap[file]}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  y/Enter = install · n/Esc = abort'}</Text>
      </Box>
    </Box>
  );
}
export function UrlConfirmStep({
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
        {urlFiles.map((file) => (
          <Box key={file.url} flexDirection="column">
            <Text>
              {'  '}
              {file.name} <Text dimColor>→ {file.target}</Text>
            </Text>
            <Text dimColor>
              {'    sha256: '}
              {file.sha256.slice(0, 24)}…
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

export function InstallStep({
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
      const result = await installCustomRepoPackage({
        id,
        repoName,
        tag,
        baseUrl,
        selectedFiles,
        targetMap,
        projectDir,
        lockfile,
        onFileStart: setCurrent,
      });
      if (!result.ok) throw new Error(result.error ?? 'Install failed');
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

export function WriteStep({
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
      const result = await installCustomUrlPackage({
        id,
        urlFiles,
        projectDir,
        lockfile,
      });
      if (!result.ok) throw new Error(result.error ?? 'Install failed');
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

export function DoneStep({
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
      {files.map((file) => (
        <Text key={file.name}>
          {'  '}
          {file.name} <Text dimColor>→ {file.target}</Text>
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
