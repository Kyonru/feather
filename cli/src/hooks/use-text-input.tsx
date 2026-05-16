import { useInput } from 'ink';
import { useState } from 'react';

type InkKey = Parameters<Parameters<typeof useInput>[0]>[1];

function useTextInput(initial: string) {
  const [value, setValue] = useState(initial);
  const [cursor, setCursor] = useState(initial.length);

  const reset = (next: string) => {
    setValue(next);
    setCursor(next.length);
  };

  const handleKey = (input: string, key: InkKey) => {
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return true;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(value.length, c + 1));
      return true;
    }
    if (key.backspace) {
      if (cursor === 0) return true;
      const pos = cursor;
      setValue((v) => v.slice(0, pos - 1) + v.slice(pos));
      setCursor((c) => c - 1);
      return true;
    }
    if (key.delete) {
      const pos = cursor;
      setValue((v) => v.slice(0, pos) + v.slice(pos + 1));
      return true;
    }
    if (!key.ctrl && !key.meta && input) {
      const pos = cursor;
      setValue((v) => v.slice(0, pos) + input + v.slice(pos));
      setCursor((c) => c + 1);
      return true;
    }
    return false;
  };

  return {
    value,
    cursor,
    reset,
    handleKey,
    before: value.slice(0, cursor),
    at: value[cursor] ?? '',
    after: value.slice(cursor + 1),
  };
}

export { useTextInput };
