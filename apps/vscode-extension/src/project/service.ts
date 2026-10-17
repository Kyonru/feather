import * as vscode from 'vscode';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runCliQuery, type CliInvocation } from '../jobs/runner';
import { discoverCandidates, isInside, selectProject, type ProjectSelection } from './selection';
import { loadProjectState, type ProjectState } from './state';

const REMEMBERED_KEY = 'feather.selectedProject';
const ACCEPTED_OUTSIDE_KEY = 'feather.acceptedOutsideProjectDirs';

function workspaceRoots(): string[] {
  return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
}

function childDirectories(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

/**
 * Owns which folder is the project and what the CLI says about it. The tree,
 * the status bar and every command read from here, so they agree.
 */
export class ProjectService implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  private stateValue: ProjectState | undefined;
  private loading = false;
  private pending: Promise<void> | undefined;
  private rerun = false;
  private debounce: NodeJS.Timeout | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly invocation: () => CliInvocation,
  ) {}

  dispose(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.changed.dispose();
  }

  get state(): ProjectState | undefined {
    return this.stateValue;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  selection(): ProjectSelection {
    const roots = workspaceRoots();
    return selectProject({
      configured: vscode.workspace.getConfiguration('feather').get<string>('projectDir'),
      workspaceRoots: roots,
      candidates: discoverCandidates(roots, childDirectories),
      remembered: this.context.workspaceState.get<string>(REMEMBERED_KEY),
      acceptedOutside: this.context.workspaceState.get<string[]>(ACCEPTED_OUTSIDE_KEY) ?? [],
    });
  }

  /** The project root without prompting, if one is resolved. */
  currentRoot(): string | undefined {
    const selection = this.selection();
    return selection.kind === 'resolved' ? selection.root : undefined;
  }

  /**
   * The project root for a command. Asks when the choice is ambiguous and says
   * why when the configured folder is unusable, instead of guessing.
   */
  async requireRoot(): Promise<string | undefined> {
    const selection = this.selection();
    switch (selection.kind) {
      case 'resolved':
        return selection.root;
      case 'no-workspace':
        void vscode.window.showErrorMessage('Feather: open a folder containing a LÖVE project (main.lua) first.');
        return undefined;
      case 'needs-selection':
        return this.pick(selection.candidates);
      case 'invalid-setting': {
        const choice = await vscode.window.showErrorMessage(
          `Feather: feather.projectDir is "${selection.configured}", but ${selection.reason} (${selection.path}).`,
          'Open Settings',
        );
        if (choice) await vscode.commands.executeCommand('workbench.action.openSettings', 'feather.projectDir');
        return undefined;
      }
      case 'outside-workspace':
        return (await this.acceptOutside(selection.path)) ? selection.path : undefined;
    }
  }

  /** `feather.selectProject`: choose (and remember) the project for this workspace. */
  async select(): Promise<string | undefined> {
    const selection = this.selection();
    if (selection.kind === 'outside-workspace') {
      return (await this.acceptOutside(selection.path)) ? selection.path : undefined;
    }
    if (selection.kind === 'resolved' && selection.source === 'setting' || selection.kind === 'invalid-setting') {
      const choice = await vscode.window.showInformationMessage(
        'Feather: the project is set by feather.projectDir. Clear that setting to choose a folder here.',
        'Clear Setting',
        'Open Settings',
      );
      if (choice === 'Clear Setting') {
        await vscode.workspace.getConfiguration('feather').update('projectDir', undefined, vscode.ConfigurationTarget.Workspace);
        return this.select();
      }
      if (choice === 'Open Settings') await vscode.commands.executeCommand('workbench.action.openSettings', 'feather.projectDir');
      return undefined;
    }
    const roots = workspaceRoots();
    const candidates = discoverCandidates(roots, childDirectories);
    return this.pick(candidates.length > 0 ? candidates : roots);
  }

  private async pick(candidates: string[]): Promise<string | undefined> {
    type Item = vscode.QuickPickItem & { path?: string };
    const current = this.currentRoot();
    const items: Item[] = candidates.map((path) => ({
      label: `$(folder) ${vscode.workspace.asRelativePath(path, true) || path}`,
      description: path === current ? 'current' : undefined,
      detail: path,
      path,
    }));
    items.push({ label: '$(folder-opened) Browse…', detail: 'Pick another folder inside the workspace' });
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Feather: Select Project',
      placeHolder: 'Which folder is the LÖVE project?',
      matchOnDetail: true,
    });
    if (!picked) return undefined;
    let path = picked.path;
    if (!path) {
      const uris = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Use as Feather project' });
      path = uris?.[0]?.fsPath;
      if (!path) return undefined;
      const chosen = path;
      if (!workspaceRoots().some((root) => isInside(root, chosen)) && !(await this.acceptOutside(chosen))) return undefined;
    }
    await this.context.workspaceState.update(REMEMBERED_KEY, path);
    this.stateValue = undefined;
    this.refresh(0);
    return path;
  }

  private async acceptOutside(path: string): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
      `Feather: ${path} is outside this workspace. Feather commands will read and write files there. Use it?`,
      { modal: true },
      'Use This Folder',
    );
    if (choice !== 'Use This Folder') return false;
    const accepted = this.context.workspaceState.get<string[]>(ACCEPTED_OUTSIDE_KEY) ?? [];
    await this.context.workspaceState.update(ACCEPTED_OUTSIDE_KEY, [...new Set([...accepted, path])]);
    if (!vscode.workspace.getConfiguration('feather').get<string>('projectDir')?.trim()) {
      await this.context.workspaceState.update(REMEMBERED_KEY, path);
    }
    this.refresh(0);
    return true;
  }

  /** Schedule a refresh; bursts of file events collapse into one CLI query. */
  refresh(delayMs = 300): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.refreshNow(), delayMs);
  }

  /** Re-read project state from the CLI now. Resolves when the view has it. */
  async refreshNow(): Promise<void> {
    if (this.pending) {
      this.rerun = true;
      return this.pending;
    }
    this.pending = this.load().finally(() => {
      this.pending = undefined;
    });
    await this.pending;
    if (this.rerun) {
      this.rerun = false;
      await this.refreshNow();
    }
  }

  private async load(): Promise<void> {
    const root = this.currentRoot();
    if (!root) {
      this.stateValue = undefined;
      this.changed.fire();
      return;
    }
    this.loading = true;
    this.changed.fire();
    try {
      const invocation = this.invocation();
      const state = await loadProjectState(root, (args) => runCliQuery(invocation, args, root));
      // The selection may have changed while the CLI ran; keep only a current answer.
      if (this.currentRoot() === root) this.stateValue = state;
    } finally {
      this.loading = false;
      this.changed.fire();
    }
  }
}
