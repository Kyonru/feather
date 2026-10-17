import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './providers';
import { ShowcaseApp } from './ShowcaseApp';

/**
 * Studio's public web entry.
 *
 * The showcase shell imports this; Studio owns what it renders. Keeping the
 * mount here rather than in the shell is what makes the shell genuinely thin —
 * it carries no page code of its own.
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppProvider>
      <ShowcaseApp />
    </AppProvider>
  </React.StrictMode>,
);
