import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from '@/providers';
import { ShowcaseApp } from './ShowcaseApp';
import '@/App.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppProvider>
      <ShowcaseApp />
    </AppProvider>
  </React.StrictMode>,
);
