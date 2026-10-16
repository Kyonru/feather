import * as vscode from 'vscode';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBuildConfigPanel } from '../buildConfig/panel';
import type { JobResult } from '../jobs/runner';
import {
  releaseBuildPlan,
  uploadPlan,
  vendorAddPlan,
  vendorListPlan,
  type ReleaseOption,
  type ReleaseTarget,
  type VendorTarget,
} from '../plans';
import { vendorDirOption } from '../settings';
import { featherConfig, register, type Pick, type Services } from './context';

function ensureGitignoreEntry(dir: string, entry: string): void {
  const gitignorePath = join(dir, '.gitignore');
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  if (existing.split('\n').some((line) => line.trimEnd() === entry)) return;
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  writeFileSync(gitignorePath, `${existing}${separator}${entry}\n`, 'utf8');
}

function revealOutDir(result: JobResult): void {
  const outDir = (result.json as { outDir?: unknown } | undefined)?.outDir;
  if (typeof outDir === 'string') void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outDir));
}

export function registerBuildReleaseWorkflow(services: Services): void {
  register(services, 'feather.buildConfig', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;
    openBuildConfigPanel(services.context, services.project, root);
  });

  register(services, 'feather.buildRelease', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;
    const target = await vscode.window.showQuickPick<Pick<ReleaseTarget>>(
      [
        { label: '$(device-mobile) Android release', description: 'Build signed/store-oriented AAB and APK artifacts.', value: 'android' },
        { label: '$(device-mobile) iOS release', description: 'Build signed/store-oriented IPA and app artifacts.', value: 'ios' },
      ],
      { placeHolder: 'Select release build target', title: 'Feather: Create Release Build' },
    );
    if (!target) return;
    const options = await vscode.window.showQuickPick<Pick<ReleaseOption>>(
      [
        { label: '$(trash) Clean output', description: 'Remove previous build output and native cache before building.', value: 'clean', picked: true },
        { label: '$(beaker) Dry run', description: 'Show the build plan without writing artifacts.', value: 'dry-run' },
        { label: '$(database) Disable native cache', description: 'Force native Android/iOS build steps to run fresh.', value: 'no-cache' },
        { label: '$(list-unordered) Verbose logs', description: 'Stream native build commands and tool output.', value: 'verbose' },
      ],
      { canPickMany: true, placeHolder: 'Select release build options', title: `Feather: ${target.value} Release Options` },
    );
    if (!options) return;
    return services.jobs.run(releaseBuildPlan(root, target.value, options.map((option) => option.value)), root, {
      successActions: [{ label: 'Reveal Output', run: revealOutDir }],
    });
  });

  register(services, 'feather.vendor', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;
    const vendorDir = vendorDirOption(root, featherConfig().get<string>('vendorDir'));
    if (!vendorDir.ok) {
      const choice = await vscode.window.showErrorMessage(vendorDir.error, 'Open Settings');
      if (choice) await vscode.commands.executeCommand('workbench.action.openSettings', 'feather.vendorDir');
      return;
    }

    const action = await vscode.window.showQuickPick<Pick<'add' | 'list'>>(
      [
        { label: 'Add vendor templates', description: 'Fetch build vendor templates into the project.', value: 'add' },
        { label: 'List vendors', description: 'Show configured build vendors.', value: 'list' },
      ],
      { placeHolder: 'Vendor action' },
    );
    if (!action) return;
    if (action.value === 'list') {
      services.jobs.output.show(true);
      return services.jobs.run(vendorListPlan(root, vendorDir.value), root);
    }

    const vendor = await vscode.window.showQuickPick<Pick<VendorTarget>>(
      [
        { label: 'All vendors', value: 'all' },
        { label: 'Web', value: 'web' },
        { label: 'Android', value: 'android' },
        { label: 'iOS', value: 'ios' },
        { label: 'Desktop (Windows, macOS, Linux)', value: 'desktop' },
      ],
      { placeHolder: `Select vendor targets to fetch into ${vendorDir.value ?? 'vendor'}/` },
    );
    if (!vendor) return;
    // Vendor templates are large downloads; keep them out of the game's git history.
    ensureGitignoreEntry(root, `/${vendorDir.value ?? 'vendor'}`);
    return services.jobs.run(vendorAddPlan(root, [vendor.value], vendorDir.value), root);
  });

  register(services, 'feather.upload', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;
    const mode = await vscode.window.showQuickPick<Pick<'dry' | 'upload'>>(
      [
        { label: 'Dry run', description: 'Show the upload plan without running the uploader.', value: 'dry' },
        { label: 'Upload', description: 'Run the uploader after confirmation.', value: 'upload' },
      ],
      { placeHolder: 'Upload mode' },
    );
    if (!mode) return;
    if (mode.value === 'upload') {
      const confirmed = await vscode.window.showWarningMessage('Upload this build?', { modal: true }, 'Upload');
      if (confirmed !== 'Upload') return;
    }
    const build = await vscode.window.showQuickPick<Pick<'none' | 'web' | 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'steamos'>>(
      [
        { label: 'Use existing build', description: 'Upload from feather-build-manifest.json.', value: 'none' },
        { label: 'Build web first', value: 'web' },
        { label: 'Build Windows first', value: 'windows' },
        { label: 'Build macOS first', value: 'macos' },
        { label: 'Build Linux first', value: 'linux' },
        { label: 'Build Android first', value: 'android' },
        { label: 'Build iOS first', value: 'ios' },
        { label: 'Build SteamOS first', value: 'steamos' },
      ],
      { placeHolder: 'Build before upload?' },
    );
    if (!build) return;
    services.jobs.output.show(true);
    return services.jobs.run(
      uploadPlan(root, {
        target: featherConfig().get<string>('defaultUploadTarget')?.trim() || 'itch',
        channel: featherConfig().get<string>('defaultUploadChannel')?.trim() || undefined,
        buildTarget: build.value === 'none' ? undefined : build.value,
        dryRun: mode.value === 'dry',
      }),
      root,
    );
  });
}
