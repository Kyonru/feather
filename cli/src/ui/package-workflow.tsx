import { useState, useMemo, useEffect } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import type { Registry, RegistryEntry } from '../lib/package/registry.js';
import type { Lockfile, LockfileEntry } from '../lib/package/lockfile.js';

export type PackageWorkflowResult = { action: 'install' | 'update' | 'remove'; id: string } | { action: 'cancel' };

type Phase = 'browse' | 'action';
type ActionOption = { value: 'install' | 'update' | 'remove' | 'cancel'; label: string };

type PackageRow = {
  id: string;
  entry: RegistryEntry;
  installed?: LockfileEntry;
};

const VISIBLE = 14;
const VER_W = 10;
const TRUST_W = 13;

function trustLabel(trust: string) {
  if (trust === 'verified') return 'verified';
  if (trust === 'known') return 'known';
  return 'experimental';
}

function trustColor(trust: string): string {
  if (trust === 'verified') return 'green';
  if (trust === 'known') return 'yellow';
  return 'red';
}

function PackageWorkflow({
  registry,
  lockfile,
  onComplete,
}: {
  registry: Registry;
  lockfile: Lockfile;
  onComplete: (result: PackageWorkflowResult) => void;
}) {
  const { exit } = useApp();

  // Delay input activation so the Enter that launched the command isn't
  // replayed into useInput. Using isActive (not a ref) is the canonical ink
  // approach — when false, ink doesn't register the handler at all.
  const [inputActive, setInputActive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setInputActive(true), 150);
    return () => clearTimeout(t);
  }, []);

  const [phase, setPhase] = useState<Phase>('browse');
  const [filter, setFilter] = useState('');
  const [cursor, setCursor] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionCursor, setActionCursor] = useState(0);

  const allPackages = useMemo<PackageRow[]>(
    () =>
      Object.entries(registry.packages)
        .filter(([, e]) => !e.parent)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, entry]) => ({ id, entry, installed: lockfile.packages[id] })),
    [registry, lockfile],
  );

  // Column width: longest name + 2 spaces of padding
  const NAME_W = useMemo(() => Math.max(8, ...allPackages.map((p) => p.id.length)) + 2, [allPackages]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allPackages;
    return allPackages.filter(
      ({ id, entry }) =>
        id.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [allPackages, filter]);

  // Clamp cursor when the filtered list shrinks
  useEffect(() => {
    setCursor((c) => (filtered.length === 0 ? 0 : Math.min(c, filtered.length - 1)));
  }, [filtered.length]);

  const windowStart = Math.max(0, Math.min(cursor - 4, Math.max(0, filtered.length - VISIBLE)));
  const visible = filtered.slice(windowStart, windowStart + VISIBLE);

  const selected = selectedId ? allPackages.find((p) => p.id === selectedId) : null;

  const actions = useMemo<ActionOption[]>(() => {
    if (!selected) return [{ value: 'cancel', label: 'Cancel' }];
    const { installed, entry } = selected;
    const acts: ActionOption[] = [];
    if (!installed) {
      acts.push({ value: 'install', label: `Install @ ${entry.source.tag}` });
    } else if (installed.version !== entry.source.tag) {
      acts.push({ value: 'update', label: `Update  ${installed.version} →${entry.source.tag}` });
      acts.push({ value: 'remove', label: 'Remove' });
    } else {
      acts.push({ value: 'remove', label: 'Remove' });
    }
    acts.push({ value: 'cancel', label: 'Cancel' });
    return acts;
  }, [selected]);

  const finish = (result: PackageWorkflowResult) => {
    onComplete(result);
    exit();
  };

  useInput(
    (input, key) => {
      if (phase === 'browse') {
        if (key.escape) {
          if (filter) {
            setFilter('');
            setCursor(0);
          } else finish({ action: 'cancel' });
          return;
        }
        if (key.upArrow || input === 'k') {
          setCursor((c) => Math.max(0, c - 1));
        } else if (key.downArrow || input === 'j') {
          setCursor((c) => (filtered.length === 0 ? 0 : Math.min(filtered.length - 1, c + 1)));
        } else if (key.return) {
          const pkg = filtered[cursor];
          if (pkg) {
            setSelectedId(pkg.id);
            setActionCursor(0);
            setPhase('action');
          }
        } else if (key.backspace || key.delete) {
          setFilter((f) => f.slice(0, -1));
          setCursor(0);
        } else if (input && input.length === 1 && !key.ctrl && !key.meta && !key.tab) {
          setFilter((f) => f + input);
          setCursor(0);
        }
        return;
      }

      if (phase === 'action') {
        if (key.escape || key.backspace) {
          setPhase('browse');
          return;
        }
        if (key.upArrow || input === 'k') {
          setActionCursor((c) => Math.max(0, c - 1));
        } else if (key.downArrow || input === 'j') {
          setActionCursor((c) => Math.min(actions.length - 1, c + 1));
        } else if (key.return) {
          const act = actions[actionCursor];
          if (!act) return;
          if (act.value === 'cancel') {
            setPhase('browse');
            return;
          }
          finish({ action: act.value, id: selectedId! });
        }
      }
    },
    { isActive: inputActive },
  );

  if (phase === 'action' && selected) {
    const { entry, installed } = selected;
    const hasUpdate = !!installed && installed.version !== entry.source.tag;
    return (
      <Box flexDirection="column" paddingTop={1} gap={1}>
        <Box gap={2}>
          <Text bold color="cyan">
            {selected.id}
          </Text>
          <Text color={trustColor(entry.trust)}>{trustLabel(entry.trust)}</Text>
          <Text color="gray">{entry.source.tag}</Text>
          {installed &&
            (hasUpdate ? (
              <Text color="yellow">
                update available ({installed.version} →{entry.source.tag})
              </Text>
            ) : (
              <Text color="green">installed</Text>
            ))}
        </Box>
        <Text color="gray">{entry.description}</Text>
        <Text color="gray">github.com/{entry.source.repo}</Text>
        {entry.license ? <Text color="gray">license: {entry.license}</Text> : null}
        {entry.subpackages?.length ? <Text color="gray">modules: {entry.subpackages.join(', ')}</Text> : null}
        <Box flexDirection="column" marginTop={1}>
          {actions.map((act, i) => (
            <Text key={act.value} color={i === actionCursor ? 'cyan' : 'gray'}>
              {i === actionCursor ? '> ' : '  '}
              {act.label}
            </Text>
          ))}
        </Box>
        <Text dimColor>up/down Enter confirm Esc back</Text>
      </Box>
    );
  }

  // Column header — must use identical widths as the rows below.
  const colHeader = '   ' + 'NAME'.padEnd(NAME_W) + 'VERSION'.padEnd(VER_W) + 'TRUST'.padEnd(TRUST_W) + 'DESCRIPTION';

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box gap={2} marginBottom={1}>
        <Text bold>Packages</Text>
        <Text color="gray">
          {filtered.length === allPackages.length
            ? `${allPackages.length} total`
            : `${filtered.length} of ${allPackages.length}`}
        </Text>
        <Text color="gray">
          filter: <Text color={filter ? 'cyan' : 'gray'}>{filter || '--'}</Text>
        </Text>
      </Box>

      {/* Column header — single Text so widths match exactly */}
      <Text dimColor>{colHeader}</Text>

      {/* Package rows — each row is a single <Text> with nested <Text> children.
          This renders as a single inline flow, avoiding Yoga flex spacing that
          would misalign the padEnd columns. */}
      <Box flexDirection="column">
        {filtered.length === 0 && <Text color="gray"> no packages match "{filter}"</Text>}
        {visible.map((pkg, i) => {
          const idx = windowStart + i;
          const active = idx === cursor;
          const { installed, entry } = pkg;
          const hasUpdate = !!installed && installed.version !== entry.source.tag;

          // All prefixes are exactly 3 chars to match the 3-space header indent.
          const prefix = active ? '>> ' : installed ? ' * ' : '   ';
          const nameColor = active ? 'cyan' : hasUpdate ? 'yellow' : installed ? 'green' : undefined;
          const nameText = pkg.id.padEnd(NAME_W);
          const verText = entry.source.tag.padEnd(VER_W);
          const trustText = trustLabel(entry.trust).padEnd(TRUST_W);

          return (
            <Text key={pkg.id}>
              <Text color={active ? 'cyan' : hasUpdate ? 'yellow' : installed ? 'green' : 'gray'}>{prefix}</Text>
              <Text color={nameColor} bold={active}>
                {nameText}
              </Text>
              <Text color="gray">{verText}</Text>
              <Text color={trustColor(entry.trust)}>{trustText}</Text>
              <Text color={active ? undefined : 'gray'}>{entry.description}</Text>
            </Text>
          );
        })}
      </Box>

      {filtered.length > VISIBLE && (
        <Text dimColor>
          {'   '}
          {windowStart > 0 ? '^ ' : '  '}
          {`${filtered.length - windowStart - Math.min(VISIBLE, filtered.length - windowStart)} more`}
          {windowStart + VISIBLE < filtered.length ? ' v' : ''}
        </Text>
      )}

      <Box marginTop={1}>
        <Text dimColor>up/down or j/k type to filter Backspace erase Enter select Esc cancel</Text>
      </Box>
    </Box>
  );
}

export async function showPackageBrowser(input: {
  registry: Registry;
  lockfile: Lockfile;
}): Promise<PackageWorkflowResult> {
  let resolveResult!: (r: PackageWorkflowResult) => void;
  const resultPromise = new Promise<PackageWorkflowResult>((resolve) => {
    resolveResult = resolve;
  });
  const { waitUntilExit } = render(<PackageWorkflow {...input} onComplete={resolveResult} />);
  await waitUntilExit();
  return resultPromise;
}
