import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { basename, join } from 'node:path';
import type { ProjectService } from '../project/service';
import { doctorCheckFor } from '../project/state';
import { renderForm, renderInvalid } from './html';
import {
  applyFormChanges,
  formValues,
  projectRelativePath,
  readBuildConfigFile,
  writeBuildConfigFile,
  type FormValues,
} from './model';

type Message =
  | { type: 'save'; values: FormValues }
  | { type: 'browse'; path: string; kind: 'file' | 'folder' }
  | { type: 'open-file' };

let current: { panel: vscode.WebviewPanel; root: string } | undefined;

/** Doctor's verdict on feather.build.json — the CLI's validation, not a copy of it. */
function cliProblem(project: ProjectService, root: string): string | undefined {
  const state = project.state;
  if (!state || state.root !== root) return undefined;
  const check = doctorCheckFor(state, 'feather.build.json');
  return check?.severity === 'fail' ? check.detail ?? 'invalid' : undefined;
}

export function openBuildConfigPanel(context: vscode.ExtensionContext, project: ProjectService, root: string): void {
  if (current && current.root === root) {
    current.panel.reveal(vscode.ViewColumn.One);
    return;
  }
  current?.panel.dispose();

  const panel = vscode.window.createWebviewPanel('featherBuildConfig', `feather.build.json · ${basename(root)}`, vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [],
  });
  current = { panel, root };
  const configPath = join(root, 'feather.build.json');
  let initial: FormValues = {};

  const render = () => {
    const nonce = randomBytes(16).toString('base64');
    const read = readBuildConfigFile(configPath);
    const options = {
      nonce,
      cspSource: panel.webview.cspSource,
      projectName: basename(root),
      configPath,
      exists: read.ok && read.exists,
      cliProblem: cliProblem(project, root),
    };
    if (!read.ok) {
      panel.webview.html = renderInvalid(read.error, options);
      return;
    }
    initial = formValues(read.config);
    panel.webview.html = renderForm(initial, options);
  };
  render();

  const subscriptions: vscode.Disposable[] = [
    project.onDidChange(() => {
      void panel.webview.postMessage({ type: 'cli-problem', message: cliProblem(project, root) ?? '' });
    }),
  ];

  panel.webview.onDidReceiveMessage(
    async (msg: Message) => {
      if (msg.type === 'open-file') {
        await vscode.window.showTextDocument(vscode.Uri.file(configPath), { viewColumn: vscode.ViewColumn.Beside });
        return;
      }
      if (msg.type === 'browse') {
        const isFolder = msg.kind === 'folder';
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: !isFolder,
          canSelectFolders: isFolder,
          canSelectMany: false,
          openLabel: isFolder ? 'Select folder' : 'Select file',
          defaultUri: vscode.Uri.file(root),
        });
        if (uris?.[0]) {
          void panel.webview.postMessage({ type: 'browse-result', path: msg.path, value: projectRelativePath(root, uris[0].fsPath) });
        }
        return;
      }
      if (msg.type === 'save') {
        // Re-read at save time and apply only what changed in the form, so an
        // edit made in the JSON file while the panel was open survives.
        const read = readBuildConfigFile(configPath);
        if (!read.ok) {
          void panel.webview.postMessage({ type: 'save-failed', message: read.error, errors: [] });
          return;
        }
        const { config, errors, changed } = applyFormChanges(read.config, initial, msg.values);
        if (errors.length > 0) {
          void panel.webview.postMessage({ type: 'save-failed', message: 'Fix the highlighted fields.', errors });
          return;
        }
        if (changed.length === 0 && read.exists) {
          void panel.webview.postMessage({ type: 'saved', message: 'No changes.' });
          return;
        }
        try {
          writeBuildConfigFile(configPath, config);
        } catch (err) {
          void panel.webview.postMessage({ type: 'save-failed', message: `Could not save: ${(err as Error).message}`, errors: [] });
          return;
        }
        initial = formValues(config);
        void panel.webview.postMessage({ type: 'saved', message: `Saved ${changed.length} field${changed.length === 1 ? '' : 's'}. Checking with Feather doctor…` });
        await project.refreshNow();
        const problem = cliProblem(project, root);
        void panel.webview.postMessage({ type: 'saved', message: problem ? 'Saved, but Feather doctor reports a problem.' : 'Saved.' });
      }
    },
    undefined,
    subscriptions,
  );

  panel.onDidDispose(() => {
    if (current?.panel === panel) current = undefined;
    for (const subscription of subscriptions) subscription.dispose();
  }, null, context.subscriptions);
}
