import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { ParticleSystemPlaygroundSystem } from '@/types/particle-system-playground';
import { Trash2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  NAMED_PRESETS,
  type MotionPreset,
  applyValues,
  extractValues,
  loadCustomPresets,
  mixValues,
  randomizeValues,
  saveCustomPresets,
} from '../presets';

type Props = {
  system: ParticleSystemPlaygroundSystem;
  onChange: (key: string, value: string | number | boolean) => void;
};

export function MotionPresets({ system, onChange }: Props) {
  const [open, setOpen] = useState(true);
  const [mixA, setMixA] = useState(NAMED_PRESETS[0].name);
  const [mixB, setMixB] = useState(NAMED_PRESETS[1].name);
  const [customPresets, setCustomPresets] = useState<MotionPreset[]>(loadCustomPresets);
  const [saveName, setSaveName] = useState('');
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const allPresets = [...NAMED_PRESETS, ...customPresets];

  function apply(preset: MotionPreset) {
    applyValues(preset.values, onChange);
  }

  function handleMix() {
    const a = allPresets.find((p) => p.name === mixA);
    const b = allPresets.find((p) => p.name === mixB);
    if (a && b) applyValues(mixValues(a.values, b.values), onChange);
  }

  function handleRandomize() {
    applyValues(randomizeValues(extractValues(system)), onChange);
  }

  function updateCustom(presets: MotionPreset[]) {
    setCustomPresets(presets);
    saveCustomPresets(presets);
  }

  function handleSave() {
    const name = saveName.trim() || `Custom ${customPresets.length + 1}`;
    updateCustom([...customPresets, { name, values: extractValues(system) }]);
    setSaveName('');
  }

  function handleDelete(i: number) {
    updateCustom(customPresets.filter((_, idx) => idx !== i));
  }

  function commitRename(i: number) {
    const name = renameValue.trim();
    if (name) {
      updateCustom(customPresets.map((p, idx) => (idx === i ? { ...p, name } : p)));
    }
    setRenamingIndex(null);
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(customPresets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'particle-system-playground-presets.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const imported = JSON.parse(text) as MotionPreset[];
        if (Array.isArray(imported)) updateCustom([...customPresets, ...imported]);
      } catch {
        return;
      }
    });
    e.target.value = '';
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-3">
        <button
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setOpen((v) => !v)}
        >
          Motion Presets {open ? '▴' : '▾'}
        </button>
        <Separator className="flex-1" />
      </div>

      {open && (
        <div className="grid gap-3">
          {/* Named presets */}
          <div className="grid max-h-44 grid-cols-4 gap-1 overflow-auto pr-1 lg:grid-cols-5">
            {NAMED_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                size="sm"
                className="h-7 px-1 text-[10px]"
                onClick={() => apply(preset)}
                title={preset.description}
              >
                {preset.name}
              </Button>
            ))}
          </div>

          {/* Randomize */}
          <Button variant="secondary" size="sm" className="h-7 text-[10px]" onClick={handleRandomize}>
            Randomize ±20%
          </Button>

          <Separator />

          {/* Mix */}
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Mix Presets</Label>
            <div className="flex items-center gap-1">
              <Select value={mixA} onValueChange={setMixA}>
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allPresets.map((p) => (
                    <SelectItem key={p.name} value={p.name} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="shrink-0 text-[10px] text-muted-foreground">+</span>
              <Select value={mixB} onValueChange={setMixB}>
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allPresets.map((p) => (
                    <SelectItem key={p.name} value={p.name} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" className="h-7 shrink-0 px-3 text-[10px]" onClick={handleMix}>
                Mix
              </Button>
            </div>
          </div>

          <Separator />

          {/* Custom presets */}
          <div className="grid gap-2">
            <Label className="text-[10px] text-muted-foreground">Custom Presets</Label>

            <div className="flex gap-1">
              <Input
                className="h-7 flex-1 text-xs"
                placeholder="Preset name…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <Button variant="secondary" size="sm" className="h-7 shrink-0 px-3 text-[10px]" onClick={handleSave}>
                Save Custom Preset
              </Button>
            </div>

            {customPresets.length > 0 && (
              <div className="grid max-h-40 gap-1 overflow-auto pr-1">
                {customPresets.map((preset, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {renamingIndex === i ? (
                      <>
                        <Input
                          autoFocus
                          className="h-6 flex-1 text-xs"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(i);
                            if (e.key === 'Escape') setRenamingIndex(null);
                          }}
                          onBlur={() => commitRename(i)}
                        />
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 flex-1 justify-start truncate px-2 text-[10px]"
                          onClick={() => apply(preset)}
                          onDoubleClick={() => { setRenamingIndex(i); setRenameValue(preset.name); }}
                          title="Click to apply · Double-click to rename"
                        >
                          {preset.name}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(i)}
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 flex-1 text-[10px]"
                disabled={customPresets.length === 0}
                onClick={handleExport}
              >
                Export JSON
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 flex-1 text-[10px]"
                onClick={() => importRef.current?.click()}
              >
                Import JSON
              </Button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
