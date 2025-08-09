import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BrowserRouter, Routes, Route } from "react-router";
import Logs from "./pages/log";
import Performance from "./pages/performance";
import Plugins from "./pages/plugins";

export const Router = () => {
  return (
    <BrowserRouter>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <Routes>
            <Route path="/" element={<Logs />} />
            <Route path="/performance" element={<Performance />} />

            <Route path="/plugins">
              <Route path=":plugin" element={<Plugins />} />
            </Route>
          </Routes>
        </SidebarInset>
      </SidebarProvider>
    </BrowserRouter>
  );
};
