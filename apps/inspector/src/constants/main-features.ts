export const MAIN_FEATURES = [
  { id: 'logs', title: 'Logs', url: '/' },
  { id: 'performance', title: 'Performance', url: '/performance' },
  { id: 'observability', title: 'Observability', url: '/observability' },
  { id: 'debugger', title: 'Debugger', url: '/debugger' },
  { id: 'console', title: 'Console', url: '/console' },
  { id: 'particle-system-playground', title: 'Particles Playground', url: '/particle-system-playground' },
  { id: 'shader-graph', title: 'Shader Graph', url: '/shader-graph' },
  { id: 'texture-lab', title: 'Texture Lab', url: '/texture-lab' },
  { id: 'assets', title: 'Assets', url: '/assets' },
  { id: 'time-travel', title: 'Time Travel', url: '/time-travel' },
  { id: 'session-replay', title: 'Session Replay', url: '/session-replay' },
  { id: 'compare', title: 'Compare', url: '/compare' },
] as const;

export type MainFeatureId = (typeof MAIN_FEATURES)[number]['id'];
export type SidebarToolId = MainFeatureId | 'session';

export const DEFAULT_PINNED_SIDEBAR_TOOLS: SidebarToolId[] = ['logs', 'performance', 'session'];

export const SIDEBAR_TOOL_ORDER: SidebarToolId[] = [
  'logs',
  'performance',
  'session',
  'compare',
  'observability',
  'debugger',
  'console',
  'assets',
  'particle-system-playground',
  'shader-graph',
  'texture-lab',
  'time-travel',
  'session-replay',
];
