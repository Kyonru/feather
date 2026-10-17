import * as vscode from 'vscode';
import { join } from 'node:path';
import { runInTerminal } from '../cli';
import { loadPackageCatalog, type PackageEntry } from '../catalog';
import { packageAddPlan, packageDependenciesPlan, packagesPlan, type PackageAction } from '../plans';
import { register, type Pick, type Services } from './context';

type PackagePick = vscode.QuickPickItem & { pkg: PackageEntry };
type PackageMenuAction = 'catalog' | 'add-custom' | 'install-dependencies';

async function packageRoot(services: Services): Promise<string | undefined> {
  const root = await services.project.requireRoot();
  if (!root) return undefined;
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
    return undefined;
  }
  return root;
}

async function addCustomPackage(services: Services): Promise<void> {
  const root = await packageRoot(services);
  if (!root) return;
  await runInTerminal(services.context, packageAddPlan(root), root);
}

async function installProjectDependencies(services: Services): Promise<void> {
  const root = await packageRoot(services);
  if (!root) return;
  await services.jobs.run(packageDependenciesPlan(root), root);
}

export function registerPackageWorkflow(services: Services): void {
  register(services, 'feather.packageAdd', () => addCustomPackage(services));
  register(services, 'feather.packageInstallDependencies', () => installProjectDependencies(services));

  register(services, 'feather.packages', async () => {
    const root = await packageRoot(services);
    if (!root) return;
    const state = services.project.state;

    const menu = await vscode.window.showQuickPick<Pick<PackageMenuAction>>(
      [
        { label: 'Browse Package Catalog', description: 'Install, update, or remove curated dependencies.', value: 'catalog' },
        { label: 'Add Custom Package', description: 'Choose files from GitHub, an authenticated Git repo, or direct URLs.', value: 'add-custom' },
        { label: 'Install Project Dependencies', description: 'Restore every dependency recorded in feather.lock.json.', value: 'install-dependencies' },
      ],
      { placeHolder: 'Choose a package workflow', title: 'Feather: Manage Packages' },
    );
    if (!menu) return;
    if (menu.value === 'add-custom') return addCustomPackage(services);
    if (menu.value === 'install-dependencies') return installProjectDependencies(services);

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
