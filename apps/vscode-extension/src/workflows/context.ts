import * as vscode from 'vscode';
import type { JobService } from '../jobs/service';
import { RUN_TARGETS, type RunTarget } from '../plans';
import type { ProjectService } from '../project/service';

/** What every workflow module gets from activation. */
export type Services = {
  context: vscode.ExtensionContext;
  project: ProjectService;
  jobs: JobService;
};

export type Pick<T extends string> = vscode.QuickPickItem & { value: T };

export function featherConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('feather');
}

export function isWatchMode(): boolean {
  return featherConfig().get<boolean>('watchMode') ?? false;
}

export function savedTargets(): RunTarget[] {
  const saved = featherConfig().get<string[]>('runTargets') ?? [];
  return saved.filter((target): target is RunTarget => (RUN_TARGETS as readonly string[]).includes(target));
}

export function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function register(services: Services, id: string, handler: (...args: unknown[]) => unknown): void {
  services.context.subscriptions.push(vscode.commands.registerCommand(id, handler));
}
