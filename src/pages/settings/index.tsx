import { useState } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { useSettingsStore } from '@/store/settings';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useConfig } from '@/hooks/use-config';
import { useConfigStore } from '@/store/config';
import { MobileConnection } from '@/components/mobile-connection';
import { EyeIcon, EyeOffIcon, MonitorIcon, NetworkIcon, ShieldIcon, CodeIcon, ActivityIcon, FolderIcon } from 'lucide-react';

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="grid gap-4 pl-4">{children}</div>
    </div>
  );
}

function FieldDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground -mt-2">{children}</p>;
}

function ThemeToggle() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  return (
    <div className="grid gap-2">
      <Label>App Theme</Label>
      <ToggleGroup
        type="single"
        value={theme}
        onValueChange={(value: 'dark' | 'light' | 'system') => {
          if (value && (value === 'system' || value === 'light' || value === 'dark')) {
            setTheme(value);
          }
        }}
        className="justify-start"
      >
        <ToggleGroupItem value="light">Light</ToggleGroupItem>
        <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
        <ToggleGroupItem value="system">System</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

function PortInput() {
  const port = useSettingsStore((state) => state.port);
  const setPort = useSettingsStore((state) => state.setPort);
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-port">WebSocket Port</Label>
      <Input
        id="setting-port"
        type="number"
        min="1"
        max="65535"
        value={port}
        onChange={(e) => {
          if (e.target.value) setPort(parseInt(e.target.value));
        }}
      />
      <FieldDescription>Port the desktop app listens on. Games connect to this port (default: 4004).</FieldDescription>
    </div>
  );
}

function ConnectionTimeoutInput() {
  const timeout = useSettingsStore((state) => state.connectionTimeout);
  const setConnectionTimeout = useSettingsStore((state) => state.setConnectionTimeout);
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-timeout">Connection Timeout (seconds)</Label>
      <Input
        id="setting-timeout"
        type="number"
        min="1"
        max="120"
        value={timeout}
        onChange={(e) => {
          if (e.target.value) setConnectionTimeout(parseInt(e.target.value));
        }}
      />
      <FieldDescription>
        Seconds without a message before a session is considered disconnected (default: 15).
      </FieldDescription>
    </div>
  );
}

function SampleRateInput() {
  const sampleRate = useConfigStore((state) => state.config?.sampleRate);
  const { updateSampleRate } = useConfig();
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-sample-rate">Sample Rate (seconds)</Label>
      <Input
        id="setting-sample-rate"
        type="number"
        min={1}
        max={100}
        value={sampleRate}
        onChange={(e) => {
          if (e.target.value) updateSampleRate(e.target.value as unknown as number);
        }}
      />
      <FieldDescription>
        How often the game pushes performance, observers, and plugin data. Requires an active session.
      </FieldDescription>
    </div>
  );
}

function ApiKeyInput() {
  const apiKey = useSettingsStore((state) => state.apiKey);
  const setApiKey = useSettingsStore((state) => state.setApiKey);
  const [visible, setVisible] = useState(false);
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-api-key">API Key</Label>
      <div className="relative">
        <Input
          id="setting-api-key"
          type={visible ? 'text' : 'password'}
          value={apiKey}
          placeholder="Leave empty to disable auth"
          onChange={(e) => setApiKey(e.target.value)}
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={visible ? 'Hide API key' : 'Show API key'}
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
      <FieldDescription>
        Must match the <code className="font-mono">apiKey</code> in your game's Feather config. Required for the Console
        plugin.
      </FieldDescription>
    </div>
  );
}

function AssetSourceDirInput() {
  const assetSourceDir    = useSettingsStore((state) => state.assetSourceDir);
  const setAssetSourceDir = useSettingsStore((state) => state.setAssetSourceDir);
  const autoSourceDir     = useConfigStore((state)   => state.config?.sourceDir ?? '');
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-asset-source-dir">Asset Source Directory</Label>
      <div className="relative">
        <FolderIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          id="setting-asset-source-dir"
          value={assetSourceDir}
          placeholder={autoSourceDir || '/path/to/game/assets'}
          onChange={(e) => setAssetSourceDir(e.target.value)}
          className="font-mono text-sm pl-9"
        />
      </div>
      <FieldDescription>
        Override where the desktop looks for game asset files when previewing textures and fonts.
        Leave empty to use the source directory reported by the game ({autoSourceDir || 'not connected'}).
        Set this manually when the game runs on a different machine.
      </FieldDescription>
    </div>
  );
}

function TextEditorInput() {
  const textEditorPath = useSettingsStore((state) => state.textEditorPath);
  const setTextEditorPath = useSettingsStore((state) => state.setTextEditorPath);
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-editor">Editor Executable Path</Label>
      <Input
        id="setting-editor"
        value={textEditorPath}
        placeholder="/usr/local/bin/code"
        onChange={(e) => {
          if (e.target.value) setTextEditorPath(e.target.value);
        }}
        className="font-mono text-sm"
      />
      <FieldDescription>
        Used to open log file locations from the desktop. Common values:{' '}
        <code className="font-mono">/usr/local/bin/code</code>, <code className="font-mono">/usr/bin/vim</code>.
      </FieldDescription>
    </div>
  );
}

export function SettingsModal() {
  const open = useSettingsStore((state) => state.open);
  const setOpen = useSettingsStore((state) => state.setOpen);
  const reset = useSettingsStore((state) => state.reset);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[50vw] sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes are applied immediately and persisted automatically.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-2">
          <Section icon={MonitorIcon} title="Appearance">
            <ThemeToggle />
          </Section>

          <Separator />

          <Section icon={NetworkIcon} title="Connection">
            <PortInput />
            <ConnectionTimeoutInput />
            <SampleRateInput />
            <MobileConnection />
          </Section>

          <Separator />

          <Section icon={ShieldIcon} title="Security">
            <ApiKeyInput />
          </Section>

          <Separator />

          <Section icon={CodeIcon} title="Editor">
            <TextEditorInput />
          </Section>

          <Separator />

          <Section icon={FolderIcon} title="Assets">
            <AssetSourceDirInput />
          </Section>
        </div>

        <DialogFooter className="gap-2 pt-8">
          <Button variant="outline" onClick={reset} className="mr-auto">
            <ActivityIcon className="size-4" />
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
