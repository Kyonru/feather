import React, { useState, useEffect } from "react";
import { Box, Text, render, useApp } from "ink";
import { SPINNER_FRAMES } from "./components.js";
import { installPackage } from "../lib/package/install.js";
import { formatRequireHint } from "../lib/package/resolve.js";
import type { ResolvedPackage } from "../lib/package/resolve.js";
import type { Lockfile } from "../lib/package/lockfile.js";
import type { InstallResult } from "../lib/package/install.js";

type FileStatus = "pending" | "downloading" | "ok" | "error";
type PkgStatus = "pending" | "installing" | "ok" | "error";

type FileState = {
  name: string;
  target: string;
  status: FileStatus;
  liveComputed?: boolean;
  error?: string;
};

type PkgState = {
  id: string;
  version: string;
  liveComputed: boolean;
  status: PkgStatus;
  files: FileState[];
  error?: string;
};

function useSpinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return SPINNER_FRAMES[frame];
}

function FileRow({ file, spinner }: { file: FileState; spinner: string }) {
  const fileName = file.name.split("/").pop() ?? file.name;
  if (file.status === "pending") {
    return (
      <Box gap={1} paddingLeft={4}>
        <Text color="gray">○ {fileName}</Text>
      </Box>
    );
  }
  if (file.status === "downloading") {
    return (
      <Box gap={1} paddingLeft={4}>
        <Text color="cyan">{spinner} {fileName}</Text>
        <Text color="gray">→ {file.target}</Text>
        <Text color="gray">downloading…</Text>
      </Box>
    );
  }
  if (file.status === "error") {
    return (
      <Box flexDirection="column" paddingLeft={4}>
        <Box gap={1}>
          <Text color="red">✖ {fileName}</Text>
          <Text color="gray">→ {file.target}</Text>
        </Box>
        {file.error && <Text color="red">  {file.error}</Text>}
      </Box>
    );
  }
  return (
    <Box gap={1} paddingLeft={4}>
      <Text color="green">✔</Text>
      <Text color="gray">{file.target}</Text>
      {file.liveComputed ? (
        <Text color="yellow">checksum: live-computed ⚠</Text>
      ) : (
        <Text color="green">checksum: verified</Text>
      )}
    </Box>
  );
}

function PkgRow({ pkg, spinner }: { pkg: PkgState; spinner: string }) {
  const statusIcon =
    pkg.status === "pending" ? <Text color="gray">○</Text> :
    pkg.status === "installing" ? <Text color="cyan">{spinner}</Text> :
    pkg.status === "ok" ? <Text color="green">✔</Text> :
    <Text color="red">✖</Text>;

  const versionLabel = pkg.liveComputed
    ? <Text color="yellow"> @ {pkg.version} <Text color="gray">[experimental]</Text></Text>
    : <Text color="gray"> @ {pkg.version}</Text>;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        {statusIcon}
        <Text bold={pkg.status === "installing"}>{pkg.id}</Text>
        {versionLabel}
        {pkg.status === "pending" && <Text color="gray">waiting…</Text>}
        {pkg.status === "error" && pkg.error && <Text color="red">{pkg.error}</Text>}
      </Box>
      {(pkg.status === "installing" || pkg.status === "ok" || pkg.status === "error") &&
        pkg.files.map((f) => <FileRow key={f.name} file={f} spinner={spinner} />)}
    </Box>
  );
}

function InstallProgress({
  packages,
  lockfile,
  projectDir,
  targetOverride,
  dryRun,
  onComplete,
}: {
  packages: ResolvedPackage[];
  lockfile: Lockfile;
  projectDir: string;
  targetOverride?: string;
  dryRun?: boolean;
  onComplete: (results: InstallResult[]) => void;
}) {
  const { exit } = useApp();
  const spinner = useSpinner();

  const [states, setStates] = useState<PkgState[]>(
    packages.map((pkg) => ({
      id: pkg.id,
      version: pkg.versionOverride ?? pkg.entry.source.tag ?? 'url',
      liveComputed: !!pkg.versionOverride,
      status: "pending",
      files: pkg.files.map((f) => ({
        name: f.name,
        target: pkg.versionOverride
          ? (targetOverride ? `${targetOverride}/${f.name.split("/").pop()}` : f.target)
          : (targetOverride ? `${targetOverride}/${f.name.split("/").pop()}` : f.target),
        status: "pending",
        liveComputed: !!pkg.versionOverride,
      })),
    })),
  );

  const [done, setDone] = useState(false);
  const [allResults, setAllResults] = useState<InstallResult[]>([]);

  const update = (i: number, patch: Partial<PkgState>) =>
    setStates((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const updateFile = (i: number, name: string, patch: Partial<FileState>) =>
    setStates((prev) =>
      prev.map((s, j) =>
        j === i ? { ...s, files: s.files.map((f) => (f.name === name ? { ...f, ...patch } : f)) } : s,
      ),
    );

  useEffect(() => {
    let cancelled = false;
    const results: InstallResult[] = [];

    (async () => {
      for (let i = 0; i < packages.length; i++) {
        if (cancelled) break;
        const pkg = packages[i];

        update(i, { status: "installing" });

        const result = await installPackage(pkg, lockfile, {
          projectDir,
          targetOverride,
          dryRun,
          onFileStart: (name) => {
            if (!cancelled) updateFile(i, name, { status: "downloading" });
          },
          onFileComplete: (fileResult) => {
            if (!cancelled)
              updateFile(i, fileResult.name, {
                status: fileResult.ok ? "ok" : "error",
                error: fileResult.error,
              });
          },
        });

        results.push(result);
        update(i, { status: result.ok ? "ok" : "error", error: result.error });
      }

      if (!cancelled) {
        setAllResults(results);
        setDone(true);
        onComplete(results);
        exit();
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const succeededPkgs = allResults.length > 0 ? packages.filter((_, i) => allResults[i]?.ok) : [];

  return (
    <Box flexDirection="column" gap={1} paddingTop={1}>
      <Text bold>{dryRun ? "Dry run —" : "Installing"} {packages.length} package{packages.length > 1 ? "s" : ""}…</Text>
      <Box flexDirection="column" gap={1}>
        {states.map((s) => (
          <PkgRow key={s.id} pkg={s} spinner={spinner} />
        ))}
      </Box>
      {done && succeededPkgs.length > 0 && (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text color="gray">Add to your code:</Text>
          {succeededPkgs.map((pkg) => (
            <Text key={pkg.id} color="cyan">  {formatRequireHint(pkg)}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

export async function showInstallProgress(input: {
  packages: ResolvedPackage[];
  lockfile: Lockfile;
  projectDir: string;
  targetOverride?: string;
  dryRun?: boolean;
}): Promise<InstallResult[]> {
  return new Promise((resolve) => {
    render(<InstallProgress {...input} onComplete={resolve} />);
  });
}
