import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import { toast } from 'sonner';
import { MonitorIcon, SettingsIcon } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
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
import Compare from './pages/compare';
import Assets from './pages/assets';
import { SettingsModal } from './pages/settings';
import { useConfigStore } from './store/config';
import { AboutModal } from './pages/about';
import { useWsConnection } from './hooks/use-ws-connection';
import { useSessionStore } from './store/session';
import { useSettingsStore } from './store/settings';

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

function SessionEmptyState() {
  const sessions = useSessionStore((state) => state.sessions);
  const setSettingsOpen = useSettingsStore((state) => state.setOpen);
  const hasSessions = Object.keys(sessions).length > 0;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center">
      <div className="flex max-w-md flex-col items-center gap-4">
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
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon className="size-3.5" />
            Open Settings
          </Button>
        )}
      </div>
    </div>
  );
}

function RequireSession({ children }: { children: React.ReactNode }) {
  const sessionId = useSessionStore((state) => state.sessionId);
  return sessionId ? children : <SessionEmptyState />;
}

export const Router = () => {
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
                  <RequireSession>
                    <Logs />
                  </RequireSession>
                }
              />
              <Route
                path="/performance"
                element={
                  <RequireSession>
                    <Performance />
                  </RequireSession>
                }
              />
              <Route
                path="/observability"
                element={
                  <RequireSession>
                    <Observability />
                  </RequireSession>
                }
              />
              <Route
                path="/console"
                element={
                  <RequireSession>
                    <Console />
                  </RequireSession>
                }
              />
              <Route
                path="/debugger"
                element={
                  <RequireSession>
                    <Debugger />
                  </RequireSession>
                }
              />
              <Route
                path="/time-travel"
                element={
                  <RequireSession>
                    <TimeTravel />
                  </RequireSession>
                }
              />
              <Route
                path="/assets"
                element={
                  <RequireSession>
                    <Assets />
                  </RequireSession>
                }
              />
              <Route
                path="/compare"
                element={
                  <RequireSession>
                    <Compare />
                  </RequireSession>
                }
              />

              <Route path="/plugins">
                <Route
                  path=":plugin"
                  element={
                    <RequireSession>
                      <Plugins />
                    </RequireSession>
                  }
                />
              </Route>
            </Routes>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Modals />
    </BrowserRouter>
  );
};
