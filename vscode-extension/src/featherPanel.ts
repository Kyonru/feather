import * as vscode from 'vscode';
import type { ProjectStatus } from './project';

type FeatherItemKind = 'status' | 'actionRun' | 'actionInit' | 'actionDoctor' | 'actionPlugins' | 'actionPackages' | 'actionUpload';

export class FeatherProjectProvider implements vscode.TreeDataProvider<FeatherTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<FeatherTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private getStatus: () => ProjectStatus) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(item: FeatherTreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(): FeatherTreeItem[] {
    const status = this.getStatus();
    if (!status.hasWorkspace) {
      return [statusItem('No workspace open', 'info')];
    }
    if (!status.hasMain) {
      return [
        statusItem('No main.lua found', 'warning'),
        statusItem('Open a LÖVE project folder', 'info'),
      ];
    }
    if (!status.hasConfig) {
      return [
        statusItem('feather.config.lua not found', 'warning'),
        actionItem('Initialize Project', 'feather.init', 'add', 'actionInit'),
        actionItem('Run Doctor', 'feather.doctor', 'pulse', 'actionDoctor'),
      ];
    }

    return [
      statusItem('feather.config.lua found', 'pass'),
      statusItem(status.hasRuntime ? 'Embedded runtime found' : 'CLI mode project', 'info'),
      statusItem(`${status.pluginCount} plugin${status.pluginCount === 1 ? '' : 's'} installed`, 'info'),
      statusItem(`${status.packageCount} package${status.packageCount === 1 ? '' : 's'} installed`, 'info'),
      actionItem('Run Project', 'feather.run', 'play', 'actionRun'),
      actionItem('Run Doctor', 'feather.doctor', 'pulse', 'actionDoctor'),
      actionItem('Manage Plugins', 'feather.plugins', 'extensions', 'actionPlugins'),
      actionItem('Manage Packages', 'feather.packages', 'package', 'actionPackages'),
      actionItem('Upload Build', 'feather.upload', 'cloud-upload', 'actionUpload'),
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
