#!/usr/bin/env node
/**
 * Interactive wizard to remove a package from the Feather catalog.
 *
 * Usage (from repo root):
 *   npm run package:remove
 */

import { render, Text, Box, useInput, useApp } from 'ink';
import { useState, useEffect } from 'react';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, packagesDir, SelectStep, AutoStep } from './wizard-shared.js';

const TITLE = 'feather package:remove';

function ConfirmStep({ id, onConfirm, onAbort }: { id: string; onConfirm: () => void; onAbort: () => void }) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y' || key.return) onConfirm();
    if (input === 'n' || input === 'N' || key.escape) onAbort();
  });

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text bold color="cyan">{'  '}{TITLE}</Text>
      <Box marginTop={1}>
        <Text>{'  Remove '}</Text>
        <Text bold color="red">{id}</Text>
        <Text>{'  from the catalog?'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  This deletes packages/'}{id}{'.json and regenerates the registry.'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  y/Enter to confirm · n/Esc to abort'}</Text>
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
      <Text color="green" bold>✔ Done!</Text>
      <Text>{'  '}packages/{id}.json removed</Text>
      <Text>{'  '}Registry regenerated</Text>
      <Box marginTop={1}>
        <Text dimColor>Commit the deletions and cli/src/generated/registry.json</Text>
      </Box>
    </Box>
  );
}

type Step = 'pick' | 'confirm' | 'remove' | 'done' | 'error';

function Wizard() {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('pick');
  const [id, setId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleError = (msg: string) => { setErrorMsg(msg); setStep('error'); };

  if (step === 'pick') {
    const ids = readdirSync(packagesDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();

    return (
      <SelectStep
        stepNum={1} total={2} title={TITLE}
        label="Which package do you want to remove?"
        options={ids}
        onSelect={(picked) => { setId(picked); setStep('confirm'); }}
      />
    );
  }

  if (step === 'confirm') {
    return (
      <ConfirmStep
        id={id}
        onConfirm={() => setStep('remove')}
        onAbort={() => { setErrorMsg('Aborted.'); setStep('error'); }}
      />
    );
  }

  if (step === 'remove') {
    return (
      <AutoStep
        label={`Removing packages/${id}.json and regenerating registry…`}
        run={async () => {
          rmSync(join(packagesDir, `${id}.json`));
          const result = spawnSync(process.execPath, [join(root, 'scripts', 'generate-registry.mjs')], {
            cwd: root, stdio: 'pipe', encoding: 'utf8',
          });
          if (result.status !== 0) throw new Error(result.stderr || 'generate-registry.mjs failed');
          setStep('done');
        }}
        onError={handleError}
      />
    );
  }

  if (step === 'done') return <DoneStep id={id} onExit={exit} />;

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="red" bold>✖ Error</Text>
      <Text>{errorMsg}</Text>
    </Box>
  );
}

const { waitUntilExit } = render(<Wizard />);
await waitUntilExit();
