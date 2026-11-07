import * as vscode from 'vscode';
import type { RunTarget } from './plans';
import type { ProjectSelection } from './project/selection';
import { doctorCheckFor, doctorProblems, type DoctorCheck, type ProjectState } from './project/state';

export type FeatherViewState = {
  selection: ProjectSelection;
  state: ProjectState | undefined;
  loading: boolean;
  watchMode: boolean;
  targets: RunTarget[];
};

type FeatherItemKind =
  | 'section'
  | 'status'
  | 'project'
  | 'actionRun'
  | 'actionInit'
  | 'actionDoctor'
  | 'actionPlugins'
  | 'actionPackages'
  | 'actionUpload'
  | 'actionBuildRelease'
  | 'actionVendor'
  | 'actionToggleWatch'
  | 'actionConfigure'
  | 'actionSelectTargets'
  | 'actionSelectProject'
  | 'actionBuildConfig';

export function targetIcon(target: RunTarget): string {
  switch (target) {
    case 'desktop': return 'desktop-download';
    case 'web': return 'globe';
    case 'android': return 'device-mobile';
    case 'ios': return 'device-mobile';
    case 'steamos': return 'game';
  }
}

export class FeatherProjectProvider implements vscode.TreeDataProvider<FeatherTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<FeatherTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private getState: () => FeatherViewState) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(item: FeatherTreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(item?: FeatherTreeItem): FeatherTreeItem[] {
    if (item?.children) return item.children;
    return buildTree(this.getState());
  }
}

function buildTree(view: FeatherViewState): FeatherTreeItem[] {
  const { selection } = view;
  const selectProject = actionItem('Select Project…', 'feather.selectProject', 'folder-opened', 'actionSelectProject');
  const configure = actionItem('Configure Feather', 'feather.configure', 'settings-gear', 'actionConfigure');

  switch (selection.kind) {
    case 'no-workspace':
      return [statusItem('No workspace open', 'info'), configure];
    case 'needs-selection':
      return [
        statusItem(`${selection.candidates.length} folders could be the project`, 'warning', 'Choose one; the choice is remembered for this workspace.'),
        selectProject,
      ];
    case 'invalid-setting':
      return [
        statusItem(`feather.projectDir: ${selection.reason}`, 'error', selection.path),
        configure,
      ];
    case 'outside-workspace':
      return [
        statusItem('feather.projectDir is outside the workspace', 'warning', selection.path),
        actionItem('Allow This Folder…', 'feather.selectProject', 'folder-opened', 'actionSelectProject'),
        configure,
      ];
    case 'resolved':
      break;
  }

  const project = new FeatherTreeItem(`Project: ${selection.name}`, 'project');
  project.description = selection.source === 'setting' ? 'feather.projectDir' : undefined;
  project.tooltip = selection.root;
  project.iconPath = new vscode.ThemeIcon('folder-library');
  project.command = { command: 'feather.selectProject', title: 'Select Project' };

  const state = view.state && view.state.root === selection.root ? view.state : undefined;
  if (!state) {
    return [project, statusItem(view.loading ? 'Checking project…' : 'Project state not loaded', 'loading')];
  }
  if (!state.hasMain) {
    return [project, statusItem('No main.lua found', 'warning', selection.root), selectProject, configure];
  }
  if (!state.hasConfig) {
    return [
      project,
      statusItem('feather.config.lua not found', 'warning'),
      actionItem('Initialize Project', 'feather.init', 'add', 'actionInit'),
      actionItem('Run Doctor', 'feather.doctor', 'pulse', 'actionDoctor'),
      configure,
    ];
  }

  const targetLabel = view.targets.length > 0
    ? view.targets.map((t) => `$(${targetIcon(t)}) ${t}`).join('  ')
    : 'No targets selected';

  return [
    project,
    sectionItem('Status', 'info', statusItems(state, view.loading)),
    sectionItem('Run', 'run-all', [
      view.watchMode
        ? actionItem('Watch Project', 'feather.run', 'eye', 'actionRun')
        : actionItem('Run Project', 'feather.run', 'play', 'actionRun'),
      actionItem(
        view.watchMode ? 'Watch mode: ON  — click to disable' : 'Watch mode: OFF — click to enable',
        'feather.toggleWatch',
        view.watchMode ? 'eye' : 'eye-closed',
        'actionToggleWatch',
      ),
      actionItem(`Targets: ${targetLabel}`, 'feather.selectTargets', 'target', 'actionSelectTargets'),
    ]),
    sectionItem('Build & Release', 'package', [
      actionItem('Build Config', 'feather.buildConfig', 'file-code', 'actionBuildConfig'),
      actionItem('Create Release Build', 'feather.buildRelease', 'rocket', 'actionBuildRelease'),
      actionItem('Upload Build', 'feather.upload', 'cloud-upload', 'actionUpload'),
      actionItem('Manage Vendors', 'feather.vendor', 'archive', 'actionVendor'),
    ]),
    sectionItem('Project Tools', 'tools', [
      actionItem('Run Doctor', 'feather.doctor', 'pulse', 'actionDoctor'),
      actionItem('Manage Plugins', 'feather.plugins', 'extensions', 'actionPlugins'),
      actionItem('Manage Packages', 'feather.packages', 'package', 'actionPackages'),
      configure,
    ]),
  ];
}

/** Status lines are the CLI's answers. A failed answer is shown as broken, never as zero. */
function statusItems(state: ProjectState, loading: boolean): FeatherTreeItem[] {
  const items: FeatherTreeItem[] = [];
  if (loading) items.push(statusItem('Refreshing…', 'loading'));
  items.push(statusItem('feather.config.lua found', 'pass'));

  if (state.plugins.ok) {
    const { managed, ids } = state.plugins.value;
    items.push(statusItem(managed === 'cli' ? 'CLI-managed project' : `Embedded runtime (${managed ?? 'unmanaged'})`, 'info'));
    const verb = managed === 'cli' ? 'included' : 'installed';
    items.push(statusItem(`${ids.length} plugin${ids.length === 1 ? '' : 's'} ${verb}`, 'info', ids.join(', ') || undefined));
  } else {
    items.push(statusItem(`Plugins unreadable: ${state.plugins.error}`, 'error', state.plugins.error));
  }

  if (state.packages.ok) {
    const { ids } = state.packages.value;
    items.push(statusItem(`${ids.length} package${ids.length === 1 ? '' : 's'} installed`, 'info', ids.join(', ') || undefined));
  } else {
    const check = doctorCheckFor(state, 'Package lockfile');
    items.push(statusItem(`feather.lock.json: ${state.packages.error}`, 'error', check?.fix ?? state.packages.error));
  }

  if (state.doctor.ok) {
    const { failures, warnings } = state.doctor.value;
    const problems = doctorProblems(state);
    if (problems.length === 0) {
      items.push(statusItem('Doctor: no problems', 'pass'));
    } else {
      const label = `Doctor: ${failures} blocker${failures === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
      const item = new FeatherTreeItem(label, 'section', problems.map(problemItem), vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon(failures > 0 ? 'error' : 'warning');
      items.push(item);
    }
  } else {
    items.push(statusItem(`Doctor could not run: ${state.doctor.error}`, 'error', state.doctor.error));
  }
  return items;
}

function problemItem(check: DoctorCheck): FeatherTreeItem {
  const item = statusItem(`${check.group}: ${check.label}`, check.severity === 'fail' ? 'error' : 'warning');
  item.description = check.detail;
  item.tooltip = [check.detail, check.fix ? `→ ${check.fix}` : undefined].filter(Boolean).join('\n');
  return item;
}

export class FeatherTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly kind: FeatherItemKind,
    public readonly children?: FeatherTreeItem[],
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
  ) {
    super(label, collapsibleState);
    this.contextValue = kind;
  }
}

function sectionItem(label: string, icon: string, children: FeatherTreeItem[]): FeatherTreeItem {
  const item = new FeatherTreeItem(label, 'section', children, vscode.TreeItemCollapsibleState.Expanded);
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
}

function statusItem(label: string, icon: 'pass' | 'warning' | 'error' | 'info' | 'loading', tooltip?: string): FeatherTreeItem {
  const item = new FeatherTreeItem(label, 'status');
  const icons = { pass: 'check', warning: 'warning', error: 'error', info: 'info', loading: 'sync~spin' };
  item.iconPath = new vscode.ThemeIcon(icons[icon]);
  if (tooltip) item.tooltip = tooltip;
  return item;
}

function actionItem(label: string, command: string, icon: string, kind: FeatherItemKind): FeatherTreeItem {
  const item = new FeatherTreeItem(label, kind);
  item.iconPath = new vscode.ThemeIcon(icon);
  item.command = { command, title: label };
  return item;
}
