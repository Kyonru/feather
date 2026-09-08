import React from 'react';
import ReactDOM from 'react-dom/client';
import { createWebHost } from '@feather/host';
import { AppProvider } from '@/providers';
import { ShowcaseApp } from './ShowcaseApp';
import '@/App.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppProvider host={createWebHost()}>
      <ShowcaseApp />
    </AppProvider>
  </React.StrictMode>,
);
