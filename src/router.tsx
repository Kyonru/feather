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
import { SettingsModal } from './pages/settings';
import { useConfigStore } from './store/config';

const Modals = () => {
  const disconnected = useConfigStore((state) => state.disconnected);

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
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 12)',
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <Routes>
            <Route path="/" element={<Logs />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/observability" element={<Observability />} />

            <Route path="/plugins">
              <Route path=":plugin" element={<Plugins />} />
            </Route>
          </Routes>
        </SidebarInset>
      </SidebarProvider>
      <Modals />
    </BrowserRouter>
  );
};
