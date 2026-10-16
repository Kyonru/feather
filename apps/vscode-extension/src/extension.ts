import * as vscode from 'vscode';
import { cliInvocation } from './cli';
import { FeatherProjectProvider } from './featherPanel';
import { JobService } from './jobs/service';
import { ProjectService } from './project/service';
import { doctorProblems } from './project/state';
import { registerBuildReleaseWorkflow } from './workflows/buildRelease';
import { isWatchMode, savedTargets, type Services } from './workflows/context';
import { registerPackageWorkflow } from './workflows/packages';
import { registerPluginWorkflow } from './workflows/plugins';
import { registerRunWorkflow } from './workflows/run';
import { registerSetupWorkflow } from './workflows/setup';

// Activation is wiring only. Each workflow module registers its own commands;
// CLI argv lives in plans.ts; jobs and project state are services.

/** Returned from activate() so the extension-host test can observe jobs and state. */
export type FeatherExtensionApi = Pick<Services, 'project' | 'jobs'>;

function updateStatusItem(item: vscode.StatusBarItem, project: ProjectService): void {
  const selection = project.selection();
  const targets = savedTargets();
  const targetStr = targets.length > 0 ? ` · ${targets.join(', ')}` : '';
  item.backgroundColor = undefined;

  if (selection.kind !== 'resolved') {
    item.text = '$(warning) Feather: Select Project';
    item.tooltip = 'Choose which folder is the LÖVE project';
    item.command = 'feather.selectProject';
    if (selection.kind === 'invalid-setting') item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    return;
  }

  const state = project.state?.root === selection.root ? project.state : undefined;
  const broken = state && (!state.packages.ok || !state.plugins.ok || !state.doctor.ok);
  const blockers = state?.doctor.ok ? state.doctor.value.failures : 0;
  const tooltip = new vscode.MarkdownString(`**${selection.name}**  \n${selection.root}`);
  if (state) {
    const problems = doctorProblems(state);
    if (broken) tooltip.appendMarkdown('\n\nProject files could not be read — see the Feather view.');
    else if (problems.length > 0) tooltip.appendMarkdown(`\n\nDoctor: ${blockers} blocker(s), ${problems.length - blockers} warning(s)`);
  }

  if (state && !state.hasConfig) {
    item.text = `$(zap) Feather: Init ${selection.name}`;
    item.command = 'feather.init';
  } else {
    item.text = `${broken ? '$(error)' : isWatchMode() ? '$(eye)' : '$(zap)'} Feather · ${selection.name}${targetStr}`;
    item.command = 'feather.run';
  }
  if (broken) item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  item.tooltip = tooltip;
}

export async function activate(context: vscode.ExtensionContext): Promise<FeatherExtensionApi> {
  try {
    const invocation = () => cliInvocation(context.extensionPath);
    const project = new ProjectService(context, invocation);
    const jobs = new JobService(invocation, () => project.refreshNow());
    const services: Services = { context, project, jobs };

    const provider = new FeatherProjectProvider(() => ({
      selection: project.selection(),
      state: project.state,
      loading: project.isLoading,
      watchMode: isWatchMode(),
      targets: savedTargets(),
    }));
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    const refreshUi = () => {
      updateStatusItem(statusItem, project);
      provider.refresh();
    };
    statusItem.show();

    context.subscriptions.push(
      project,
      jobs,
      statusItem,
      vscode.window.registerTreeDataProvider('feather.projectView', provider),
      project.onDidChange(refreshUi),
      vscode.workspace.onDidChangeWorkspaceFolders(() => project.refresh(0)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('feather.projectDir')) project.refresh(0);
        else if (event.affectsConfiguration('feather')) refreshUi();
      }),
      // A run/watch terminal closing may follow a crash or a config edit.
      vscode.window.onDidCloseTerminal((terminal) => {
        if (terminal.name.startsWith('Feather:')) project.refresh();
      }),
    );
    for (const pattern of ['**/feather.config.lua', '**/.featherrc.lua', '**/feather.lock.json', '**/feather.build.json', '**/main.lua', '**/feather/plugins/**']) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      context.subscriptions.push(
        watcher,
        watcher.onDidCreate(() => project.refresh()),
        watcher.onDidChange(() => project.refresh()),
        watcher.onDidDelete(() => project.refresh()),
      );
    }

    registerRunWorkflow(services);
    registerSetupWorkflow(services);
    registerPluginWorkflow(services);
    registerPackageWorkflow(services);
    registerBuildReleaseWorkflow(services);

    refreshUi();
    project.refresh(0);
    return { project, jobs };
  } catch (err) {
    void vscode.window.showErrorMessage(`Feather failed to activate: ${(err as Error).message ?? err}`);
    throw err;
  }
}

export function deactivate(): void {}
