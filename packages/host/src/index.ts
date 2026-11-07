// Safe in every environment. `createTauriHost` deliberately lives at
// `@feather/host/tauri` so a web build never pulls `@tauri-apps/*` into its bundle.
export { createWebHost } from './web';
export { HostProvider, useHost } from './context';

export type {
  FeatherHost,
  HostBinaryFile,
  HostTextFile,
  OpenOptions,
  SaveTextOptions,
} from './types';
