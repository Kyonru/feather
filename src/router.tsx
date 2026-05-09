import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import { toast } from 'sonner';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
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
              <Route path="/" element={<Logs />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/observability" element={<Observability />} />
              <Route path="/console" element={<Console />} />
              <Route path="/debugger" element={<Debugger />} />
              <Route path="/time-travel" element={<TimeTravel />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/compare" element={<Compare />} />

              <Route path="/plugins">
                <Route path=":plugin" element={<Plugins />} />
              </Route>
            </Routes>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Modals />
    </BrowserRouter>
  );
};
