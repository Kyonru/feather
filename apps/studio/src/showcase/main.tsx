import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from '@studio/showcase/providers';
import { ShowcaseApp } from './ShowcaseApp';
import '@studio/showcase/showcase-app.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppProvider>
      <ShowcaseApp />
    </AppProvider>
  </React.StrictMode>,
);
