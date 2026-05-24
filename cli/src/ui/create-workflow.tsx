import React, { useMemo, useState } from 'react';
import { Box, Text, render, useApp } from 'ink';
import { pluginCatalog } from '../generated/plugin-catalog.js';
import { buildVendorTargets } from '../lib/build/vendor.js';
import type { Registry } from '../lib/package/registry.js';
import { BooleanStep, MultiSelectStep } from './components.js';

type Phase = 'plugins-confirm' | 'plugins' | 'packages-confirm' | 'packages' | 'vendors-confirm' | 'vendors';

export type CreateWorkflowInput = {
  registry: Registry;
  skipPlugins?: boolean;
  skipPackages?: boolean;
  skipVendors?: boolean;
};

export type CreateWorkflowResult = {
  plugins: string[];
  packages: string[];
  vendorTargets: string[];
};

function CreateWorkflow({
  registry,
  skipPlugins,
  skipPackages,
  skipVendors,
  onComplete,
}: CreateWorkflowInput & { onComplete: (result: CreateWorkflowResult) => void }) {
  const { exit } = useApp();
  const initialPhase: Phase = skipPlugins ? (skipPackages ? 'vendors-confirm' : 'packages-confirm') : 'plugins-confirm';
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [plugins, setPlugins] = useState<string[]>([]);
  const [packages, setPackages] = useState<string[]>([]);

  const packageOptions = useMemo(
    () => Object.entries(registry.packages)
      .filter(([, entry]) => !entry.parent)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, entry]) => ({
        id,
        label: id,
        description: `${entry.trust} · ${entry.description}`,
      })),
    [registry],
  );

  const finish = (vendorTargets: string[]) => {
    onComplete({ plugins, packages, vendorTargets });
    exit();
  };

  const finishWith = (next: CreateWorkflowResult) => {
    onComplete(next);
    exit();
  };

  const nextAfterPlugins = (nextPlugins = plugins) => {
    if (skipPackages && skipVendors) {
      finishWith({ plugins: nextPlugins, packages, vendorTargets: [] });
      return;
    }
    setPhase(skipPackages ? 'vendors-confirm' : 'packages-confirm');
  };

  const nextAfterPackages = (nextPackages = packages) => {
    if (skipVendors) {
      finishWith({ plugins, packages: nextPackages, vendorTargets: [] });
    } else {
      setPhase('vendors-confirm');
    }
  };

  if (skipPlugins && skipPackages && skipVendors) {
    finish([]);
    return null;
  }

  if (phase === 'plugins-confirm') {
    return (
      <BooleanStep
        title="feather create"
        label="Add extra Feather plugins?"
        hint="Default CLI-mode plugins are configured automatically; this is for extra opt-in plugins."
        defaultYes={false}
        onConfirm={() => setPhase('plugins')}
        onCancel={nextAfterPlugins}
      />
    );
  }

  if (phase === 'plugins') {
    return (
      <MultiSelectStep
        title="feather create"
        label="Choose extra plugins"
        hint="Space toggles. Defaults are already included by feather init."
        options={pluginCatalog.map((plugin) => plugin.id)}
        labels={pluginCatalog.map((plugin) => plugin.name)}
        descriptions={pluginCatalog.map((plugin) => `${plugin.id} · ${plugin.description}`)}
        initialSelected={new Set<number>()}
        onSubmit={(selected) => {
          setPlugins(selected);
          nextAfterPlugins(selected);
        }}
        onCancel={nextAfterPlugins}
      />
    );
  }

  if (phase === 'packages-confirm') {
    return (
      <BooleanStep
        title="feather create"
        label="Install packages from the Feather catalog?"
        hint="You can always run feather package install later."
        defaultYes={false}
        onConfirm={() => setPhase('packages')}
        onCancel={nextAfterPackages}
      />
    );
  }

  if (phase === 'packages') {
    return (
      <MultiSelectStep
        title="feather create"
        label="Choose packages"
        options={packageOptions.map((pkg) => pkg.id)}
        labels={packageOptions.map((pkg) => pkg.label)}
        descriptions={packageOptions.map((pkg) => pkg.description)}
        initialSelected={new Set<number>()}
        onSubmit={(selected) => {
          setPackages(selected);
          nextAfterPackages(selected);
        }}
        onCancel={nextAfterPackages}
      />
    );
  }

  if (phase === 'vendors-confirm') {
    return (
      <BooleanStep
        title="feather create"
        label="Set up build vendors now?"
        hint="Vendor setup can download platform templates and may require native tools."
        defaultYes={false}
        onConfirm={() => setPhase('vendors')}
        onCancel={() => finish([])}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <MultiSelectStep
        title="feather create"
        label="Choose vendor targets"
        options={[...buildVendorTargets]}
        labels={[...buildVendorTargets]}
        descriptions={buildVendorTargets.map((target) => `Run feather build vendor add ${target}`)}
        initialSelected={new Set<number>()}
        onSubmit={finish}
        onCancel={() => finish([])}
      />
      <Text dimColor>{'  '}Esc skips vendor setup.</Text>
    </Box>
  );
}

export async function chooseCreateOptions(input: CreateWorkflowInput): Promise<CreateWorkflowResult> {
  return new Promise((resolve) => {
    render(<CreateWorkflow {...input} onComplete={resolve} />);
  });
}
