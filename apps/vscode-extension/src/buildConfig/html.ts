import { FIELDS, SECTIONS, type FieldSpec, type FormValues } from './model';

// Rendering only. Every control is generated from FIELDS, so the form and the
// model cannot list different fields, and the script posts raw control values
// back for the model to interpret.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function control(field: FieldSpec, value: string | boolean): string {
  const id = escapeHtml(field.path);
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
  const hint = field.hint ? `<span class="hint">${escapeHtml(field.hint)}</span>` : '';
  const label = `<label for="${id}">${escapeHtml(field.label)} ${hint}</label>`;

  if (field.kind === 'boolean') {
    return `<div class="field checkbox-field" data-field="${id}">
      <input type="checkbox" id="${id}" data-path="${id}"${value === true ? ' checked' : ''}>
      ${label}
    </div>`;
  }
  if (field.kind === 'lines' || field.kind === 'map') {
    return `<div class="field" data-field="${id}">${label}
      <textarea id="${id}" data-path="${id}" rows="4"${placeholder}>${escapeHtml(String(value))}</textarea>
      <div class="error" data-error-for="${id}"></div>
    </div>`;
  }
  if (field.kind === 'choice') {
    const current = String(value);
    const choices = [...(field.choices ?? [])];
    // A value the form does not list (the CLI accepts more orientations than
    // these) stays selectable, so opening and saving the file does not drop it.
    if (current && !choices.some((choice) => choice.value === current)) choices.push({ value: current, label: current });
    const options = [{ value: '', label: '-- default --' }, ...choices]
      .map((choice) => `<option value="${escapeHtml(choice.value)}"${choice.value === current ? ' selected' : ''}>${escapeHtml(choice.label)}</option>`)
      .join('');
    return `<div class="field" data-field="${id}">${label}<select id="${id}" data-path="${id}">${options}</select></div>`;
  }
  const browse =
    field.kind === 'folder' || field.kind === 'file'
      ? `<button type="button" class="secondary" data-browse="${id}" data-kind="${field.kind}">Browse…</button>`
      : '';
  return `<div class="field" data-field="${id}">${label}
    <div class="input-row"><input type="text" id="${id}" data-path="${id}" value="${escapeHtml(String(value))}"${placeholder}>${browse}</div>
    <div class="error" data-error-for="${id}"></div>
  </div>`;
}

export type RenderOptions = {
  nonce: string;
  cspSource: string;
  projectName: string;
  configPath: string;
  exists: boolean;
  /** Doctor's verdict on feather.build.json, when it has one to give. */
  cliProblem?: string;
};

export function renderForm(values: FormValues, options: RenderOptions): string {
  const sections = SECTIONS.map((section) => {
    const fields = FIELDS.filter((field) => field.section === section);
    const body = fields.map((field) => control(field, values[field.path] ?? '')).join('\n');
    const open = section === 'General' || section === 'Files' || section === 'Upload';
    return `<details${open ? ' open' : ''}><summary>${escapeHtml(section)}</summary><div class="content">${body}</div></details>`;
  }).join('\n');

  const banner = options.cliProblem
    ? `<div class="banner danger" id="cli-problem">Feather doctor: ${escapeHtml(options.cliProblem)}</div>`
    : '<div class="banner danger" id="cli-problem" hidden></div>';

  return page(options, `
<h1>feather.build.json <span class="muted">· ${escapeHtml(options.projectName)}</span></h1>
<p class="muted">${escapeHtml(options.configPath)}${options.exists ? '' : ' (will be created on save)'}</p>
${banner}
<p class="muted">Fields not shown here (release signing, Fastlane, Gradle and Xcode overrides) are kept as they are in the file.</p>
<form id="form">${sections}</form>
<div class="sticky-bar">
  <button type="button" id="save">Save</button>
  <button type="button" class="secondary" id="open-file">Open JSON</button>
  <span class="status" id="status" role="status"></span>
</div>
<script nonce="${options.nonce}">
const vscode = acquireVsCodeApi();
const status = document.getElementById('status');
function collect() {
  const values = {};
  for (const el of document.querySelectorAll('[data-path]')) {
    values[el.dataset.path] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return values;
}
document.getElementById('save').addEventListener('click', () => {
  status.textContent = 'Saving…';
  for (const el of document.querySelectorAll('[data-error-for]')) el.textContent = '';
  vscode.postMessage({ type: 'save', values: collect() });
});
document.getElementById('open-file').addEventListener('click', () => vscode.postMessage({ type: 'open-file' }));
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-browse]');
  if (button) vscode.postMessage({ type: 'browse', path: button.dataset.browse, kind: button.dataset.kind });
});
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'browse-result') {
    const el = document.getElementById(msg.path);
    if (el) el.value = msg.value;
  } else if (msg.type === 'saved') {
    status.textContent = msg.message;
  } else if (msg.type === 'save-failed') {
    status.textContent = msg.message;
    for (const error of msg.errors || []) {
      const el = document.querySelector('[data-error-for="' + CSS.escape(error.path) + '"]');
      if (el) el.textContent = error.message;
    }
  } else if (msg.type === 'cli-problem') {
    const banner = document.getElementById('cli-problem');
    banner.hidden = !msg.message;
    banner.textContent = msg.message ? 'Feather doctor: ' + msg.message : '';
  }
});
</script>`);
}

/** Shown instead of the form when the file cannot be parsed: a blank form would overwrite it. */
export function renderInvalid(error: string, options: RenderOptions): string {
  return page(options, `
<h1>feather.build.json <span class="muted">· ${escapeHtml(options.projectName)}</span></h1>
<div class="banner danger">${escapeHtml(error)}</div>
<p>Fix the file, then reopen this panel. Saving a form over an unreadable file would discard its contents.</p>
<div class="sticky-bar"><button type="button" id="open-file">Open feather.build.json</button></div>
<script nonce="${options.nonce}">
const vscode = acquireVsCodeApi();
document.getElementById('open-file').addEventListener('click', () => vscode.postMessage({ type: 'open-file' }));
</script>`);
}

function page(options: RenderOptions, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.cspSource} 'nonce-${options.nonce}'; script-src 'nonce-${options.nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>feather.build.json</title>
<style nonce="${options.nonce}">
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { padding: 20px 24px 80px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); background: var(--vscode-editor-background); line-height: 1.5; }
  h1 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  p { margin-bottom: 12px; }
  .muted { color: var(--vscode-descriptionForeground); font-weight: normal; }
  .banner { padding: 8px 12px; border-radius: 3px; margin-bottom: 12px; }
  .banner.danger { border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
    background: var(--vscode-inputValidation-errorBackground, transparent); }
  .field { margin-bottom: 10px; }
  .field label { display: block; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
  .input-row { display: flex; gap: 6px; }
  input[type=text], textarea, select { background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555); border-radius: 2px; padding: 4px 8px; font-family: inherit;
    font-size: inherit; width: 100%; }
  textarea { resize: vertical; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  input:focus, textarea:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
  .checkbox-field { display: flex; align-items: center; gap: 8px; }
  .checkbox-field label { margin-bottom: 0; }
  .hint { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .error { font-size: 11px; color: var(--vscode-errorForeground); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none;
    border-radius: 2px; padding: 4px 12px; font-family: inherit; font-size: inherit; cursor: pointer; white-space: nowrap; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  details { border: 1px solid var(--vscode-widget-border, #444); border-radius: 3px; margin-bottom: 10px; }
  summary { cursor: pointer; padding: 8px 12px; font-weight: 600; font-size: 12px; user-select: none; }
  details > .content { padding: 12px; border-top: 1px solid var(--vscode-widget-border, #444); }
  .sticky-bar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--vscode-editor-background);
    border-top: 1px solid var(--vscode-widget-border, #444); padding: 10px 24px; display: flex; gap: 8px; align-items: center; }
  .status { font-size: 12px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>${body}</body>
</html>`;
}
