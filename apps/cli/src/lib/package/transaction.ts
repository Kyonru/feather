import { randomBytes } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { writeFileAtomicSync } from "../atomic-write.js";
import { lockfilePath, serializeLockfile, type Lockfile } from "./lockfile.js";

/**
 * One package transaction per command. Files are staged, affected files are backed up, then every
 * file is swapped into place and the lockfile is replaced last. A failure at any step rolls back,
 * so project files and feather.lock.json are left byte-for-byte as they were.
 */

export const TRANSACTION_DIR_PREFIX = ".feather-package-txn-";

export type TransactionStep = "stage" | "backup" | "swap" | "delete" | "lockfile";

export type TransactionHooks = {
  /** Test seam for fault injection: throwing here fails the transaction at that boundary. */
  beforeStep?: (step: TransactionStep, index: number, target?: string) => void;
};

export type TransactionWrite = { target: string; absTarget: string; content: Buffer };
export type TransactionDelete = { target: string; absTarget: string };

export type TransactionInput = {
  projectDir: string;
  writes: TransactionWrite[];
  deletes?: TransactionDelete[];
  /** Next lockfile, written last. Omit to leave feather.lock.json untouched. */
  lockfile?: Lockfile;
  hooks?: TransactionHooks;
};

export type TransactionResult =
  | { ok: true; written: string[]; deleted: string[] }
  | { ok: false; error: string; rollbackErrors: string[] };

export function findInterruptedTransactions(projectDir: string): string[] {
  if (!existsSync(projectDir)) return [];
  try {
    return readdirSync(projectDir)
      .filter((name) => name.startsWith(TRANSACTION_DIR_PREFIX))
      .map((name) => join(projectDir, name));
  } catch {
    return [];
  }
}

export function interruptedTransactionError(projectDir: string): string | null {
  const leftovers = findInterruptedTransactions(projectDir);
  if (leftovers.length === 0) return null;
  return (
    `An interrupted package transaction was found at ${leftovers.map((dir) => relative(projectDir, dir)).join(", ")}. ` +
    `Its journal.json lists the files it touched and backup/ holds their previous contents. ` +
    `Restore anything you need from it, delete the folder, then re-run.`
  );
}

type AppliedWrite = { absTarget: string; backup: string | null };
type AppliedDelete = { absTarget: string; backup: string };

function removeEmptyDirs(created: string[]): void {
  // Deepest first, and only directories this transaction created and that are empty again.
  for (const dir of [...created].sort((a, b) => b.length - a.length)) {
    try {
      if (readdirSync(dir).length === 0) rmdirSync(dir);
    } catch {
      // already gone or not empty
    }
  }
}

function missingAncestors(dir: string, projectDir: string): string[] {
  const missing: string[] = [];
  let current = dir;
  while (!existsSync(current) && current !== projectDir && current !== dirname(current)) {
    missing.push(current);
    current = dirname(current);
  }
  return missing;
}

function moveIntoPlace(source: string, destination: string): void {
  try {
    renameSync(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    writeFileAtomicSync(destination, readFileSync(source));
    rmSync(source, { force: true });
  }
}

export function commitPackageTransaction(input: TransactionInput): TransactionResult {
  const { projectDir, writes, hooks } = input;
  const deletes = input.deletes ?? [];
  const step = (name: TransactionStep, index: number, target?: string) => hooks?.beforeStep?.(name, index, target);

  const leftover = interruptedTransactionError(projectDir);
  if (leftover) return { ok: false, error: leftover, rollbackErrors: [] };

  const txnDir = join(projectDir, `${TRANSACTION_DIR_PREFIX}${randomBytes(6).toString("hex")}`);
  const stagedDir = join(txnDir, "staged");
  const backupDir = join(txnDir, "backup");
  const lockPath = lockfilePath(projectDir);
  const originalLockfile = existsSync(lockPath) ? readFileSync(lockPath) : null;

  const appliedWrites: AppliedWrite[] = [];
  const appliedDeletes: AppliedDelete[] = [];
  const createdDirs: string[] = [];
  const backups = new Map<string, string>();
  let lockfileReplaced = false;

  const rollback = (): string[] => {
    const errors: string[] = [];
    if (lockfileReplaced) {
      try {
        if (originalLockfile) writeFileAtomicSync(lockPath, originalLockfile);
        else rmSync(lockPath, { force: true });
      } catch (error) {
        errors.push(`feather.lock.json: ${(error as Error).message}`);
      }
    }
    for (const applied of [...appliedDeletes].reverse()) {
      try {
        renameSync(applied.backup, applied.absTarget);
      } catch (error) {
        errors.push(`${relative(projectDir, applied.absTarget)}: ${(error as Error).message}`);
      }
    }
    for (const applied of [...appliedWrites].reverse()) {
      try {
        if (applied.backup) copyFileSync(applied.backup, applied.absTarget);
        else rmSync(applied.absTarget, { force: true });
      } catch (error) {
        errors.push(`${relative(projectDir, applied.absTarget)}: ${(error as Error).message}`);
      }
    }
    removeEmptyDirs(createdDirs);
    if (errors.length === 0) rmSync(txnDir, { recursive: true, force: true });
    return errors;
  };

  try {
    mkdirSync(stagedDir, { recursive: true });
    mkdirSync(backupDir, { recursive: true });

    // 1. Stage every new file inside the transaction directory.
    const staged: string[] = [];
    for (const [index, write] of writes.entries()) {
      step("stage", index, write.target);
      const stagedPath = join(stagedDir, String(index));
      writeFileSync(stagedPath, write.content);
      staged.push(stagedPath);
    }

    // 2. Back up every existing file the transaction replaces, plus the lockfile.
    for (const [index, write] of writes.entries()) {
      if (!existsSync(write.absTarget)) continue;
      step("backup", index, write.target);
      const backupPath = join(backupDir, `w${index}`);
      copyFileSync(write.absTarget, backupPath);
      backups.set(write.absTarget, backupPath);
      chmodSync(staged[index]!, statSync(write.absTarget).mode & 0o7777);
    }
    if (originalLockfile) writeFileSync(join(backupDir, "feather.lock.json"), originalLockfile);
    writeFileSync(
      join(txnDir, "journal.json"),
      JSON.stringify(
        {
          startedAt: new Date().toISOString(),
          writes: writes.map((write, index) => ({
            target: write.target,
            backup: backups.has(write.absTarget) ? `backup/w${index}` : null,
          })),
          deletes: deletes.map((item, index) => ({ target: item.target, backup: `backup/d${index}` })),
          lockfileBackup: originalLockfile ? "backup/feather.lock.json" : null,
        },
        null,
        2,
      ),
    );

    // 3. Swap staged files into place.
    for (const [index, write] of writes.entries()) {
      step("swap", index, write.target);
      const parent = dirname(write.absTarget);
      const missing = missingAncestors(parent, resolve(projectDir));
      if (missing.length > 0) {
        mkdirSync(parent, { recursive: true });
        createdDirs.push(...missing);
      }
      appliedWrites.push({ absTarget: write.absTarget, backup: backups.get(write.absTarget) ?? null });
      moveIntoPlace(staged[index]!, write.absTarget);
    }

    // 4. Move deleted files into the backup directory.
    for (const [index, item] of deletes.entries()) {
      step("delete", index, item.target);
      if (!existsSync(item.absTarget) && !isSymlink(item.absTarget)) continue;
      const backupPath = join(backupDir, `d${index}`);
      renameSync(item.absTarget, backupPath);
      appliedDeletes.push({ absTarget: item.absTarget, backup: backupPath });
    }

    // 5. Replace the lockfile last.
    if (input.lockfile) {
      step("lockfile", 0, "feather.lock.json");
      input.lockfile.generatedAt = new Date().toISOString();
      writeFileAtomicSync(lockPath, serializeLockfile(input.lockfile));
      lockfileReplaced = true;
    }
  } catch (error) {
    const rollbackErrors = rollback();
    const message = (error as Error).message;
    return {
      ok: false,
      error:
        rollbackErrors.length === 0
          ? `${message}. No files were changed.`
          : `${message}. Rollback was incomplete; previous contents are kept in ${relative(projectDir, txnDir)}/backup.`,
      rollbackErrors,
    };
  }

  rmSync(txnDir, { recursive: true, force: true });
  return {
    ok: true,
    written: writes.map((write) => write.target),
    deleted: appliedDeletes.map((item) => relative(projectDir, item.absTarget).replace(/\\/g, "/")),
  };
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
