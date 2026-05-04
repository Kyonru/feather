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
import { useHref } from 'react-router';
import { PluginContent } from './content';
import { Checkbox } from '@/components/ui/checkbox';

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
    return (
      <PageLayout>
        <pre className="whitespace-pre-wrap text-4xl p-12">404 Plugin Not Found</pre>
      </PageLayout>
    );
  }

  const actions: {
    label: string;
    key: string;
    icon: IconName;
    type: 'button' | 'input' | 'vector';
    value?: string;
    props?: Record<string, unknown>;
    group?: string;
  }[] = plugin.actions || [];

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
        <div className="flex flex-row flex-wrap gap-2 mb-4">
          <Button
            variant={plugin.disabled ? 'default' : 'outline'}
            onClick={onToggle}
          >
            <DynamicIcon className="size-4" name={plugin.disabled ? 'play' : 'pause'} />
            <div>{plugin.disabled ? 'Enable' : 'Disable'}</div>
          </Button>
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
              Cancel
            </Button>
          )}
        </div>
        {groups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
            {groups.map((group) => (
              <Card key={group.name} className="py-3 gap-3">
                <CardHeader className="px-4 pb-0">
                  <CardTitle className="text-sm">{group.name}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 space-y-3">
                  {group.actions.map((action) => (
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
                      grouped
                    />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {plugin.disabled && (
          <div className="text-muted-foreground text-sm mb-4">
            This plugin is disabled and execution is paused. Enable it to resume.
          </div>
        )}
        {!plugin.disabled && <PluginContent {...data} onParamsChange={onParamsChange} />}
      </div>
    </PageLayout>
  );
}
