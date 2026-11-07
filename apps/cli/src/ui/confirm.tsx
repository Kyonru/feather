import React from 'react';
import { Text, render, useApp } from 'ink';
import { BooleanStep } from './components.js';

export type ConfirmActionOptions = {
  title?: string;
  label: string;
  hint?: string;
  rows?: string[];
  danger?: boolean;
  defaultYes?: boolean;
};

function ConfirmAction({
  title,
  label,
  hint,
  rows = [],
  danger,
  defaultYes,
  onComplete,
}: ConfirmActionOptions & { onComplete: (confirmed: boolean) => void }) {
  const { exit } = useApp();
  const finish = (confirmed: boolean) => {
    onComplete(confirmed);
    exit();
  };

  return (
    <BooleanStep
      title={title}
      label={label}
      hint={hint}
      tone={danger ? 'danger' : 'default'}
      defaultYes={defaultYes ?? !danger}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    >
      {rows.map((row) => (
        <Text key={row} dimColor>
          {'  - '}
          {row}
        </Text>
      ))}
    </BooleanStep>
  );
}

export async function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
  let confirmed = false;
  const { waitUntilExit } = render(<ConfirmAction {...options} onComplete={(value) => { confirmed = value; }} />);
  await waitUntilExit();
  return confirmed;
}
