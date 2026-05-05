import { useState } from 'react';
import { PageLayout } from '@/components/page-layout';
import { SectionCards } from './section-cards';
import { useObservability } from '@/hooks/use-observability';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, CopyButton } from '@/components/ui/button';
import { LuaBlock } from '@/components/code';
import { Separator } from '@/components/ui/separator';
import { useConfig } from '@/hooks/use-config';

export function ObserveSidePanel({
  data,
  onClose,
}: {
  onClose: (o: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}) {
  return (
    <Card className="w-[600px] rounded-none rounded-br-xl">
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>{data.key}</CardTitle>
        </div>
        <div>
          <Button onClick={() => onClose(false)} variant="secondary">
            Dismiss
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Value</span>

            <CopyButton value={data.value} />
          </div>
          <LuaBlock className="max-h-[100%]" code={data.value} showLineNumbers={false} />
        </div>

        <Separator />
      </CardContent>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Type</span>
          </div>
          <LuaBlock className="max-h-[100%]" code={data.type} showLineNumbers={false} />
        </div>

        <Separator />
      </CardContent>
    </Card>
  );
}

export default function Page() {
  const { data } = useObservability();
  const [selected, setSelected] = useState<string | null>(null);

  const onSelect = (key: string) => {
    setSelected(key);
  };

  const onClose = () => {
    setSelected(null);
  };

  useConfig();

  if (data.length === 0) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-16 text-center">
          <div className="grid gap-1">
            <p className="text-lg font-semibold">No observers yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Call <code className="font-mono">DEBUGGER:observe()</code> anywhere in your game loop to watch values in
              real time.
            </p>
          </div>
          <LuaBlock
            className="w-full max-w-lg text-left"
            showLineNumbers={false}
            code={`-- Call this each frame (or whenever the value changes)
function love.update(dt)
  DEBUGGER:observe("player.x", player.x)
  DEBUGGER:observe("player.y", player.y)
  DEBUGGER:observe("health", player.health)
  DEBUGGER:observe("state", player.state)
end`}
          />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      right={selected && <ObserveSidePanel data={data.find((item) => item.key === selected) || {}} onClose={onClose} />}
    >
      <SectionCards data={data} selected={selected} onSelect={onSelect} />
    </PageLayout>
  );
}
