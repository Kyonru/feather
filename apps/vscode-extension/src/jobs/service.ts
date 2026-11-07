import * as vscode from 'vscode';
import { shellQuote } from '../command';
import type { Plan } from '../plans';
import { runJob, type CliInvocation, type JobResult } from './runner';
import { renderJsonForOutput, summarize } from './summary';

export type JobOptions = {
  /** Extra buttons on the success notification, e.g. revealing an artifact. */
  successActions?: { label: string; run: (result: JobResult) => void | Thenable<unknown> }[];
};

/**
 * Managed jobs: the bundled CLI spawned without a shell, its output streamed
 * to the "Feather" output channel, a cancellable progress notification, and a
 * notification carrying the CLI's own result when the process exits. The
 * project view refreshes on that exit — not on a timer.
 */
export class JobService implements vscode.Disposable {
  readonly output: vscode.OutputChannel;
  private readonly running = new Map<string, Promise<JobResult>>();
  private readonly completed = new vscode.EventEmitter<JobResult>();
  /** Fires after every job, whatever its outcome. Tests and the project view listen. */
  readonly onDidComplete = this.completed.event;
  lastResult: JobResult | undefined;

  constructor(
    private readonly invocation: () => CliInvocation,
    private readonly afterJob: (result: JobResult) => Promise<void> | void,
  ) {
    this.output = vscode.window.createOutputChannel('Feather');
  }

  dispose(): void {
    this.output.dispose();
    this.completed.dispose();
  }

  isRunning(title: string, cwd: string): boolean {
    return this.running.has(`${cwd}\0${title}`);
  }

  async run(plan: Plan, cwd: string, options: JobOptions = {}): Promise<JobResult | undefined> {
    const key = `${cwd}\0${plan.title}`;
    if (this.running.has(key)) {
      const choice = await vscode.window.showInformationMessage(`${plan.title} is already running.`, 'Show Output');
      if (choice) this.output.show(true);
      return undefined;
    }
    const job = this.execute(plan, cwd);
    this.running.set(key, job);
    try {
      const result = await job;
      this.notify(result, options);
      return result;
    } finally {
      this.running.delete(key);
    }
  }

  private async execute(plan: Plan, cwd: string): Promise<JobResult> {
    const invocation = this.invocation();
    const display = (args: string[]) => ['feather', ...args].map(shellQuote).join(' ');
    this.output.appendLine('');
    this.output.appendLine(`── ${plan.title} · ${new Date().toLocaleTimeString()} ──`);

    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Feather: ${plan.title}`, cancellable: true },
      (progress, token) => {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        let jsonStep = false;
        return runJob(invocation, { ...plan, cwd }, {
          signal: abort.signal,
          events: {
            onStepStart: (index, step) => {
              jsonStep = step.json === true;
              this.output.appendLine(`$ ${display(step.args)}`);
              if (plan.steps.length > 1) progress.report({ message: `step ${index + 1} of ${plan.steps.length}` });
            },
            onStepEnd: (index, step) => {
              if (step.json !== undefined) this.output.appendLine(renderJsonForOutput(step.json));
              else if (plan.steps[index]?.json && step.stdout.trim()) this.output.appendLine(step.stdout.trimEnd());
            },
            onOutput: (text, stream) => {
              // A --json step's stdout is one document; it is rendered once
              // the step ends instead of streaming braces into the channel.
              if (stream === 'stdout' && jsonStep) return;
              this.output.append(text);
              const line = text.trim().split('\n').at(-1)?.trim();
              if (line) progress.report({ message: line.slice(0, 120) });
            },
          },
        });
      },
    );

    const mark = result.status === 'succeeded' ? '✔' : result.status === 'cancelled' ? '■' : '✖';
    this.output.appendLine(`${mark} ${summarize(result)} (exit ${result.exitCode ?? 'none'})`);

    this.lastResult = result;
    try {
      await this.afterJob(result);
    } finally {
      this.completed.fire(result);
    }
    return result;
  }

  private notify(result: JobResult, options: JobOptions): void {
    const message = summarize(result);
    const showOutput = 'Show Output';
    if (result.status === 'succeeded') {
      const actions = options.successActions ?? [];
      void vscode.window.showInformationMessage(message, ...actions.map((action) => action.label), showOutput).then((choice) => {
        if (choice === showOutput) this.output.show(true);
        actions.find((action) => action.label === choice)?.run(result);
      });
    } else if (result.status === 'cancelled') {
      void vscode.window.showWarningMessage(message, showOutput).then((choice) => {
        if (choice) this.output.show(true);
      });
    } else {
      void vscode.window.showErrorMessage(message, showOutput).then((choice) => {
        if (choice) this.output.show(true);
      });
    }
  }
}
