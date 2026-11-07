import * as vscode from 'vscode';
import { bundledPlatform } from '../cli';
import { loadCliDefaults } from '../catalog';
import { doctorPlan, initPlan, removePlan, updatePlan, type InitChoices, type InitMode } from '../plans';
import { featherConfig, nonEmpty, register, type Pick, type Services } from './context';
import { pickHotReloadAllowlist, pickPlugins } from './plugins';

async function pickInitMode(): Promise<InitMode | undefined> {
  const mode = await vscode.window.showQuickPick<Pick<InitMode>>(
    [
      { label: '$(terminal) CLI mode', description: 'Recommended. No game-code changes; use Feather: Run Project.', value: 'cli' },
      { label: '$(tools) Auto embedded mode', description: 'Advanced. Patch main.lua with guarded feather.auto loader.', value: 'auto' },
      { label: '$(file-code) Manual embedded mode', description: 'Advanced. Create feather.debugger.lua and guarded loader.', value: 'manual' },
    ],
    { placeHolder: 'Select setup mode' },
  );
  return mode?.value;
}

/** Collect init choices. Option names and defaults live in the CLI; this only asks. */
async function askInitChoices(services: Services, root: string, mode: InitMode): Promise<InitChoices | undefined> {
  const defaults = loadCliDefaults(services.context.extensionPath).initPlugins;
  const flow = await vscode.window.showQuickPick<Pick<'quick' | 'custom'>>(
    [
      { label: 'Recommended setup', description: `CLI defaults: bundled runtime, plugins ${defaults.join(', ') || 'none'}.`, value: 'quick' },
      { label: 'Customize setup', description: 'Choose session name, security, runtime source, plugins, and hot reload.', value: 'custom' },
    ],
    { placeHolder: 'Choose init setup' },
  );
  if (!flow) return undefined;
  // The CLI's default list, read from its build by prepare.mjs, is passed
  // explicitly so embedded modes get the same plugins as CLI mode. Without the
  // snapshot, the CLI's own default applies.
  const defaultPlugins: InitChoices['plugins'] = defaults.length > 0 ? { kind: 'ids', ids: defaults } : { kind: 'cli-default' };
  if (flow.value === 'quick') return { mode, plugins: defaultPlugins };

  const choices: InitChoices = { mode, plugins: defaultPlugins };
  choices.sessionName = nonEmpty(await vscode.window.showInputBox({ prompt: 'Session name shown in Feather (optional)', placeHolder: 'My Game' }));

  const security = await vscode.window.showQuickPick<Pick<'appId' | 'insecure' | 'unset'>>(
    [
      { label: 'Desktop App ID', description: 'Restrict commands to your Feather desktop app.', value: 'appId' },
      { label: 'Insecure local dev', description: 'Allow any desktop connection. Use only for trusted development.', value: 'insecure' },
      { label: 'Leave unset', description: 'Doctor will warn until appId or insecure mode is configured.', value: 'unset' },
    ],
    { placeHolder: 'Select connection security' },
  );
  if (!security) return undefined;
  if (security.value === 'appId') {
    const appId = nonEmpty(await vscode.window.showInputBox({
      prompt: 'Desktop App ID from Feather Settings > Security',
      placeHolder: 'feather-app-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      validateInput: (value) => (value.trim() ? undefined : 'App ID cannot be empty'),
    }));
    if (!appId) return undefined;
    choices.security = { kind: 'appId', appId };
  } else {
    choices.security = { kind: security.value };
  }

  const source = await vscode.window.showQuickPick<Pick<'bundled' | 'remote' | 'local'>>(
    [
      { label: 'Bundled runtime', description: 'Use the runtime packaged with this extension.', value: 'bundled' },
      { label: 'GitHub branch or tag', description: 'Download runtime files from GitHub.', value: 'remote' },
      { label: 'Local packages/runtime-lua folder', description: 'Copy runtime files from a local source checkout.', value: 'local' },
    ],
    { placeHolder: 'Select runtime source' },
  );
  if (!source) return undefined;
  if (source.value === 'remote') {
    const branch = nonEmpty(await vscode.window.showInputBox({
      prompt: 'GitHub branch or tag',
      value: 'main',
      validateInput: (value) => (value.trim() ? undefined : 'Branch cannot be empty'),
    }));
    if (!branch) return undefined;
    choices.source = { kind: 'remote', branch };
  } else if (source.value === 'local') {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      defaultUri: vscode.Uri.file(root),
      openLabel: 'Use packages/runtime-lua',
      title: 'Feather: Select local packages/runtime-lua folder',
    });
    const path = uris?.[0]?.fsPath;
    if (!path) return undefined;
    choices.source = { kind: 'local', path };
  }

  const pluginMode = await vscode.window.showQuickPick<Pick<'default' | 'select' | 'none'>>(
    [
      { label: 'Default plugins', description: defaults.join(', ') || 'none', value: 'default' },
      { label: 'Select plugins', description: 'Choose exactly which plugins init should include.', value: 'select' },
      { label: 'No plugins', description: 'Create Feather config/runtime only.', value: 'none' },
    ],
    { placeHolder: 'Select plugin setup' },
  );
  if (!pluginMode) return undefined;
  if (pluginMode.value === 'none') {
    choices.plugins = { kind: 'none' };
  } else if (pluginMode.value === 'select') {
    const plugins = await pickPlugins(services, 'Select plugins to install now', new Set(defaults));
    if (!plugins) return undefined;
    choices.plugins = { kind: 'ids', ids: plugins.map((plugin) => plugin.id) };
  }

  if (choices.plugins.kind === 'ids' && choices.plugins.ids.includes('hot-reload')) {
    const allow = await pickHotReloadAllowlist(root);
    if (!allow) return undefined;
    choices.hotReloadAllow = allow;
  }
  return choices;
}

export function registerSetupWorkflow(services: Services): void {
  register(services, 'feather.init', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;
    const mode = await pickInitMode();
    if (!mode) return;
    const choices = await askInitChoices(services, root, mode);
    if (!choices) return;
    return services.jobs.run(initPlan(root, choices), root);
  });

  register(services, 'feather.doctor', async () => {
    // Say which snapshot this extension carries. It bundles its own CLI and
    // runtime rather than calling the user's, so without this the versions
    // being diagnosed are invisible.
    const platform = bundledPlatform(services.context.extensionPath);
    if (platform) {
      services.jobs.output.appendLine(`Feather platform ${platform.featherPlatform} (CLI ${platform.cli}, runtime ${platform.runtime})`);
    }
    const root = await services.project.requireRoot();
    if (!root) return;
    services.jobs.output.show(true);
    // Doctor exits non-zero when it finds blockers; that is a report, not a crash.
    return services.jobs.run(doctorPlan(root), root);
  });

  register(services, 'feather.remove', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;
    const confirmed = await vscode.window.showWarningMessage(`Remove Feather from ${root}?`, { modal: true }, 'Remove');
    if (confirmed !== 'Remove') return;
    return services.jobs.run(removePlan(root), root);
  });

  register(services, 'feather.update', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;
    return services.jobs.run(updatePlan(root), root);
  });

  register(services, 'feather.selectProject', () => services.project.select());

  register(services, 'feather.refreshProjectView', () => services.project.refreshNow());

  register(services, 'feather.configure', async () => {
    const cfg = featherConfig();
    const projectDir = cfg.get<string>('projectDir') || '';
    const loveExec = cfg.get<string>('loveExecutable') || '';
    const uploadTarget = cfg.get<string>('defaultUploadTarget') || 'itch';
    const uploadChannel = cfg.get<string>('defaultUploadChannel') || '';
    const watchMode = cfg.get<boolean>('watchMode') ?? false;

    type SettingPick = vscode.QuickPickItem & { key: string };
    const setting = await vscode.window.showQuickPick<SettingPick>(
      [
        {
          label: '$(folder) Project directory',
          description: projectDir || services.project.currentRoot() || '(not selected)',
          detail: projectDir ? 'Set by feather.projectDir' : 'Folder containing main.lua — chosen per workspace',
          key: 'projectDir',
        },
        { label: '$(terminal) LÖVE executable', description: loveExec || '(auto-detect)', detail: 'Path to the love2d binary', key: 'loveExecutable' },
        { label: '$(cloud-upload) Upload target', description: uploadTarget, detail: 'Default target for Feather: Upload Build (e.g. itch, steam)', key: 'defaultUploadTarget' },
        { label: '$(tag) Upload channel', description: uploadChannel || '(none)', detail: 'Default channel passed to uploads', key: 'defaultUploadChannel' },
        {
          label: watchMode ? '$(eye) Watch mode: ON' : '$(eye-closed) Watch mode: OFF',
          description: 'Toggle between run and watch when clicking Run Project',
          key: 'watchMode',
        },
      ],
      { placeHolder: 'Select a setting to configure', matchOnDescription: true, matchOnDetail: true },
    );
    if (!setting) return;

    if (setting.key === 'projectDir') {
      await services.project.select();
    } else if (setting.key === 'loveExecutable') {
      const choice = await vscode.window.showQuickPick<Pick<'browse' | 'clear'>>(
        [
          { label: '$(folder-opened) Browse…', value: 'browse' },
          { label: '$(trash) Clear (use auto-detect)', value: 'clear' },
        ],
        { placeHolder: loveExec || 'Select action' },
      );
      if (!choice) return;
      if (choice.value === 'clear') {
        await cfg.update('loveExecutable', '', vscode.ConfigurationTarget.Workspace);
      } else {
        const uris = await vscode.window.showOpenDialog({
          canSelectFolders: false,
          canSelectFiles: true,
          canSelectMany: false,
          openLabel: 'Select LÖVE executable',
          title: 'Feather: Select LÖVE executable',
        });
        if (!uris || uris.length === 0) return;
        await cfg.update('loveExecutable', uris[0].fsPath, vscode.ConfigurationTarget.Workspace);
      }
    } else if (setting.key === 'defaultUploadTarget') {
      const target = await vscode.window.showInputBox({
        prompt: 'Upload target (e.g. itch, steam)',
        value: uploadTarget,
        validateInput: (v) => (v.trim() ? undefined : 'Target cannot be empty'),
      });
      if (target === undefined) return;
      await cfg.update('defaultUploadTarget', target.trim(), vscode.ConfigurationTarget.Workspace);
    } else if (setting.key === 'defaultUploadChannel') {
      const channel = await vscode.window.showInputBox({ prompt: 'Upload channel (leave empty to unset)', value: uploadChannel });
      if (channel === undefined) return;
      await cfg.update('defaultUploadChannel', channel || '', vscode.ConfigurationTarget.Workspace);
    } else if (setting.key === 'watchMode') {
      await cfg.update('watchMode', !watchMode, vscode.ConfigurationTarget.Workspace);
    }
  });
}
