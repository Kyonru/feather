import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useShaderGraphStore } from '@/store/shader-graph';
import type { ShaderParameter } from '@/types/shader-graph';
import { CodePreview } from './CodePreview';
import { NodeInspector } from './NodeInspector';
import { ShaderControlsPanel } from './ShaderControlsPanel';
import { TemplateControlsPanel } from './TemplateControlsPanel';

type PreviewParams = {
  shape: string;
  color: string;
  baseTexture: { filename: string; dataBase64: string } | null;
  parameters: ShaderParameter[];
  textures: { filename: string; dataBase64: string; uniform: string }[];
  previewZoom: number;
};

type Props = {
  standalone?: boolean;
  onPreviewParamsChange?: (params: PreviewParams) => void;
};

export function ShaderRightPanel({ standalone, onPreviewParamsChange }: Props) {
  const tab = useShaderGraphStore((state) => state.rightPanelTab);
  const setTab = useShaderGraphStore((state) => state.setRightPanelTab);
  const handleTabChange = (value: string) => {
    if (value === 'controls' || value === 'selection' || value === 'output') setTab(value);
  };

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="h-full min-h-0 gap-0" data-testid="shader-right-panel">
      <div className="shrink-0 border-b px-3 py-2">
        <TabsList className="h-8 w-full rounded-md">
          <TabsTrigger value="controls" className="text-xs">
            Controls
          </TabsTrigger>
          <TabsTrigger value="selection" className="text-xs">
            Selection
          </TabsTrigger>
          <TabsTrigger value="output" className="text-xs">
            Output
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="controls" className="min-h-0 overflow-hidden" data-testid="shader-right-panel-controls">
        <ScrollArea className="h-full min-h-0">
          <TemplateControlsPanel />
          <ShaderControlsPanel onFocusSelection={() => setTab('selection')} />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="selection" className="min-h-0 overflow-hidden" data-testid="shader-right-panel-selection">
        <ScrollArea className="h-full min-h-0">
          <NodeInspector />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="output" className="min-h-0 overflow-hidden" data-testid="shader-right-panel-output">
        <CodePreview standalone={standalone} onPreviewParamsChange={onPreviewParamsChange} />
      </TabsContent>
    </Tabs>
  );
}
