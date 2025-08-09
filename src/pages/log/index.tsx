import { ColumnDef } from "@tanstack/react-table";
import SyntaxHighlighter from "react-syntax-highlighter";
import { BadgeType, DataTable } from "@/components/data-table";
import { PageLayout } from "@/components/page-layout";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import oneLight from "@/assets/theme/light";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckIcon, ClipboardIcon } from "lucide-react";
import { useConfig } from "@/hooks/use-config";
import { Log, useLogs } from "@/hooks/use-logs";

export const columns: ColumnDef<{}>[] = [
  {
    accessorKey: "count",
    header: "Count",
  },
  {
    accessorKey: "type",
    header: "Type",
  },
  {
    accessorKey: "str",
    header: () => "Log",
    cell: (info) => info.getValue() as string,
    size: 250,
    maxSize: 250,
  },
  {
    accessorKey: "time",
    header: "Timestamp",
  },
];

export function TraceBlock({
  code,
  basePath,
}: {
  code: string;
  basePath: string;
}) {
  return (
    <ScrollArea className="mt-2 h-52 rounded border bg-muted p-2 font-mono text-xs">
      <TraceViewer basePath={basePath} trace={code} />
    </ScrollArea>
  );
}

export function LuaBlock({ code }: { code: string }) {
  return (
    <ScrollArea className="mt-2 w-full rounded border bg-muted p-2 font-mono text-xs">
      <div className="max-h-64">
        <SyntaxHighlighter
          wrapLines
          language="lua"
          // @ts-ignore
          style={oneLight}
          showLineNumbers
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </ScrollArea>
  );
}

export function TraceViewer({
  onFileClick,
  trace,
  basePath,
}: {
  onFileClick?: (file: string, line?: number) => void;
  trace: string;
  basePath: string;
}) {
  const highlightLine = (line: string, index: number) => {
    // Clickable file:line pattern
    const filePattern = /([\w./\\-]+\.lua):(\d+)/g;
    // "in function"
    const inFunctionPattern = /\bin function\b/g;
    // 'functionName'
    const quotedPattern = /'([^']+)'/g;

    let html = line
      .replace(
        filePattern,
        (_, file, lineNum) =>
          `<a href="vscode://file/${basePath}/${file}:${lineNum}" class="text-blue-500 underline">${file}:${lineNum}</a>`
      )
      .replace(
        inFunctionPattern,
        `<span class="text-purple-500 font-medium">in function</span>`
      )
      .replace(quotedPattern, `<span class="text-green-500">'$1'</span>`);

    return (
      <div
        key={index}
        className="whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === "A" && target.dataset.file) {
            e.preventDefault();
            onFileClick?.(
              target.dataset.file,
              target.dataset.line ? parseInt(target.dataset.line) : undefined
            );
          }
        }}
      />
    );
  };

  return (
    <div className="font-mono text-xs space-y-1">
      {trace.split("\n").map(highlightLine)}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [hasCopied, setHasCopied] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-slot="copy-button"
          onClick={() => {
            copyToClipboardWithMeta(value);
            setHasCopied(true);
            setTimeout(() => {
              setHasCopied(false);
            }, 2000);
          }}
        >
          <span>{hasCopied ? "Copied" : "Copy"}</span>
          {hasCopied ? <CheckIcon /> : <ClipboardIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {hasCopied ? "Copied" : "Copy to Clipboard"}
      </TooltipContent>
    </Tooltip>
  );
}

export function copyToClipboardWithMeta(value: string) {
  navigator.clipboard.writeText(value);
}

export function LogSidePanel({
  data,
  basePath,
  onClose,
}: {
  onClose: (o: boolean) => void;
  basePath: string;
  data: Log;
}) {
  const trace = data.type === "error" ? data.str : data.trace;
  const isFeatherEvent =
    data.type === "feather:finish" || data.type === "feather:start";

  return (
    <Card className="w-[420px] rounded-none rounded-br-xl">
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>Log Details</CardTitle>
          <CardDescription>ID: {data.id}</CardDescription>
        </div>
        <div>
          <Button onClick={() => onClose(false)} variant="secondary">
            Dismiss
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Type</span>
          <BadgeType type={data.type} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Count</span>
          <span>{data.count}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Time</span>
          <span>{new Date(data.time * 1000).toLocaleString()}</span>
        </div>

        {data.type === "output" ? (
          <>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Log</span>

                <CopyButton value={data.str} />
              </div>
              <LuaBlock code={data.str} />
            </div>

            <Separator />
          </>
        ) : null}

        {!isFeatherEvent ? (
          <div>
            <span className="text-sm font-medium">Trace</span>
            <TraceBlock basePath={basePath} code={trace} />
          </div>
        ) : null}
      </CardContent>
      {!isFeatherEvent ? (
        <CardFooter className="justify-end">
          <CopyButton value={trace} />
        </CardFooter>
      ) : null}
    </Card>
  );
}

export default function Page() {
  const { data } = useConfig();
  const { data: logs } = useLogs({
    enabled: data !== undefined,
  });

  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const onClose = () => {
    setSelectedLog(null);
  };

  return (
    <PageLayout
      right={
        selectedLog && (
          <LogSidePanel
            basePath={data?.root_path || ""}
            data={selectedLog}
            onClose={onClose}
          />
        )
      }
    >
      <DataTable
        showSearch
        onRowSelection={(id) => {
          setSelectedLog(logs.find((item) => item.id === id) || null);
        }}
        data={logs}
      />
    </PageLayout>
  );
}
