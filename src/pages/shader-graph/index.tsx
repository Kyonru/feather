import { ReactFlowProvider } from '@xyflow/react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NodePalette } from './NodePalette';
import { ShaderCanvas } from './ShaderCanvas';
import { NodeInspector } from './NodeInspector';
import { CodePreview } from './CodePreview';

export default function ShaderGraph() {
  return (
    <ReactFlowProvider>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 max-h-[92vh]">
        <ResizablePanel defaultSize="16%" minSize="12%" maxSize="25%" className="flex flex-col border-r">
          <div className="border-b px-3 py-2 shrink-0">
            <span className="text-sm font-semibold">Nodes</span>
          </div>
          <NodePalette />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="57%" minSize="30%" className="min-w-0 overflow-hidden">
          <ShaderCanvas />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="27%" minSize="18%" maxSize="40%" className="flex flex-col border-l">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="35%" minSize="20%" className="flex flex-col overflow-hidden">
              <div className="border-b px-3 py-2 shrink-0">
                <span className="text-sm font-semibold">Inspector</span>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <NodeInspector />
              </ScrollArea>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize="65%" minSize="30%" className="flex flex-col overflow-hidden">
              <CodePreview />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </ReactFlowProvider>
  );
}
