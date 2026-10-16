import * as vscode from 'vscode';
import { join } from 'node:path';
import { loadPackageCatalog, type PackageEntry } from '../catalog';
import { packagesPlan, type PackageAction } from '../plans';
import { register, type Pick, type Services } from './context';

type PackagePick = vscode.QuickPickItem & { pkg: PackageEntry };

export function registerPackageWorkflow(services: Services): void {
  register(services, 'feather.packages', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;
    if (services.project.state?.root !== root) await services.project.refreshNow();
    const state = services.project.state;

    // A lockfile the CLI cannot read is a broken project, not an empty one:
    // installing over it would replace whatever it recorded.
    if (state && !state.packages.ok) {
      const choice = await vscode.window.showErrorMessage(
        `Feather cannot read this project's packages: ${state.packages.error}`,
        'Open feather.lock.json',
      );
      if (choice) await vscode.window.showTextDocument(vscode.Uri.file(join(root, 'feather.lock.json')));
      return;
    }

    const installedIds = new Set(state?.packages.ok ? state.packages.value.ids : []);
    const packages = loadPackageCatalog(services.context.extensionPath, installedIds);
    const selected = await vscode.window.showQuickPick<PackagePick>(
      packages.map((pkg) => ({
        label: pkg.id,
        description: `${pkg.version} · ${pkg.trust}${pkg.installed ? ' · installed' : ''}`,
        detail: pkg.description,
        pkg,
      })),
      { canPickMany: true, matchOnDescription: true, matchOnDetail: true, placeHolder: 'Select package(s)' },
    );
    if (!selected || selected.length === 0) return;

    if (selected.length > 1) {
      return services.jobs.run(packagesPlan(root, 'install', selected.map((item) => item.pkg.id)), root);
    }

    const pkg = selected[0].pkg;
    const action = await vscode.window.showQuickPick<Pick<PackageAction>>(
      pkg.installed
        ? [
            { label: 'Update', description: pkg.version, value: 'update' },
            { label: 'Remove', description: 'Delete package files and lockfile entry.', value: 'remove' },
          ]
        : [{ label: 'Install', description: pkg.version, value: 'install' }],
      { placeHolder: `${pkg.id}: choose action` },
    );
    if (!action) return;
    return services.jobs.run(packagesPlan(root, action.value, [pkg.id]), root);
  });
}
