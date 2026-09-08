/**
 * The Feather wire protocol message registry.
 *
 * This is the single source of truth for which messages exist. Before this
 * package the message set lived only as string literals scattered across
 * TypeScript, Lua, and Rust, and nothing could tell you whether the desktop app
 * handled a message the runtime never sent, or vice versa.
 *
 * `npm run check:protocol` verifies that this registry and the two live
 * dispatch tables agree:
 *
 *   - TO_GAME     <-> `Feather:__handleCommand` in `src-lua/feather/init.lua`
 *   - TO_DESKTOP  <-> the `switch` in `src/hooks/use-ws-connection.ts`
 *
 * Adding a message means adding it here first. The check fails otherwise.
 *
 * Payload shapes are NOT described yet — see V2.md Phase 02b. This registry
 * covers the message set only, which is what makes drift detectable.
 */

/** Messages the desktop app sends to the running game. */
export const TO_GAME = [
  'auth:challenge',
  'auth:fail',
  'auth:ok',

  'cmd:assets:preview',
  'cmd:assets:toggle',
  'cmd:config',
  'cmd:console:inspect_result',
  'cmd:console:pin',
  'cmd:console:unpin',
  'cmd:debugger:continue',
  'cmd:debugger:disable',
  'cmd:debugger:enable',
  'cmd:debugger:inspect_frame',
  'cmd:debugger:set_breakpoints',
  'cmd:debugger:set_options',
  'cmd:debugger:set_profiler_probes',
  'cmd:debugger:step_into',
  'cmd:debugger:step_out',
  'cmd:debugger:step_over',
  'cmd:eval',
  'cmd:hot_reload:module',
  'cmd:hot_reload:restore',
  'cmd:log',
  'cmd:plugin:action',
  'cmd:plugin:action:cancel',
  'cmd:plugin:params',
  'cmd:plugin:set_enabled',
  'cmd:plugin:toggle',
  'cmd:plugins:disable_all',
  'cmd:profiler',
  'cmd:runtime',
  'cmd:runtime:interest',
  'cmd:time_travel:request_frames',
  'cmd:time_travel:start',
  'cmd:time_travel:stop',

  'req:assets',
  'req:config',
  'req:console:globals',
  'req:console:pins',
  'req:hot_reload:state',
  'req:hot_reload:validate',
  'req:observers',
  'req:performance',
  'req:plugins',
] as const;

/** Messages the running game sends to the desktop app. */
export const TO_DESKTOP = [
  'assets',
  'assets:error',

  'auth:error',
  'auth:response',

  'console:enabled',
  'console:globals',
  'console:inspect_result',
  'console:pins',

  'debugger:breakpoint_error',
  'debugger:frame',
  'debugger:paused',
  'debugger:resumed',
  'debugger:status',

  'eval:response',

  'feather:bye',
  'feather:hello',

  'hot_reload:result',
  'hot_reload:state',

  'log',
  'log:update',

  'logs',

  'observe',

  'performance',

  'plugin',
  'plugin:action:response',

  'profiler',
  'profiler:error',

  'runtime:suspended',

  'session_replay:error',
  'session_replay:list',
  'session_replay:recording',
  'session_replay:status',

  'time_travel:frames',
  'time_travel:status',
] as const;

export type ToGameMessage = (typeof TO_GAME)[number];
export type ToDesktopMessage = (typeof TO_DESKTOP)[number];
export type FeatherMessage = ToGameMessage | ToDesktopMessage;

export const ALL_MESSAGES: readonly FeatherMessage[] = [...TO_GAME, ...TO_DESKTOP];

const TO_GAME_SET: ReadonlySet<string> = new Set(TO_GAME);
const TO_DESKTOP_SET: ReadonlySet<string> = new Set(TO_DESKTOP);

export function isToGameMessage(type: string): type is ToGameMessage {
  return TO_GAME_SET.has(type);
}

export function isToDesktopMessage(type: string): type is ToDesktopMessage {
  return TO_DESKTOP_SET.has(type);
}
