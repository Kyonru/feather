import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Input } from '@/components/ui/input';

type Props = Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange' | 'onBlur' | 'min' | 'max'> & {
  value: number | undefined;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
};

function formatValue(value: number | undefined): string {
  return Number.isFinite(value) ? String(value) : '';
}

function isTransientNumber(value: string): boolean {
  return value === '' || value === '-' || value === '+' || value === '.' || value === '-.' || value === '+.';
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}

export function ShaderNumberInput({ value, onValueChange, min, max, onFocus, className, ...props }: Props) {
  const externalValue = useMemo(() => formatValue(value), [value]);
  const [text, setText] = useState(externalValue);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(externalValue);
  }, [externalValue, focused]);

  return (
    <Input
      {...props}
      className={className}
      type="number"
      min={min}
      max={max}
      value={text}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onChange={(event) => {
        const nextText = event.target.value;
        setText(nextText);
        if (isTransientNumber(nextText)) return;
        const nextValue = Number(nextText);
        if (Number.isFinite(nextValue)) onValueChange(nextValue);
      }}
      onBlur={() => {
        setFocused(false);
        if (isTransientNumber(text)) {
          setText(externalValue);
          return;
        }
        const parsed = Number(text);
        if (!Number.isFinite(parsed)) {
          setText(externalValue);
          return;
        }
        const nextValue = clamp(parsed, min, max);
        setText(formatValue(nextValue));
        if (nextValue !== value) onValueChange(nextValue);
      }}
    />
  );
}
