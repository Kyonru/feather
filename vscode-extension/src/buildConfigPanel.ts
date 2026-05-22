import * as vscode from 'vscode';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type BuildConfig = {
  name?: string;
  version?: string;
  loveVersion?: string;
  productId?: string;
  description?: string;
  company?: string;
  website?: string;
  copyright?: string;
  sourceDir?: string;
  outDir?: string;
  include?: string[];
  exclude?: string[];
  icon?: string;
  includeRuntime?: boolean;
  targets?: {
    web?: { loveJsDir?: string; title?: string; outputName?: string };
    windows?: { loveRuntimeDir?: string };
    macos?: { loveRuntimeDir?: string };
    linux?: { loveRuntimeDir?: string };
    steamos?: { loveRuntimeDir?: string };
    android?: {
      loveAndroidDir?: string;
      productId?: string;
      displayName?: string;
      orientation?: string;
      versionCode?: number;
      versionName?: string;
    };
    ios?: {
      loveIosDir?: string;
      bundleIdentifier?: string;
      displayName?: string;
      scheme?: string;
      configuration?: string;
      deploymentTarget?: string;
    };
  };
  upload?: {
    itch?: { project?: string; channels?: Record<string, string> };
  };
};

let panel: vscode.WebviewPanel | undefined;

export function openBuildConfigPanel(context: vscode.ExtensionContext, root: string): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'featherBuildConfig',
    'feather.build.json',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);

  const configPath = join(root, 'feather.build.json');
  let config: BuildConfig = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8')) as BuildConfig;
    } catch {
      vscode.window.showWarningMessage('feather.build.json contains invalid JSON — starting with an empty config.');
    }
  }

  panel.webview.html = getWebviewContent(config);

  panel.webview.onDidReceiveMessage(
    async (msg: { type: string; config?: BuildConfig; key?: string; kind?: 'file' | 'folder' }) => {
      switch (msg.type) {
        case 'save':
          if (msg.config) {
            try {
              writeFileSync(configPath, JSON.stringify(msg.config, null, 2) + '\n', 'utf8');
              vscode.window.showInformationMessage('feather.build.json saved.');
            } catch (err) {
              vscode.window.showErrorMessage(`Failed to save feather.build.json: ${(err as Error).message}`);
            }
          }
          break;

        case 'browse': {
          const isFolder = msg.kind === 'folder';
          const uris = await vscode.window.showOpenDialog({
            canSelectFiles: !isFolder,
            canSelectFolders: isFolder,
            canSelectMany: false,
            openLabel: isFolder ? 'Select folder' : 'Select file',
            defaultUri: vscode.Uri.file(root),
          });
          if (uris?.[0]) {
            panel?.webview.postMessage({ type: 'browse-result', key: msg.key, value: uris[0].fsPath });
          }
          break;
        }
      }
    },
    undefined,
    context.subscriptions,
  );
}

function field(id: string, label: string, value: string | undefined, placeholder = ''): string {
  const v = value ? escapeHtml(value) : '';
  const ph = placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : '';
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <input type="text" id="${id}" name="${id}" value="${v}"${ph}>
    </div>`;
}

function browseField(id: string, label: string, value: string | undefined, kind: 'file' | 'folder', placeholder = ''): string {
  const v = value ? escapeHtml(value) : '';
  const ph = placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : '';
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <div class="input-row">
        <input type="text" id="${id}" name="${id}" value="${v}"${ph}>
        <button type="button" class="secondary" onclick="browse('${id}','${kind}')">Browse…</button>
      </div>
    </div>`;
}

function checkboxField(id: string, label: string, checked: boolean | undefined): string {
  const c = checked ? ' checked' : '';
  return `
    <div class="field checkbox-field">
      <input type="checkbox" id="${id}" name="${id}"${c}>
      <label for="${id}">${label}</label>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getWebviewContent(config: BuildConfig): string {
  const t = config.targets ?? {};
  const itchChannels = config.upload?.itch?.channels
    ? Object.entries(config.upload.itch.channels).map(([k, v]) => `${k}=${v}`).join('\n')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>feather.build.json</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    padding: 20px 24px 80px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.5;
  }

  h1 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 20px;
    color: var(--vscode-foreground);
  }

  h2 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-widget-border, #444);
    padding-bottom: 6px;
    margin-bottom: 14px;
  }

  section {
    margin-bottom: 28px;
  }

  .field {
    margin-bottom: 10px;
  }

  .field label {
    display: block;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 4px;
  }

  .input-row {
    display: flex;
    gap: 6px;
  }

  input[type=text], textarea, select {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 2px;
    padding: 4px 8px;
    font-family: inherit;
    font-size: inherit;
    width: 100%;
  }

  input[type=text]:focus, textarea:focus, select:focus {
    outline: 1px solid var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .checkbox-field label {
    margin-bottom: 0;
  }

  textarea {
    resize: vertical;
    min-height: 70px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
  }

  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 2px;
    padding: 4px 12px;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover { background: var(--vscode-button-hoverBackground); }

  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

  details {
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 3px;
    margin-bottom: 10px;
  }

  details > summary {
    cursor: pointer;
    padding: 8px 12px;
    font-weight: 600;
    font-size: 12px;
    user-select: none;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  details > summary::before {
    content: '▶';
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    transition: transform 0.1s;
    display: inline-block;
  }

  details[open] > summary::before { transform: rotate(90deg); }

  details > .content {
    padding: 12px;
    border-top: 1px solid var(--vscode-widget-border, #444);
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 16px;
  }

  .hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 3px;
  }

  .sticky-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--vscode-editor-background);
    border-top: 1px solid var(--vscode-widget-border, #444);
    padding: 10px 24px;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .sticky-bar .save-status {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
</style>
</head>
<body>
<h1>feather.build.json</h1>
<form id="form">

  <section>
    <h2>General</h2>
    <div class="grid-2">
      ${field('name', 'Game name', config.name, 'My Game')}
      ${field('version', 'Version', config.version, '1.0.0')}
      ${field('loveVersion', 'LÖVE version', config.loveVersion, '11.5')}
      ${field('productId', 'Product ID', config.productId, 'com.company.mygame')}
    </div>
    ${field('description', 'Description', config.description)}
    <div class="grid-2">
      ${field('company', 'Company', config.company)}
      ${field('website', 'Website', config.website)}
    </div>
    ${field('copyright', 'Copyright', config.copyright, '© 2025 My Company')}
  </section>

  <section>
    <h2>Files</h2>
    <div class="grid-2">
      ${browseField('sourceDir', 'Source directory', config.sourceDir, 'folder', '(project root)')}
      ${browseField('outDir', 'Output directory', config.outDir, 'folder', 'dist')}
    </div>
    ${browseField('icon', 'Icon file', config.icon, 'file', 'icon.png')}
    <div class="field">
      <label for="include">Include patterns <span class="hint">comma-separated, e.g. *.lua,*.png</span></label>
      <input type="text" id="include" name="include" value="${escapeHtml((config.include ?? []).join(', '))}">
    </div>
    <div class="field">
      <label for="exclude">Exclude patterns <span class="hint">comma-separated</span></label>
      <input type="text" id="exclude" name="exclude" value="${escapeHtml((config.exclude ?? []).join(', '))}">
    </div>
    ${checkboxField('includeRuntime', 'Bundle Feather runtime in build output', config.includeRuntime)}
  </section>

  <section>
    <h2>Platform Targets</h2>

    <details>
      <summary>🌐 Web</summary>
      <div class="content">
        ${browseField('targets.web.loveJsDir', 'love.js vendor directory', t.web?.loveJsDir, 'folder', 'vendor/love.js')}
        ${field('targets.web.title', 'HTML title', t.web?.title)}
        ${field('targets.web.outputName', 'Output name', t.web?.outputName, 'game')}
      </div>
    </details>

    <details>
      <summary>🪟 Windows</summary>
      <div class="content">
        ${browseField('targets.windows.loveRuntimeDir', 'LÖVE Windows runtime directory', t.windows?.loveRuntimeDir, 'folder', 'vendor/love-windows')}
      </div>
    </details>

    <details>
      <summary>🍎 macOS</summary>
      <div class="content">
        ${browseField('targets.macos.loveRuntimeDir', 'LÖVE macOS runtime directory', t.macos?.loveRuntimeDir, 'folder', 'vendor/love-macos')}
      </div>
    </details>

    <details>
      <summary>🐧 Linux</summary>
      <div class="content">
        ${browseField('targets.linux.loveRuntimeDir', 'LÖVE Linux runtime directory', t.linux?.loveRuntimeDir, 'folder', 'vendor/love-linux')}
      </div>
    </details>

    <details>
      <summary>🎮 SteamOS</summary>
      <div class="content">
        ${browseField('targets.steamos.loveRuntimeDir', 'LÖVE SteamOS runtime directory', t.steamos?.loveRuntimeDir, 'folder', 'vendor/love-linux')}
        <p class="hint" style="margin-top: 8px;">Leave empty to fall back to the Linux runtime directory.</p>
      </div>
    </details>

    <details>
      <summary>🤖 Android</summary>
      <div class="content">
        ${browseField('targets.android.loveAndroidDir', 'love-android vendor directory', t.android?.loveAndroidDir, 'folder', 'vendor/love-android')}
        <div class="grid-2">
          ${field('targets.android.productId', 'Package name', t.android?.productId, 'com.company.mygame')}
          ${field('targets.android.displayName', 'Display name', t.android?.displayName)}
          ${field('targets.android.versionCode', 'Version code', t.android?.versionCode?.toString(), '1')}
          ${field('targets.android.versionName', 'Version name', t.android?.versionName, '1.0')}
        </div>
        <div class="field">
          <label for="targets.android.orientation">Orientation</label>
          <select id="targets.android.orientation" name="targets.android.orientation">
            <option value="">-- default --</option>
            <option value="portrait" ${t.android?.orientation === 'portrait' ? 'selected' : ''}>Portrait</option>
            <option value="landscape" ${t.android?.orientation === 'landscape' ? 'selected' : ''}>Landscape</option>
            <option value="sensorLandscape" ${t.android?.orientation === 'sensorLandscape' ? 'selected' : ''}>Sensor landscape</option>
            <option value="sensorPortrait" ${t.android?.orientation === 'sensorPortrait' ? 'selected' : ''}>Sensor portrait</option>
          </select>
        </div>
      </div>
    </details>

    <details>
      <summary>📱 iOS</summary>
      <div class="content">
        ${browseField('targets.ios.loveIosDir', 'love-ios vendor directory', t.ios?.loveIosDir, 'folder', 'vendor/love-ios')}
        <div class="grid-2">
          ${field('targets.ios.bundleIdentifier', 'Bundle identifier', t.ios?.bundleIdentifier, 'com.company.mygame')}
          ${field('targets.ios.displayName', 'Display name', t.ios?.displayName)}
          ${field('targets.ios.scheme', 'Xcode scheme', t.ios?.scheme, 'love')}
          ${field('targets.ios.configuration', 'Build configuration', t.ios?.configuration, 'Release')}
          ${field('targets.ios.deploymentTarget', 'Deployment target', t.ios?.deploymentTarget, '16.0')}
        </div>
      </div>
    </details>
  </section>

  <section>
    <h2>Upload</h2>
    ${field('upload.itch.project', 'itch.io project', config.upload?.itch?.project, 'username/game-name')}
    <div class="field">
      <label for="upload.itch.channels">
        itch.io channels
        <span class="hint">one per line: <code>platform=channel-name</code></span>
      </label>
      <textarea id="upload.itch.channels" name="upload.itch.channels" rows="5" placeholder="web=html5\nwindows=win\nmacos=osx\nlinux=linux">${escapeHtml(itchChannels)}</textarea>
    </div>
  </section>

</form>

<div class="sticky-bar">
  <button type="button" onclick="save()">Save feather.build.json</button>
  <span class="save-status" id="save-status"></span>
</div>

<script>
const vscode = acquireVsCodeApi();

function browse(fieldId, kind) {
  vscode.postMessage({ type: 'browse', key: fieldId, kind });
}

function val(id) {
  const el = document.getElementById(id);
  if (!el) return undefined;
  if (el.type === 'checkbox') return el.checked || undefined;
  return el.value.trim() || undefined;
}

function arrayVal(id) {
  const raw = val(id);
  if (!raw) return undefined;
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function numVal(id) {
  const v = val(id);
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

function channelsVal(id) {
  const raw = document.getElementById(id)?.value.trim();
  if (!raw) return undefined;
  const result = {};
  for (const line of raw.split('\\n')) {
    const [k, ...rest] = line.split('=');
    const key = k?.trim();
    const value = rest.join('=').trim();
    if (key && value) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function save() {
  const config = {};

  const strings = ['name','version','loveVersion','productId','description','company','website','copyright','sourceDir','outDir','icon'];
  for (const k of strings) { const v = val(k); if (v !== undefined) config[k] = v; }

  const inc = arrayVal('include'); if (inc) config.include = inc;
  const exc = arrayVal('exclude'); if (exc) config.exclude = exc;
  const ir = document.getElementById('includeRuntime')?.checked;
  if (ir) config.includeRuntime = true;

  const targets = {};

  // Web
  const webDir = val('targets.web.loveJsDir');
  const webTitle = val('targets.web.title');
  const webOut = val('targets.web.outputName');
  if (webDir || webTitle || webOut) {
    targets.web = {};
    if (webDir) targets.web.loveJsDir = webDir;
    if (webTitle) targets.web.title = webTitle;
    if (webOut) targets.web.outputName = webOut;
  }

  // Desktop runtimes
  for (const p of ['windows','macos','linux','steamos']) {
    const dir = val('targets.' + p + '.loveRuntimeDir');
    if (dir) targets[p] = { loveRuntimeDir: dir };
  }

  // Android
  const androidDir = val('targets.android.loveAndroidDir');
  const androidPid = val('targets.android.productId');
  const androidName = val('targets.android.displayName');
  const androidOri = val('targets.android.orientation');
  const androidVc = numVal('targets.android.versionCode');
  const androidVn = val('targets.android.versionName');
  if (androidDir || androidPid || androidName || androidOri || androidVc || androidVn) {
    targets.android = {};
    if (androidDir) targets.android.loveAndroidDir = androidDir;
    if (androidPid) targets.android.productId = androidPid;
    if (androidName) targets.android.displayName = androidName;
    if (androidOri) targets.android.orientation = androidOri;
    if (androidVc !== undefined) targets.android.versionCode = androidVc;
    if (androidVn) targets.android.versionName = androidVn;
  }

  // iOS
  const iosDir = val('targets.ios.loveIosDir');
  const iosBid = val('targets.ios.bundleIdentifier');
  const iosName = val('targets.ios.displayName');
  const iosScheme = val('targets.ios.scheme');
  const iosConf = val('targets.ios.configuration');
  const iosDt = val('targets.ios.deploymentTarget');
  if (iosDir || iosBid || iosName || iosScheme || iosConf || iosDt) {
    targets.ios = {};
    if (iosDir) targets.ios.loveIosDir = iosDir;
    if (iosBid) targets.ios.bundleIdentifier = iosBid;
    if (iosName) targets.ios.displayName = iosName;
    if (iosScheme) targets.ios.scheme = iosScheme;
    if (iosConf) targets.ios.configuration = iosConf;
    if (iosDt) targets.ios.deploymentTarget = iosDt;
  }

  if (Object.keys(targets).length > 0) config.targets = targets;

  // Upload
  const itchProject = val('upload.itch.project');
  const itchChannels = channelsVal('upload.itch.channels');
  if (itchProject || itchChannels) {
    config.upload = { itch: {} };
    if (itchProject) config.upload.itch.project = itchProject;
    if (itchChannels) config.upload.itch.channels = itchChannels;
  }

  vscode.postMessage({ type: 'save', config });
  const status = document.getElementById('save-status');
  if (status) {
    status.textContent = 'Saved ✓';
    setTimeout(() => { status.textContent = ''; }, 2500);
  }
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'browse-result' && msg.key) {
    const el = document.getElementById(msg.key);
    if (el) el.value = msg.value;
  }
});
</script>
</body>
</html>`;
}
