import * as vscode from 'vscode';
import type { ProjectStatus } from './project';
import type { RunTarget } from './vendor';
import { targetIcon } from './vendor';

type FeatherViewState = { status: ProjectStatus; watchMode: boolean; targets: RunTarget[] };

type FeatherItemKind =
  | 'status'
  | 'actionRun'
  | 'actionInit'
  | 'actionDoctor'
  | 'actionPlugins'
  | 'actionPackages'
  | 'actionUpload'
  | 'actionVendor'
  | 'actionToggleWatch'
  | 'actionConfigure'
  | 'actionSelectTargets'
  | 'actionBuildConfig';

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

  getChildren(): FeatherTreeItem[] {
    const { status, watchMode, targets } = this.getState();

    if (!status.hasWorkspace) {
      return [
        statusItem('No workspace open', 'info'),
        actionItem('Configure Feather', 'feather.configure', 'settings-gear', 'actionConfigure'),
      ];
    }
    if (!status.hasMain) {
      return [
        statusItem('No main.lua found', 'warning'),
        statusItem('Open a LÖVE project folder', 'info'),
        actionItem('Configure Feather', 'feather.configure', 'settings-gear', 'actionConfigure'),
      ];
    }
    if (!status.hasConfig) {
      return [
        statusItem('feather.config.lua not found', 'warning'),
        actionItem('Initialize Project', 'feather.init', 'add', 'actionInit'),
        actionItem('Run Doctor', 'feather.doctor', 'pulse', 'actionDoctor'),
        actionItem('Configure Feather', 'feather.configure', 'settings-gear', 'actionConfigure'),
      ];
    }

    const targetLabel = targets.length > 0
      ? targets.map((t) => `$(${targetIcon(t)}) ${t}`).join('  ')
      : 'No targets selected';

    return [
      statusItem('feather.config.lua found', 'pass'),
      statusItem(status.hasRuntime ? 'Embedded runtime found' : 'CLI mode project', 'info'),
      statusItem(`${status.pluginCount} plugin${status.pluginCount === 1 ? '' : 's'} installed`, 'info'),
      statusItem(`${status.packageCount} package${status.packageCount === 1 ? '' : 's'} installed`, 'info'),
      watchMode
        ? actionItem('Watch Project', 'feather.run', 'eye', 'actionRun')
        : actionItem('Run Project', 'feather.run', 'play', 'actionRun'),
      actionItem(
        watchMode ? 'Watch mode: ON  — click to disable' : 'Watch mode: OFF — click to enable',
        'feather.toggleWatch',
        watchMode ? 'eye' : 'eye-closed',
        'actionToggleWatch',
      ),
      actionItem(`Targets: ${targetLabel}`, 'feather.selectTargets', 'target', 'actionSelectTargets'),
      actionItem('Run Doctor', 'feather.doctor', 'pulse', 'actionDoctor'),
      actionItem('Build Config', 'feather.buildConfig', 'file-code', 'actionBuildConfig'),
      actionItem('Manage Plugins', 'feather.plugins', 'extensions', 'actionPlugins'),
      actionItem('Manage Packages', 'feather.packages', 'package', 'actionPackages'),
      actionItem('Manage Vendors', 'feather.vendor', 'archive', 'actionVendor'),
      actionItem('Upload Build', 'feather.upload', 'cloud-upload', 'actionUpload'),
      actionItem('Configure Feather', 'feather.configure', 'settings-gear', 'actionConfigure'),
    ];
  }
}

export class FeatherTreeItem extends vscode.TreeItem {
  constructor(label: string, public readonly kind: FeatherItemKind) {
    super(label);
    this.contextValue = kind;
  }
}

function statusItem(label: string, icon: 'pass' | 'warning' | 'info'): FeatherTreeItem {
  const item = new FeatherTreeItem(label, 'status');
  const icons = { pass: 'check', warning: 'warning', info: 'info' };
  item.iconPath = new vscode.ThemeIcon(icons[icon]);
  return item;
}

function actionItem(label: string, command: string, icon: string, kind: FeatherItemKind): FeatherTreeItem {
  const item = new FeatherTreeItem(label, kind);
  item.iconPath = new vscode.ThemeIcon(icon);
  item.command = { command, title: label };
  return item;
}
