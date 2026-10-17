import { Button } from '@feather/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@feather/ui/dropdown-menu';
import { ChevronDownIcon, CodeIcon, DownloadIcon, FileArchiveIcon, FolderOpenIcon } from 'lucide-react';

export function ExportPanel({
  onExportCode,
  onExportZip,
  onSaveProject,
  onImportProject,
}: {
  onExportCode: () => void;
  onExportZip: () => void;
  onSaveProject: () => void;
  onImportProject: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <FolderOpenIcon className="size-3.5" />
          Project
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] tracking-wide text-muted-foreground uppercase">
          Particle Project
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={onImportProject}>
          <FolderOpenIcon /> Import Project
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSaveProject}>
          <DownloadIcon /> Save Project
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onExportCode}>
          <CodeIcon /> Copy Lua Code
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportZip}>
          <FileArchiveIcon /> Save Runtime ZIP
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
