import type { ConsoleSnippet } from '@/store/console-history';

export const BUILT_IN_SNIPPETS: Array<Pick<ConsoleSnippet, 'id' | 'name' | 'code'>> = [
  {
    id: 'builtin-graphics-stats',
    name: 'Graphics stats',
    code: 'return love.graphics.getStats()',
  },
  {
    id: 'builtin-memory',
    name: 'Memory usage',
    code: 'return collectgarbage("count") .. " KB"',
  },
  {
    id: 'builtin-frame',
    name: 'FPS / frame time',
    code: 'return { fps = love.timer.getFPS(), dt = love.timer.getDelta() }',
  },
  {
    id: 'builtin-window',
    name: 'Window size',
    code: 'return { width = love.graphics.getWidth(), height = love.graphics.getHeight() }',
  },
];
