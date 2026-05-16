import React, { type ReactNode } from "react";
import { Box, Text } from "ink";
import { toneColor, type Option, type SummaryRow, type Tone } from "./init-mode-model.js";

export function DangerousName({ children }: { children: string }) {
  return (
    <Text color="red" bold>
      {children}
    </Text>
  );
}

export function NameList({
  values,
  getTone,
}: {
  values: string[];
  getTone?: (value: string) => Tone | undefined;
}) {
  if (values.length === 0) return <Text color="gray">(none)</Text>;

  return (
    <>
      {values.map((value, index) => (
        <React.Fragment key={value}>
          {index > 0 ? <Text color="gray">, </Text> : null}
          <Text color={toneColor(getTone?.(value))}>{value}</Text>
        </React.Fragment>
      ))}
    </>
  );
}

function SummaryValue({ value, tone }: { value: ReactNode; tone?: Tone }) {
  if (typeof value === "string") return <Text color={toneColor(tone)}>{value}</Text>;
  return <>{value}</>;
}

export function SummaryRows({ rows }: { rows: SummaryRow[] }) {
  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <Text key={row.id}>
          <Text color="gray">{row.label.padEnd(17)}</Text>
          <SummaryValue value={row.value} tone={row.tone} />
        </Text>
      ))}
    </Box>
  );
}

export function InfoPanel({
  title,
  tone = "info",
  children,
}: {
  title: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <Box flexDirection="column">
      <Text color={toneColor(tone)} bold>
        {title}
      </Text>
      <Box flexDirection="column" paddingLeft={2}>
        {children}
      </Box>
    </Box>
  );
}

function cursorLine(active: boolean, text: string, description?: string, tone?: Tone) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={active ? "cyan" : undefined}>{active ? "❯" : " "}</Text>{" "}
        <Text color={toneColor(tone) ?? (active ? "cyan" : undefined)}>{text}</Text>
      </Text>
      {description ? <Text color="gray">  {description}</Text> : null}
    </Box>
  );
}

export function TextInputPrompt({
  title,
  value,
  placeholder,
  secure,
  error,
}: {
  title: string;
  value: string;
  placeholder?: string;
  secure?: boolean;
  error?: string;
}) {
  const shown = secure && value ? "•".repeat(value.length) : value;
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Text>
        <Text color={value ? "cyan" : "gray"}>{shown || placeholder || " "}</Text>
      </Text>
      {error ? <Text color="red">{error}</Text> : <Text color="gray">←→ move · Backspace delete · Enter confirm</Text>}
    </Box>
  );
}

export function SingleSelect<T extends string>({
  title,
  options,
  selected,
  getTone,
}: {
  title: string;
  options: Option<T>[];
  selected: number;
  getTone?: (option: Option<T>) => Tone | undefined;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column">
        {options.map((option, index) => (
          <Box key={option.value}>
            {cursorLine(index === selected, `${index + 1}. ${option.label}`, option.description, getTone?.(option))}
          </Box>
        ))}
      </Box>
      <Text color="gray">↑↓ or j/k navigate · 1-{options.length} jump · Enter select</Text>
    </Box>
  );
}

export function MultiSelect({
  title,
  options,
  selected,
  cursor,
  getTone,
  hint = "↑↓ or j/k navigate · Space toggle · a select all · Enter confirm",
}: {
  title: string;
  options: Option[];
  selected: Set<string>;
  cursor: number;
  getTone?: (option: Option) => Tone | undefined;
  hint?: string;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column">
        {options.length === 0 ? <Text color="gray">No options available.</Text> : null}
        {options.map((option, index) => {
          const tone = getTone?.(option);
          return (
            <Box key={option.value} flexDirection="column">
              <Text>
                <Text color={index === cursor ? "cyan" : undefined}>
                  {index === cursor ? "❯" : " "} {selected.has(option.value) ? "◉" : "○"}
                </Text>{" "}
                <Text color={toneColor(tone) ?? (index === cursor ? "cyan" : undefined)}>{option.label}</Text>
              </Text>
              {option.description ? <Text color="gray">  {option.description}</Text> : null}
            </Box>
          );
        })}
      </Box>
      <Text color="gray">{hint}</Text>
    </Box>
  );
}

export function ConfirmPrompt({ title, value }: { title: string; value: boolean }) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      <Text>
        <Text color={value ? "cyan" : undefined}>Yes</Text>
        <Text> / </Text>
        <Text color={!value ? "cyan" : undefined}>No</Text>
      </Text>
      <Text color="gray">y/← = yes · n/→ = no · Enter confirm</Text>
    </Box>
  );
}
