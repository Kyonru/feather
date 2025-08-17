import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettingsStore } from '@/store/settings';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const ToggleTheme = () => {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  return (
    <div className="grid gap-3">
      <Label htmlFor="app-theme-1">App Theme</Label>
      <ToggleGroup
        id="app-theme-1"
        type="single"
        value={theme}
        onValueChange={(value: 'dark' | 'light' | 'system') => {
          if (value && (value === 'system' || value === 'light' || value === 'dark')) {
            setTheme(value);
          }
        }}
      >
        <ToggleGroupItem value="dark" aria-label="Toggle bold">
          <Label className="h-4">Dark</Label>
        </ToggleGroupItem>
        <ToggleGroupItem value="light" aria-label="Toggle italic">
          <Label className="h-4">Light</Label>
        </ToggleGroupItem>
        <ToggleGroupItem value="system" aria-label="Toggle strikethrough">
          <Label className="h-4">System</Label>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
};

const PortInput = () => {
  const port = useSettingsStore((state) => state.port);
  const setPort = useSettingsStore((state) => state.setPort);
  const host = useSettingsStore((state) => state.host);
  const setHost = useSettingsStore((state) => state.setHost);

  return (
    <>
      <div className="grid gap-3">
        <Label htmlFor="host-1">Host</Label>
        <Input
          id="host-1"
          name="host"
          value={host}
          onChange={(e) => {
            const value = e.target.value;
            setHost(value);
          }}
        />
      </div>
      <div className="grid gap-3">
        <Label htmlFor="port-1">Port</Label>
        <Input
          id="port-1"
          name="port"
          type="number"
          min="1"
          max="65535"
          value={port}
          onChange={(e) => {
            const value = e.target.value;
            if (value) {
              setPort(parseInt(value));
            }
          }}
        />
      </div>
    </>
  );
};

const TextEditorInput = () => {
  const textEditorPath = useSettingsStore((state) => state.textEditorPath);
  const setTextEditorPath = useSettingsStore((state) => state.setTextEditorPath);

  return (
    <div className="grid gap-3">
      <Label htmlFor="text-editor-1">Text Editor</Label>
      <Input
        id="text-editor-1"
        name="text-editor"
        value={textEditorPath}
        onChange={(e) => {
          const value = e.target.value;
          if (value) {
            setTextEditorPath(value);
          }
        }}
      />
    </div>
  );
};

export function SettingsModal() {
  const open = useSettingsStore((state) => state.open);
  const setOpen = useSettingsStore((state) => state.setOpen);
  const reset = useSettingsStore((state) => state.reset);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>All settings are saved on update and will be instantly applied.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <ToggleTheme />
          <PortInput />
          <TextEditorInput />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={reset}>
            Reset to defaults
          </Button>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
