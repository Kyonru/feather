import { PageLayout } from '@/components/page-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlugin, usePluginAction } from '@/hooks/use-plugin';
import { useConfigStore } from '@/store/config';
import { DynamicIcon, IconName } from 'lucide-react/dynamic';
import { useCallback, useRef } from 'react';
import { Link, useHref } from 'react-router';
import { PluginContent } from './content';
import { Checkbox } from '@/components/ui/checkbox';
import { openUrl } from '@/utils/linking';
import { PuzzleIcon, TriangleAlertIcon } from 'lucide-react';
import { FEATHER_PLUGIN_API } from '@/constants/feather-api';

type PluginActionDefinition = {
  label: string;
  key: string;
  icon: IconName;
  type: 'button' | 'input' | 'checkbox' | 'select' | 'file' | 'vector';
  value?: string;
  props?: Record<string, unknown>;
  group?: string;
};

const isPluginAction = (value: unknown): value is PluginActionDefinition => {
  if (typeof value !== 'object' || value === null) return false;
  const action = value as Record<string, unknown>;
  return (
    typeof action.label === 'string' &&
    typeof action.key === 'string' &&
    typeof action.icon === 'string' &&
    typeof action.type === 'string'
  );
};

const describePluginApi = (plugin: { api?: unknown; minApi?: unknown; maxApi?: unknown; currentApi?: unknown }) => {
  const current = typeof plugin.currentApi === 'number' ? plugin.currentApi : FEATHER_PLUGIN_API;
  if (typeof plugin.api === 'number') return `Requires API ${plugin.api}; this desktop supports API ${current}.`;
  if (Array.isArray(plugin.api) && plugin.api.length > 0) {
    return `Requires API ${plugin.api.join(', ')}; this desktop supports API ${current}.`;
  }
  if (typeof plugin.minApi === 'number' || typeof plugin.maxApi === 'number') {
    return `Requires API ${typeof plugin.minApi === 'number' ? plugin.minApi : 'any'}-${typeof plugin.maxApi === 'number' ? plugin.maxApi : 'any'}; this desktop supports API ${current}.`;
  }
  return `This plugin is not compatible with Feather plugin API ${current}.`;
};

const VectorInput = ({
  label,
  value,
  onChange,
  props,
}: {
  label: string;
  value: string;
  onChange: (joined: string) => void;
  props?: Record<string, unknown>;
}) => {
  const labels = (props?.labels as string[]) ?? [];
  const repeating = Boolean(props?.repeating);
  const inputType = (props?.type as string) ?? 'number';
  const min = props?.min as number | undefined;
  const max = props?.max as number | undefined;
  const step = props?.step as number | undefined;

  const parts = value.split(',').map((s) => s.trim());
  const valuesRef = useRef(parts);
  valuesRef.current = parts;

  const handleChange = useCallback(
    (index: number, newVal: string) => {
      const next = [...valuesRef.current];
      next[index] = newVal;
      onChange(next.join(', '));
    },
    [onChange],
  );

  // For repeating labels (like R,G,B,A,R,G,B,A...), cycle through the label array
  const getLabel = (i: number) => {
    if (labels.length === 0) return `${i + 1}`;
    if (repeating) return labels[i % labels.length];
    return labels[i] ?? `${i + 1}`;
  };

  // Group into rows when repeating (e.g. RGBA groups of 4)
  const groupSize = repeating && labels.length > 0 ? labels.length : 0;
  const groups: number[][] = [];
  if (groupSize > 0) {
    for (let i = 0; i < parts.length; i += groupSize) {
      groups.push(parts.slice(i, i + groupSize).map((_, j) => i + j));
    }
  }

  const renderField = (i: number) => (
    <div key={i} className="flex-1 min-w-0">
      <div className="text-[10px] text-muted-foreground mb-0.5 text-center">{getLabel(i)}</div>
      <Input
        type={inputType}
        min={min}
        max={max}
        step={step}
        defaultValue={parts[i]}
        className="text-xs h-7 px-1.5 text-center"
        onChange={(e) => handleChange(i, e.target.value)}
      />
    </div>
  );

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {groupSize > 0 ? (
        <div className="space-y-1.5">
          {groups.map((indices, gi) => (
            <div key={gi} className="flex gap-1">
              {indices.map(renderField)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-1">
          {parts.map((_, i) => renderField(i))}
        </div>
      )}
    </div>
  );
};

type PluginActionProps = {
  label: string;
  action: string;
  icon: IconName;
  type: 'button' | 'input' | 'checkbox' | 'select' | 'file' | 'vector';
  value?: string;
  onClick?: (action: string) => void;
  onFileClick?: (action: string, filters?: { name: string; extensions: string[] }[]) => void;
  onChange?: (action: string, value: string | boolean) => void;
  props?: Record<string, unknown>;
  grouped?: boolean;
};

const pickInputProps = (props?: Record<string, unknown>) => {
  if (!props) return {};
  const picked: Record<string, unknown> = {};
  for (const key of ['type', 'min', 'max', 'step', 'placeholder', 'disabled', 'readOnly'] as const) {
    if (props[key] !== undefined) picked[key] = props[key];
  }
  return picked;
};

const PluginAction = ({ label, action, icon, type, value, onClick, onFileClick, onChange, props, grouped }: PluginActionProps) => {
  if (type === 'button') {
    return (
      <Button {...props} variant="outline" onClick={() => onClick && onClick(action)} className={grouped ? 'w-full' : ''}>
        <DynamicIcon className="size-4" name={icon} />
        <div>{label}</div>
      </Button>
    );
  }

  if (type === 'file') {
    const filters = props?.filters as { name: string; extensions: string[] }[] | undefined;
    return (
      <Button {...props} variant="outline" onClick={() => onFileClick && onFileClick(action, filters)} className={grouped ? 'w-full' : ''}>
        <DynamicIcon className="size-4" name={icon} />
        <div>{label}</div>
      </Button>
    );
  }

  if (type === 'checkbox') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          {...props}
          defaultChecked={Boolean(value)}
          onCheckedChange={(checked) => onChange && onChange(action, checked ? 'true' : 'false')}
        />
        <Label>{label}</Label>
      </div>
    );
  }

  if (type === 'select') {
    const options = ((props?.options as string[]) ?? []);
    if (grouped) {
      return (
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Select defaultValue={value} onValueChange={(v) => onChange && onChange(action, v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={label} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    return (
      <Select defaultValue={value} onValueChange={(v) => onChange && onChange(action, v)}>
        <SelectTrigger className="w-[140px]">
          <DynamicIcon className="size-4" name={icon} />
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (type === 'vector') {
    return (
      <VectorInput
        label={label}
        value={value ?? ''}
        onChange={(v) => onChange && onChange(action, v)}
        props={props}
      />
    );
  }

  if (grouped) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Input
          {...pickInputProps(props)}
          placeholder={label}
          defaultValue={value}
          onChange={(e) => onChange && onChange(action, `${e.target.value}`)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        {...pickInputProps(props)}
        placeholder={label}
        defaultValue={value}
        onChange={(e) => onChange && onChange(action, `${e.target.value}`)}
      />
    </div>
  );
};

export default function PluginPage() {
  const currentUrl = useHref('');
  const { data } = usePlugin(currentUrl);
  const plugins = useConfigStore((state) => state.config?.plugins);
  const pluginKey = currentUrl.slice('/plugins/'.length);
  const { onActionChange, onAction: onPluginAction, onFileAction, onCancel, onToggle } = usePluginAction(currentUrl);

  const onParamsChange = (params: Record<string, string>) => {
    for (const [key, value] of Object.entries(params)) {
      onActionChange(key, value);
    }
  };

  const plugin = plugins?.[pluginKey];

  if (!plugin) {
    const pluginEntries = Object.entries(plugins ?? {})
      .filter(([, value]) => value.tabName)
      .sort(([, a], [, b]) => String(a.tabName).localeCompare(String(b.tabName)));

    return (
      <PageLayout>
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center">
          <div className="flex max-w-lg flex-col items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-md border bg-muted/40">
              <PuzzleIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="grid gap-1">
              <p className="text-lg font-semibold">Plugin not available</p>
              <p className="text-sm text-muted-foreground">
                This session does not expose <span className="font-mono text-foreground">{pluginKey}</span>. It may
                belong to another game session, or the plugin may be disabled or not installed in this run.
              </p>
            </div>

            {pluginEntries.length > 0 ? (
              <div className="flex max-w-full flex-wrap justify-center gap-2">
                {pluginEntries.slice(0, 6).map(([key, value]) => (
                  <Button key={key} asChild variant="outline" size="sm">
                    <Link to={`/plugins/${key}`}>
                      {value.icon && <DynamicIcon className="size-3.5" name={value.icon as IconName} />}
                      {value.tabName}
                    </Link>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No plugins are available for the selected session.</p>
            )}
          </div>
        </div>
      </PageLayout>
    );
  }

  const actions = Array.isArray(plugin.actions) ? plugin.actions.filter(isPluginAction) : [];
  const docsUrl = typeof plugin.docs === 'string' ? plugin.docs : null;

  // Partition actions: toolbar (no group) vs grouped (has group)
  const toolbarActions = actions.filter((a) => !a.group);
  const groupedActions = actions.filter((a) => a.group);

  // Build ordered groups preserving the order they first appear
  const groups: { name: string; actions: typeof groupedActions }[] = [];
  const groupMap = new Map<string, typeof groupedActions>();
  for (const action of groupedActions) {
    const name = action.group!;
    if (!groupMap.has(name)) {
      const arr: typeof groupedActions = [];
      groupMap.set(name, arr);
      groups.push({ name, actions: arr });
    }
    groupMap.get(name)!.push(action);
  }

  return (
    <PageLayout>
      <div className="px-4">
        <div className="flex items-start justify-between gap-2 mb-4">
          {/* Plugin-specific toolbar actions */}
          <div className="flex flex-row flex-wrap gap-2">
            {toolbarActions.map((action) => (
              <PluginAction
                key={action.key}
                action={action.key}
                label={action.label}
                icon={action.icon}
                type={action.type}
                value={action.value}
                onClick={onPluginAction}
                onFileClick={onFileAction}
                onChange={onActionChange}
                props={action.props}
              />
            ))}
            {data.loading && (
              <Button variant="destructive" size="sm" onClick={() => onCancel('gif')}>
                <DynamicIcon className="size-4" name="x" />
                Cancel
              </Button>
            )}
          </div>
          {/* System controls */}
          <div className="flex items-center gap-2 shrink-0">
            {docsUrl && (
              <Button variant="ghost" size="sm" onClick={() => openUrl(docsUrl)}>
                <DynamicIcon className="size-4" name="book-open" />
                Docs
              </Button>
            )}
            <Button
              variant={plugin.disabled ? 'default' : 'outline'}
              size="sm"
              onClick={onToggle}
              disabled={plugin.incompatible}
            >
              <DynamicIcon className="size-4" name={plugin.disabled ? 'play' : 'pause'} />
              {plugin.disabled ? 'Enable' : 'Disable'}
            </Button>
          </div>
        </div>
        {plugin.incompatible && (
          <div className="mb-4 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="grid gap-1">
              <p className="font-medium text-destructive">Plugin API mismatch</p>
              <p className="text-muted-foreground">
                {plugin.incompatibilityReason || describePluginApi(plugin)} Update this plugin or use a matching Feather desktop/runtime version.
              </p>
            </div>
          </div>
        )}
        {groups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {groups.map((group) => (
              <Card key={group.name} className="py-3 gap-3">
                <CardHeader className="px-4 pb-0">
                  <CardTitle className="text-sm">{group.name}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 space-y-3">
                  {group.actions.map((action) => (
                    <PluginAction
                      key={`${action.key}:${action.value ?? ''}`}
                      action={action.key}
                      label={action.label}
                      icon={action.icon}
                      type={action.type}
                      value={action.value}
                      onClick={onPluginAction}
                      onFileClick={onFileAction}
                      onChange={onActionChange}
                      props={action.props}
                      grouped
                    />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {plugin.disabled && !plugin.incompatible && (
          <div className="text-muted-foreground text-sm mb-4">
            This plugin is disabled and execution is paused. Enable it to resume.
          </div>
        )}
        {!plugin.disabled && !plugin.incompatible && (
          <PluginContent {...data} onAction={onPluginAction} onParamsChange={onParamsChange} />
        )}
      </div>
    </PageLayout>
  );
}
