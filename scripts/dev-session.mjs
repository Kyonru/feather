import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEV_SESSION_VERSION = 1;

export function devSessionDirectory(root) {
  return join(resolve(root), '.feather-dev', 'sessions');
}

export function devSessionPath(root, ownerPid) {
  return join(devSessionDirectory(root), `${ownerPid}.json`);
}

function validPid(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validProcess(value) {
  return value
    && typeof value === 'object'
    && validPid(value.pid)
    && typeof value.tag === 'string'
    && Array.isArray(value.markers)
    && value.markers.length > 0
    && value.markers.every((marker) => typeof marker === 'string' && marker.length > 0);
}

export function validateDevSession(value, root) {
  if (!value || typeof value !== 'object') return null;
  if (value.version !== DEV_SESSION_VERSION) return null;
  if (resolve(String(value.root ?? '')) !== resolve(root)) return null;
  if (!validPid(value.ownerPid)) return null;
  if (!Array.isArray(value.children) || !value.children.every(validProcess)) return null;

  return {
    version: DEV_SESSION_VERSION,
    root: resolve(root),
    ownerPid: value.ownerPid,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : '',
    children: value.children.map((child) => ({
      tag: child.tag,
      pid: child.pid,
      markers: [...child.markers],
    })),
  };
}

export function writeDevSession(root, session) {
  const validated = validateDevSession(session, root);
  if (!validated) throw new Error('Refusing to write an invalid Feather dev session record');

  const directory = devSessionDirectory(root);
  mkdirSync(directory, { recursive: true });
  writeFileSync(devSessionPath(root, validated.ownerPid), `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export function removeDevSession(root, ownerPid) {
  rmSync(devSessionPath(root, ownerPid), { force: true });
}

export function readDevSessionEntries(root) {
  const directory = devSessionDirectory(root);
  if (!existsSync(directory)) return [];

  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const path = join(directory, name);
      try {
        const value = JSON.parse(readFileSync(path, 'utf8'));
        const session = validateDevSession(value, root);
        return session
          ? { path, session, error: null }
          : { path, session: null, error: 'invalid session record' };
      } catch (error) {
        return {
          path,
          session: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
}

export function createDevSessionTracker(root, options = {}) {
  const ownerPid = options.ownerPid ?? process.pid;
  const onError = options.onError ?? (() => {});
  const session = {
    version: DEV_SESSION_VERSION,
    root: resolve(root),
    ownerPid,
    startedAt: new Date().toISOString(),
    children: [],
  };

  const persist = () => {
    try {
      if (session.children.length === 0) removeDevSession(root, ownerPid);
      else writeDevSession(root, session);
    } catch (error) {
      onError(error);
    }
  };

  return {
    addChild(child) {
      if (!validProcess(child)) throw new Error('Cannot track a child without a PID and command markers');
      session.children = session.children.filter((entry) => entry.pid !== child.pid);
      session.children.push({ tag: child.tag, pid: child.pid, markers: [...child.markers] });
      persist();
    },
    removeChild(pid) {
      session.children = session.children.filter((entry) => entry.pid !== pid);
      persist();
    },
    close() {
      try {
        removeDevSession(root, ownerPid);
      } catch (error) {
        onError(error);
      }
    },
    snapshot() {
      return structuredClone(session);
    },
  };
}

export function isProcessAlive(pid) {
  if (!validPid(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && typeof error === 'object' && error.code === 'EPERM';
  }
}

export function readProcessCommand(pid, options = {}) {
  if (!validPid(pid)) return '';
  const platform = options.platform ?? process.platform;
  const run = options.spawnSync ?? spawnSync;

  if (platform === 'win32') {
    const script = `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\").CommandLine`;
    const result = run('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return result.status === 0 ? String(result.stdout ?? '').trim() : '';
  }

  const result = run('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout ?? '').trim() : '';
}

export function commandHasMarkers(command, markers) {
  return typeof command === 'string'
    && command.length > 0
    && Array.isArray(markers)
    && markers.length > 0
    && markers.every((marker) => command.includes(marker));
}
