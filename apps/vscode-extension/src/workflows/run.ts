import * as vscode from 'vscode';
import { cliInvocation, runInTerminal } from '../cli';
import { runCliQuery } from '../jobs/runner';
import { RUN_TARGETS, runPlans, runTargetVendor, vendorAddPlan, vendorStatusArgs, type RunTarget } from '../plans';
import { targetIcon } from '../featherPanel';
import { vendorDirOption } from '../settings';
import { featherConfig, isWatchMode, register, savedTargets, type Services } from './context';

async function pickTargets(currentTargets: RunTarget[], watchMode: boolean): Promise<RunTarget[] | undefined> {
  const available = watchMode ? RUN_TARGETS.filter((t) => t !== 'web') : RUN_TARGETS;
  type TargetPick = vscode.QuickPickItem & { target: RunTarget };
  const picked = await vscode.window.showQuickPick<TargetPick>(
    available.map((t) => ({ label: `$(${targetIcon(t)}) ${t}`, target: t, picked: currentTargets.includes(t) })),
    {
      canPickMany: true,
      placeHolder: `Select run targets${watchMode ? ' (watch mode — web excluded)' : ''}`,
      title: 'Feather: Select Run Targets',
    },
  );
  return picked?.map((i) => i.target);
}

/**
 * Which selected targets lack their build vendor, according to the CLI
 * (`build vendor list --json`, which honours feather.build.json paths). When
 * the CLI cannot answer, no check is made and `feather run` reports instead.
 */
async function missingVendors(services: Services, root: string, targets: RunTarget[], vendorDir: string | undefined): Promise<RunTarget[]> {
  const needed = targets.filter((target) => runTargetVendor(target));
  if (needed.length === 0) return [];
  const result = await runCliQuery(cliInvocation(services.context.extensionPath), vendorStatusArgs(root, vendorDir), root);
  const vendors = (result.json as { vendors?: { target: string; valid: boolean }[] } | undefined)?.vendors;
  if (!Array.isArray(vendors)) return [];
  return needed.filter((target) => vendors.some((vendor) => vendor.target === runTargetVendor(target) && !vendor.valid));
}

export function registerRunWorkflow(services: Services): void {
  register(services, 'feather.run', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;

    let targets = savedTargets();
    if (targets.length === 0) {
      const picked = await pickTargets([], isWatchMode());
      if (!picked || picked.length === 0) return;
      targets = picked;
      await featherConfig().update('runTargets', targets, vscode.ConfigurationTarget.Workspace);
    }

    const vendorDir = vendorDirOption(root, featherConfig().get<string>('vendorDir'));
    const missing = await missingVendors(services, root, targets, vendorDir.ok ? vendorDir.value : undefined);
    if (missing.length > 0) {
      const action = await vscode.window.showWarningMessage(
        `Missing build vendor for: ${missing.join(', ')}.`,
        'Fetch Vendors',
        'Run Anyway',
        'Change Targets',
      );
      if (!action) return;
      if (action === 'Change Targets') {
        await vscode.commands.executeCommand('feather.selectTargets');
        return;
      }
      if (action === 'Fetch Vendors') {
        if (!vendorDir.ok) {
          void vscode.window.showErrorMessage(vendorDir.error);
          return;
        }
        const vendorTargets = missing.map((target) => runTargetVendor(target)!);
        const result = await services.jobs.run(vendorAddPlan(root, vendorTargets, vendorDir.value), root);
        if (result?.status !== 'succeeded') return;
      }
    }

    const watch = isWatchMode();
    const love = featherConfig().get<string>('loveExecutable')?.trim() || undefined;
    const { plans, skipped } = runPlans(root, targets, { watch, love });
    if (skipped.length > 0) {
      void vscode.window.showInformationMessage(`Watch mode does not support ${skipped.join(', ')} — skipped.`);
    }
    for (const plan of plans) await runInTerminal(services.context, plan, root);
  });

  register(services, 'feather.selectTargets', async () => {
    const picked = await pickTargets(savedTargets(), isWatchMode());
    if (!picked) return;
    await featherConfig().update('runTargets', picked, vscode.ConfigurationTarget.Workspace);
  });

  register(services, 'feather.toggleWatch', async () => {
    await featherConfig().update('watchMode', !isWatchMode(), vscode.ConfigurationTarget.Workspace);
  });
}
