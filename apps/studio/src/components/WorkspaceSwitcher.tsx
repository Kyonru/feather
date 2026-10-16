import { useState } from 'react';
import { CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@feather/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@feather/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@feather/ui/dropdown-menu';
import { Input } from '@feather/ui/input';
import { useActiveWorkspace, useStudioWorkspacesStore } from '@studio/store/studio-workspaces';
import { WORKSPACE_NAME_MAX } from '@studio/store/workspace-registry';

/**
 * The work has a name (V4.md §6.4, W6).
 *
 * The current workspace sits in the shell strip, next to the tool, because it
 * is the answer to "what am I working on". Switching, creating and renaming
 * are reversible and so ask nothing. Deleting removes the user's own work for
 * good, so it is the one action in Studio that asks first (L6).
 *
 * Chrome only: no colour, no badge. The artifact is the colourful thing (W1).
 */
export function WorkspaceSwitcher() {
  const active = useActiveWorkspace();
  const workspaces = useStudioWorkspacesStore((state) => state.workspaces);
  const create = useStudioWorkspacesStore((state) => state.create);
  const rename = useStudioWorkspacesStore((state) => state.rename);
  const switchTo = useStudioWorkspacesStore((state) => state.switchTo);
  const remove = useStudioWorkspacesStore((state) => state.remove);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState(false);

  const openRename = () => {
    setDraft(active.name);
    setRenaming(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="studio-workspace-trigger"
          aria-label={`Workspace: ${active.name}`}
          className="flex min-w-0 max-w-56 items-center gap-1 rounded px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span className="truncate" data-testid="studio-workspace-name">
            {active.name}
          </span>
          <ChevronDownIcon className="size-3 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64" data-testid="studio-workspace-menu">
          <DropdownMenuLabel className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Workspaces
          </DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onSelect={() => switchTo(workspace.id)}
              data-testid="studio-workspace-option"
              aria-current={workspace.id === active.id ? 'true' : undefined}
              className="text-xs"
            >
              <CheckIcon className={workspace.id === active.id ? 'size-3.5' : 'size-3.5 opacity-0'} />
              <span className="truncate">{workspace.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs" onSelect={() => create()} data-testid="studio-workspace-new">
            <PlusIcon className="size-3.5" /> New workspace
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" onSelect={openRename} data-testid="studio-workspace-rename">
            <PencilIcon className="size-3.5" /> Rename…
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            disabled={workspaces.length <= 1}
            onSelect={() => setDeleting(true)}
            data-testid="studio-workspace-delete"
            title={workspaces.length <= 1 ? 'Studio always keeps one workspace.' : undefined}
          >
            <Trash2Icon className="size-3.5" /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              rename(active.id, draft);
              setRenaming(false);
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-sm">Rename workspace</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              aria-label="Workspace name"
              value={draft}
              maxLength={WORKSPACE_NAME_MAX}
              onChange={(event) => setDraft(event.target.value)}
              className="h-8 text-xs"
            />
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false} data-testid="studio-workspace-delete-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete “{active.name}”?</DialogTitle>
            <DialogDescription className="text-xs">
              Its shader graph, particle composites and texture recipes are removed from this computer. This cannot be
              undone. Export anything you want to keep first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                remove(active.id);
                setDeleting(false);
              }}
            >
              Delete workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
