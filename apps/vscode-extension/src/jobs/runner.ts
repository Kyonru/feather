import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

// The job runner is deliberately free of the `vscode` module so its lifecycle —
// sequencing, exit codes, cancellation, structured output — is unit tested with
// plain `node --test` against a real child process.

/** How to start the Feather CLI: the bundled binary, or `node feather-dev.mjs` in development. */
export type CliInvocation = {
  command: string;
  argsPrefix: string[];
};

/** One CLI invocation. `json` means the args request `--json` and stdout carries the result. */
export type JobStep = {
  args: string[];
  json?: boolean;
};

export type JobSpec = {
  title: string;
  cwd: string;
  steps: JobStep[];
};

export type StepResult = {
  args: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  /** Parsed stdout when the step asked for `--json` and the CLI produced a document. */
  json?: unknown;
  /** Set when the process could not be started at all. */
  spawnError?: string;
};

export type JobStatus = 'succeeded' | 'failed' | 'cancelled';

export type JobResult = {
  title: string;
  status: JobStatus;
  /** Exit code of the last step that ran (null when it was killed or never started). */
  exitCode: number | null;
  steps: StepResult[];
  /** Index of the step that failed, when status is `failed`. */
  failedStep?: number;
  /** One line a person can act on: the CLI's own error when it gave one. */
  message: string;
  /** Structured output of the last step that produced one. */
  json?: unknown;
};

export type JobEvents = {
  onStepStart?: (index: number, step: JobStep) => void;
  onOutput?: (text: string, stream: 'stdout' | 'stderr') => void;
  onStepEnd?: (index: number, result: StepResult) => void;
};

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export type RunJobOptions = {
  signal?: AbortSignal;
  events?: JobEvents;
  spawn?: SpawnFn;
  env?: NodeJS.ProcessEnv;
  /** How long a cancelled step gets to exit after SIGTERM before SIGKILL. */
  killGraceMs?: number;
};

const MAX_CAPTURE = 4 * 1024 * 1024;

export function cliEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  // Output lands in a VS Code output channel, which does not render ANSI.
  return { ...base, NO_COLOR: '1', FORCE_COLOR: '0' };
}

/**
 * Parse a `--json` stdout. Most commands print exactly one JSON document, but a
 * few print a status line first (init in embedded modes), so fall back to the
 * last top-level `{` that starts a line and parses to the end.
 */
export function parseJsonOutput(stdout: string): unknown | undefined {
  const text = stdout.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('{') && !lines[i].startsWith('[')) continue;
    try {
      return JSON.parse(lines.slice(i).join('\n'));
    } catch {
      // keep looking
    }
  }
  return undefined;
}

function lastMeaningfulLine(text: string): string | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const line = lines.at(-1);
  return line?.replace(/^[✖✗×!⚠]\s*/u, '');
}

/** The CLI prints errors as `✖ message` followed by indented details; prefer that line. */
function errorLine(stderr: string): string | undefined {
  const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean);
  const marked = lines.find((line) => /^[✖✗×]/u.test(line));
  return (marked ?? lines[0])?.replace(/^[✖✗×]\s*/u, '');
}

function failureMessage(step: StepResult): string {
  if (step.spawnError) return step.spawnError;
  // A --json step's stdout is a document, not a message; its last line is `}`.
  const fromCli = errorLine(step.stderr) ?? (step.json === undefined ? lastMeaningfulLine(step.stdout) : undefined);
  const code = step.exitCode === null ? `signal ${step.signal ?? 'unknown'}` : `exit code ${step.exitCode}`;
  return fromCli ? `${fromCli} (${code})` : `Feather CLI failed with ${code}`;
}

function runStep(
  invocation: CliInvocation,
  step: JobStep,
  cwd: string,
  options: RunJobOptions,
): Promise<StepResult> {
  const spawn = options.spawn ?? nodeSpawn;
  const killGraceMs = options.killGraceMs ?? 3000;
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const finish = (result: Omit<StepResult, 'args' | 'stdout' | 'stderr'>) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', onAbort);
      const json = step.json ? parseJsonOutput(stdout) : undefined;
      resolve({ args: step.args, stdout, stderr, ...result, ...(json === undefined ? {} : { json }) });
    };

    let child: ChildProcess;
    try {
      child = spawn(invocation.command, [...invocation.argsPrefix, ...step.args], {
        cwd,
        shell: false,
        // A prompt the extension did not anticipate must fail fast, not hang
        // behind a progress notification nobody can type into.
        stdio: ['ignore', 'pipe', 'pipe'],
        env: options.env ?? cliEnvironment(),
        windowsHide: true,
      });
    } catch (err) {
      finish({ exitCode: null, signal: null, spawnError: `Could not start the Feather CLI (${invocation.command}): ${(err as Error).message}` });
      return;
    }

    const onAbort = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < MAX_CAPTURE) stdout += chunk;
      options.events?.onOutput?.(chunk, 'stdout');
    });
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < MAX_CAPTURE) stderr += chunk;
      options.events?.onOutput?.(chunk, 'stderr');
    });
    child.on('error', (err) => {
      finish({ exitCode: null, signal: null, spawnError: `Could not start the Feather CLI (${invocation.command}): ${err.message}` });
    });
    child.on('close', (code, signal) => finish({ exitCode: code, signal }));
  });
}

/**
 * Run a job's steps in order, stopping at the first failure. Completion is the
 * process exit, not a timer: callers refresh state when this resolves.
 */
export async function runJob(invocation: CliInvocation, spec: JobSpec, options: RunJobOptions = {}): Promise<JobResult> {
  const steps: StepResult[] = [];
  let json: unknown;

  for (let index = 0; index < spec.steps.length; index += 1) {
    if (options.signal?.aborted) {
      return { title: spec.title, status: 'cancelled', exitCode: steps.at(-1)?.exitCode ?? null, steps, message: `${spec.title} was cancelled.`, json };
    }
    const step = spec.steps[index];
    options.events?.onStepStart?.(index, step);
    const result = await runStep(invocation, step, spec.cwd, options);
    steps.push(result);
    if (result.json !== undefined) json = result.json;
    options.events?.onStepEnd?.(index, result);

    if (options.signal?.aborted) {
      return { title: spec.title, status: 'cancelled', exitCode: result.exitCode, steps, message: `${spec.title} was cancelled.`, json };
    }
    if (result.exitCode !== 0) {
      return {
        title: spec.title,
        status: 'failed',
        exitCode: result.exitCode,
        steps,
        failedStep: index,
        message: failureMessage(result),
        json,
      };
    }
  }

  return {
    title: spec.title,
    status: 'succeeded',
    exitCode: steps.at(-1)?.exitCode ?? 0,
    steps,
    message: `${spec.title} finished.`,
    json,
  };
}

/** Run one CLI command and return its result without any UI. Used for read-only state queries. */
export function runCliQuery(
  invocation: CliInvocation,
  args: string[],
  cwd: string,
  options: Omit<RunJobOptions, 'events'> = {},
): Promise<StepResult> {
  return runStep(invocation, { args, json: true }, cwd, options);
}
