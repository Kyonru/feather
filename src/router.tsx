import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router';
import { toast } from 'sonner';
import {
  BookOpenIcon,
  CopyIcon,
  ExternalLinkIcon,
  MonitorIcon,
  PlayIcon,
  SettingsIcon,
  TerminalIcon,
} from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { CommandCenter } from '@/components/command-center';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import Logs from './pages/log';
import Performance from './pages/performance';
import Observability from './pages/observable';
import Plugins from './pages/plugins';
import Console from './pages/console';
import Debugger from './pages/debugger';
import TimeTravel from './pages/time-travel';
import SessionReplay from './pages/session-replay';
import Compare from './pages/compare';
import Assets from './pages/assets';
import ParticleSystemPlayground from './pages/particle-system-playground';
import ShaderGraph from './pages/shader-graph';
import TextureLab from './pages/texture-lab';
import SessionPage from './pages/session';
import { SettingsModal } from './pages/settings';
import { useConfigStore } from './store/config';
import { AboutModal } from './pages/about';
import { useWsConnection } from './hooks/use-ws-connection';
import { isCreativeSession, sessionCanOpenRuntimePages, sessionSupportsRuntime, useSessionStore } from './store/session';
import { useSettingsStore } from './store/settings';
import { copyToClipboardWithMeta } from './utils/strings';
import { openUrl } from './utils/linking';
import { sendCommand } from './lib/send-command';

const INSTALL_DOCS_URL = 'https://kyonru.github.io/feather/installation/';
const CLI_DOCS_URL = 'https://kyonru.github.io/feather/cli/';

const Modals = () => {
  const disconnected = useConfigStore((state) => state.disconnected);
  useWsConnection();

  useEffect(() => {
    if (disconnected) {
      toast.error('Server disconnected', {
        position: 'bottom-center',
      });
    } else {
      toast.dismiss();
      toast.success('Server connected', {
        position: 'bottom-center',
      });
    }
  }, [disconnected]);

  return (
    <>
      <SettingsModal />
      <AboutModal />
      <Toaster richColors />
    </>
  );
};

const runtimeInterestForPath = (pathname: string) => {
  const pluginMatch = pathname.match(/^\/plugins\/([^/]+)/);
  const pluginId = pluginMatch?.[1] ? decodeURIComponent(pluginMatch[1]) : null;
  return {
    logs: true,
    performance: true,
    observers: pathname.startsWith('/observability'),
    assets: pathname.startsWith('/assets'),
    plugins: pathname.startsWith('/plugins'),
    profiler: pathname.startsWith('/performance'),
    timeTravel: pathname.startsWith('/time-travel'),
    sessionReplay: pathname.startsWith('/session-replay'),
    console: pathname.startsWith('/console'),
    debugger: pathname.startsWith('/debugger'),
    shaderGraph: pathname.startsWith('/shader-graph'),
    particlePlayground: pathname.startsWith('/particle-system-playground'),
    pluginIds: [
      pluginId,
      pathname.startsWith('/shader-graph') ? 'shader-graph' : null,
      pathname.startsWith('/particle-system-playground') ? 'particle-system-playground' : null,
      pathname.startsWith('/time-travel') ? 'time-travel' : null,
      pathname.startsWith('/session-replay') ? 'session-replay' : null,
    ].filter(Boolean),
  };
};

const runtimeRefreshCommandsForPath = (pathname: string): Array<Record<string, unknown>> => {
  const interest = runtimeInterestForPath(pathname);
  const commands: Array<Record<string, unknown>> = [];

  if (interest.performance) {
    commands.push({ type: 'req:performance' });
  }
  if (interest.profiler) {
    commands.push({ type: 'cmd:profiler', action: 'refresh', params: {} });
  }
  if (interest.observers) {
    commands.push({ type: 'req:observers' });
  }
  if (interest.assets) {
    commands.push({ type: 'req:assets' });
  }
  if (interest.plugins || interest.shaderGraph || interest.particlePlayground) {
    commands.push({ type: 'req:plugins' });
  }

  return commands;
};

function RuntimeInterestBridge() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const activeSession = useSessionStore((state) => (state.sessionId ? state.sessions[state.sessionId] : null));
  const { pathname } = useLocation();

  useEffect(() => {
    if (!sessionId || !sessionSupportsRuntime(activeSession)) return;
    sendCommand(sessionId, {
      type: 'cmd:runtime:interest',
      data: {
        features: runtimeInterestForPath(pathname),
      },
    }).catch(() => {});
    for (const command of runtimeRefreshCommandsForPath(pathname)) {
      sendCommand(sessionId, command).catch(() => {});
    }
  }, [activeSession, pathname, sessionId]);

  return null;
}

function SessionEmptyState() {
  const sessions = useSessionStore((state) => state.sessions);
  const setSettingsOpen = useSettingsStore((state) => state.setOpen);
  const cliProjectDir = useSettingsStore((state) => state.cliProjectDir);
  const hasSessions = Object.keys(sessions).length > 0;
  const runCommand = `feather run ${cliProjectDir || 'path/to/my-game'}`;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-2xl flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center rounded-md border bg-muted/40">
          <MonitorIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="grid gap-1">
          <p className="text-lg font-semibold">{hasSessions ? 'Select a session' : 'No session connected'}</p>
          <p className="text-sm text-muted-foreground">
            {hasSessions
              ? 'Choose a game session from the header before opening Feather tools.'
              : 'Start a game with Feather enabled, or configure the connection settings to begin.'}
          </p>
        </div>
        {!hasSessions && (
          <>
            <div className="grid w-full gap-2 rounded-md border bg-card p-3 text-left shadow-xs sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-3"
                onClick={() => setSettingsOpen(true)}
              >
                <SettingsIcon className="size-4 text-muted-foreground" />
                <span className="grid gap-0.5">
                  <span>Connect a LÖVE project</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Set port, API key, and mobile setup.
                  </span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-3"
                onClick={() => openUrl(INSTALL_DOCS_URL)}
              >
                <ExternalLinkIcon className="size-4 text-muted-foreground" />
                <span className="grid gap-0.5">
                  <span>Install CLI</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Use npm to install Feather globally.
                  </span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-3"
                onClick={() => openUrl(CLI_DOCS_URL)}
              >
                <BookOpenIcon className="size-4 text-muted-foreground" />
                <span className="grid gap-0.5">
                  <span>Open docs</span>
                  <span className="text-xs font-normal text-muted-foreground">Read the CLI workflow and commands.</span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-3"
                onClick={() => {
                  copyToClipboardWithMeta(runCommand);
                  toast.success('Copied CLI run command');
                }}
              >
                <PlayIcon className="size-4 text-muted-foreground" />
                <span className="grid min-w-0 gap-0.5">
                  <span>Run Project with CLI</span>
                  <span className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                    <TerminalIcon className="size-3 shrink-0" />
                    <code className="truncate">{runCommand}</code>
                    <CopyIcon className="size-3 shrink-0" />
                  </span>
                </span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              These are setup shortcuts only. Feather will move out of the way once a session connects.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function RequireRuntimeSession({ children }: { children: React.ReactNode }) {
  const activeSession = useSessionStore((state) => (state.sessionId ? state.sessions[state.sessionId] : null));
  return sessionCanOpenRuntimePages(activeSession) ? children : <SessionEmptyState />;
}

function RequireWorkspaceSession({ children }: { children: React.ReactNode }) {
  const activeSession = useSessionStore((state) => (state.sessionId ? state.sessions[state.sessionId] : null));
  return activeSession || isCreativeSession(activeSession) ? children : <SessionEmptyState />;
}

export const Router = () => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace') return;
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <BrowserRouter>
      <SidebarProvider
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 58)',
            '--header-height': 'calc(var(--spacing) * 12)',
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset className="min-w-0 overflow-hidden">
          <SiteHeader />
          <div className="flex min-h-0 flex-1 flex-col">
            <Routes>
              <Route
                path="/"
                element={
                  <RequireRuntimeSession>
                    <Logs />
                  </RequireRuntimeSession>
                }
              />
              <Route
                path="/performance"
                element={
                  <RequireRuntimeSession>
                    <Performance />
                  </RequireRuntimeSession>
                }
              />
              <Route
                path="/observability"
                element={
                  <RequireRuntimeSession>
                    <Observability />
                  </RequireRuntimeSession>
                }
              />
              <Route
                path="/console"
                element={
                  <RequireRuntimeSession>
                    <Console />
                  </RequireRuntimeSession>
                }
              />
              <Route
                path="/debugger"
                element={
                  <RequireRuntimeSession>
                    <Debugger />
                  </RequireRuntimeSession>
                }
              />
              <Route
                path="/time-travel"
                element={
                  <RequireRuntimeSession>
                    <TimeTravel />
                  </RequireRuntimeSession>
                }
              />
              <Route
                path="/session-replay"
                element={
                  <RequireRuntimeSession>
                    <SessionReplay />
                  </RequireRuntimeSession>
                }
              />
              <Route
                path="/assets"
                element={
                  <RequireRuntimeSession>
                    <Assets />
                  </RequireRuntimeSession>
                }
              />
              <Route
                path="/particle-system-playground"
                element={
                  <RequireWorkspaceSession>
                    <ParticleSystemPlayground />
                  </RequireWorkspaceSession>
                }
              />
              <Route
                path="/compare"
                element={<Compare />}
              />
              <Route path="/shader-graph" element={<ShaderGraph />} />
              <Route path="/texture-lab" element={<TextureLab />} />
              <Route
                path="/session"
                element={
                  <RequireRuntimeSession>
                    <SessionPage />
                  </RequireRuntimeSession>
                }
              />

              <Route path="/plugins">
                <Route
                  path=":plugin"
                  element={
                    <RequireRuntimeSession>
                      <Plugins />
                    </RequireRuntimeSession>
                  }
                />
              </Route>
            </Routes>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <CommandCenter />
      <RuntimeInterestBridge />
      <Modals />
    </BrowserRouter>
  );
};
