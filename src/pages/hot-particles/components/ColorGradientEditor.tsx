import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

type Stop = { r: number; g: number; b: number; a: number };

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function parse(value: string): Stop[] {
  const nums = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter(Number.isFinite)
    .map(clamp);
  const stops: Stop[] = [];
  for (let i = 0; i + 3 < nums.length; i += 4) {
    stops.push({ r: nums[i], g: nums[i + 1], b: nums[i + 2], a: nums[i + 3] });
  }
  return stops.length ? stops : [{ r: 1, g: 1, b: 1, a: 1 }];
}

function serialize(stops: Stop[]) {
  return stops.flatMap((stop) => [stop.r, stop.g, stop.b, stop.a].map((value) => clamp(value).toFixed(3))).join(', ');
}

function hex(stop: Stop) {
  const part = (value: number) =>
    Math.round(clamp(value) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(stop.r)}${part(stop.g)}${part(stop.b)}`;
}

function fromHex(value: string) {
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const int = Number.parseInt(match[1], 16);
  return { r: ((int >> 16) & 255) / 255, g: ((int >> 8) & 255) / 255, b: (int & 255) / 255 };
}

export function ColorGradientEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const stops = parse(value);
  const [selected, setSelected] = useState(0);
  const stop = stops[Math.min(selected, stops.length - 1)];

  const update = (index: number, patch: Partial<Stop>) => {
    onChange(serialize(stops.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))));
  };

  return (
    <div className="grid gap-2">
      <div className="flex h-7 overflow-hidden rounded border">
        {stops.map((item, index) => (
          <button
            key={index}
            className="min-w-6 flex-1"
            style={{
              background: `rgba(${item.r * 255}, ${item.g * 255}, ${item.b * 255}, ${item.a})`,
              boxShadow: selected === index ? 'inset 0 0 0 2px currentColor' : undefined,
            }}
            onClick={() => setSelected(index)}
          />
        ))}
      </div>
      <div className="grid grid-cols-[auto_1fr_6rem_auto] items-end gap-2">
        <div className="grid gap-1">
          <Label className="text-[10px]">Color</Label>
          <input
            className="size-8 rounded border bg-transparent p-1"
            type="color"
            value={hex(stop)}
            onChange={(event) => {
              const color = fromHex(event.target.value);
              if (color) update(selected, color);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px]">Hex</Label>
          <Input
            className="h-8 font-mono text-xs"
            value={hex(stop)}
            onChange={(event) => {
              const color = fromHex(event.target.value);
              if (color) update(selected, color);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-[10px]">Alpha</Label>
          <Input
            className="h-8 text-xs"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={stop.a}
            onChange={(event) => update(selected, { a: clamp(Number(event.target.value)) })}
          />
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            disabled={stops.length >= 8}
            onClick={() => {
              onChange(serialize([...stops, { ...stop }]));
              setSelected(stops.length);
            }}
          >
            <PlusIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            disabled={stops.length <= 1}
            onClick={() => {
              onChange(serialize(stops.filter((_, index) => index !== selected)));
              setSelected(Math.max(0, selected - 1));
            }}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
