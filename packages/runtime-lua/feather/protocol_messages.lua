-- GENERATED FILE — do not edit by hand.
--
-- Source: packages/protocol/src/messages.ts
-- Regenerate: npm run generate:protocol-lua
-- Verified by: npm run check:protocol
--
-- The set of messages the desktop app may send to the game. Used by
-- Feather:__handleCommand to notice a command from a desktop app newer than
-- this runtime, instead of silently ignoring it.

return {
  ["auth:challenge"] = true,
  ["auth:fail"] = true,
  ["auth:ok"] = true,
  ["cmd:assets:preview"] = true,
  ["cmd:assets:toggle"] = true,
  ["cmd:config"] = true,
  ["cmd:console:inspect_result"] = true,
  ["cmd:console:pin"] = true,
  ["cmd:console:unpin"] = true,
  ["cmd:debugger:continue"] = true,
  ["cmd:debugger:disable"] = true,
  ["cmd:debugger:enable"] = true,
  ["cmd:debugger:inspect_frame"] = true,
  ["cmd:debugger:set_breakpoints"] = true,
  ["cmd:debugger:set_options"] = true,
  ["cmd:debugger:set_profiler_probes"] = true,
  ["cmd:debugger:step_into"] = true,
  ["cmd:debugger:step_out"] = true,
  ["cmd:debugger:step_over"] = true,
  ["cmd:eval"] = true,
  ["cmd:hot_reload:module"] = true,
  ["cmd:hot_reload:restore"] = true,
  ["cmd:log"] = true,
  ["cmd:plugin:action"] = true,
  ["cmd:plugin:action:cancel"] = true,
  ["cmd:plugin:params"] = true,
  ["cmd:plugin:set_enabled"] = true,
  ["cmd:plugin:toggle"] = true,
  ["cmd:plugins:disable_all"] = true,
  ["cmd:profiler"] = true,
  ["cmd:runtime"] = true,
  ["cmd:runtime:interest"] = true,
  ["cmd:time_travel:request_frames"] = true,
  ["cmd:time_travel:start"] = true,
  ["cmd:time_travel:stop"] = true,
  ["req:assets"] = true,
  ["req:config"] = true,
  ["req:console:globals"] = true,
  ["req:console:pins"] = true,
  ["req:hot_reload:state"] = true,
  ["req:hot_reload:validate"] = true,
  ["req:observers"] = true,
  ["req:performance"] = true,
  ["req:plugins"] = true,
}
