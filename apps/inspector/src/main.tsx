import React from "react";
import ReactDOM from "react-dom/client";
import { createWebHost } from "@feather/host";
import { createTauriHost } from "@feather/host/tauri";
import { setCommandSender } from "@feather/session-bridge";
import { tauriCommandSender } from "./lib/tauri-command-sender";
import { isWeb } from "./utils/platform";
import { serveStudioPreferencesExport } from "./lib/studio-preferences-export";
import { AppProvider } from "./providers";
import { Router } from "./router";
import "./App.css";

// This bundle also runs in a plain browser — `pnpm run web`, and the Playwright
// suite — where the Tauri APIs are absent. Pick the host from what is actually
// available rather than from which bundle this is.
// The file dialogs need a real Tauri runtime, so the host is chosen by what is
// actually present — this bundle also runs in a plain browser via `pnpm run web`
// and the Playwright suite.
const host = isWeb() ? createWebHost() : createTauriHost();

// The command transport is registered unconditionally for this bundle. It routes
// through Tauri's `invoke`, which the Playwright suite mocks, so gating it on
// isWeb() would silently disable every game command under test. The showcase has
// its own entry point and registers nothing, which is what leaves the creative
// tools as local editors on the real web.
setCommandSender(tauriCommandSender);

// Answer Feather Studio's one-time preferences handoff. Read-only, and a no-op
// when there is nothing to hand over.
if (!isWeb()) {
  void serveStudioPreferencesExport();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppProvider host={host}>
      <Router />
    </AppProvider>
  </React.StrictMode>
);
