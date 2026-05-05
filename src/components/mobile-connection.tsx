import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/store/settings';
import { CheckIcon, CopyIcon, SmartphoneIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

type LocalIp = {
  ip: string;
  name: string;
};

export function MobileConnection() {
  const port = useSettingsStore((state) => state.port);
  const [ips, setIps] = useState<LocalIp[]>([]);
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [manualIp, setManualIp] = useState('');
  const [copied, setCopied] = useState(false);
  const [isTauri, setIsTauri] = useState(true);

  useEffect(() => {
    invoke<LocalIp[]>('get_local_ips')
      .then((result) => {
        setIps(result);
        if (result.length > 0) {
          setSelectedIp(result[0].ip);
        }
      })
      .catch(() => {
        setIsTauri(false);
      });
  }, []);

  const activeIp = isTauri ? selectedIp : manualIp;
  const wsUrl = activeIp ? `ws://${activeIp}:${port}` : '';

  const handleCopy = useCallback(() => {
    if (!wsUrl) return;
    navigator.clipboard.writeText(wsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [wsUrl]);

  const luaSnippet = activeIp ? `require("feather.auto").setup({\n  host = "${activeIp}",\n  port = ${port},\n})` : '';

  return (
    <>
      <Separator />
      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <SmartphoneIcon className="h-4 w-4" />
          <Label className="text-base font-semibold">Mobile Connection</Label>
        </div>
        <p className="text-sm text-muted-foreground">Use the connection string in your game&apos;s Feather config.</p>

        {isTauri && ips.length > 1 && (
          <div className="grid gap-1.5">
            <Label htmlFor="ip-select">Network Interface</Label>
            <Select value={selectedIp} onValueChange={setSelectedIp}>
              <SelectTrigger id="ip-select">
                <SelectValue placeholder="Select IP" />
              </SelectTrigger>
              <SelectContent>
                {ips.map((ip) => (
                  <SelectItem key={ip.ip} value={ip.ip}>
                    {ip.ip} ({ip.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isTauri && ips.length === 1 && (
          <div className="grid gap-1.5">
            <Label>Detected IP</Label>
            <p className="text-sm font-mono">
              {ips[0].ip} ({ips[0].name})
            </p>
          </div>
        )}

        {!isTauri && (
          <div className="grid gap-1.5">
            <Label htmlFor="manual-ip">Your Local IP</Label>
            <Input
              id="manual-ip"
              placeholder="192.168.1.50"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
            />
          </div>
        )}

        {wsUrl && (
          <div className="flex flex-col items-center gap-3 rounded-md border p-4">
            <div className="flex items-center gap-2 w-full">
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono text-center truncate">{wsUrl}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopy}>
                {copied ? <CheckIcon className="h-3.5 w-3.5 text-green-600" /> : <CopyIcon className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}

        {luaSnippet && (
          <div className="flex flex-col items-center gap-3 rounded-md border p-4">
            <div className="grid gap-1.5">
              <Label>Lua Config</Label>
              <pre className="rounded bg-muted px-3 py-2 text-xs font-mono whitespace-pre overflow-x-auto">
                {luaSnippet}
              </pre>
            </div>
          </div>
        )}

        {isTauri && ips.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No network interfaces detected. Make sure you&apos;re connected to a network.
          </p>
        )}
      </div>
    </>
  );
}
