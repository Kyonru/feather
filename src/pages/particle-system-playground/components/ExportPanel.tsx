import { Button } from '@/components/ui/button';
import { CodeIcon, DownloadIcon, FileArchiveIcon, FolderOpenIcon } from 'lucide-react';

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
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={onImportProject}>
        <FolderOpenIcon className="size-4" />
        Import Project
      </Button>
      <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={onSaveProject}>
        <DownloadIcon className="size-4" />
        Save Project
      </Button>
      <Button size="sm" className="h-8 gap-2 text-xs" onClick={onExportCode}>
        <CodeIcon className="size-4" />
        Copy Code
      </Button>
      <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={onExportZip}>
        <FileArchiveIcon className="size-4" />
        Save ZIP
      </Button>
    </div>
  );
}
