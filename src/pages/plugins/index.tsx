import { PageLayout } from '@/components/page-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlugin, usePluginAction } from '@/hooks/use-plugin';
import { useConfigStore } from '@/store/config';
import { DynamicIcon, IconName } from 'lucide-react/dynamic';
import { useHref } from 'react-router';
import { PluginContent } from './content';
import { Checkbox } from '@/components/ui/checkbox';

type PluginActionProps = {
  label: string;
  action: string;
  icon: IconName;
  type: 'button' | 'input' | 'checkbox' | 'select' | 'file';
  value?: string;
  onClick?: (action: string) => void;
  onFileClick?: (action: string, filters?: { name: string; extensions: string[] }[]) => void;
  onChange?: (action: string, value: string | boolean) => void;
  props?: Record<string, unknown>;
};

const PluginAction = ({ label, action, icon, type, value, onClick, onFileClick, onChange, props }: PluginActionProps) => {
  if (type === 'button') {
    return (
      <Button {...props} variant="outline" onClick={() => onClick && onClick(action)}>
        <DynamicIcon className="size-4" name={icon} />
        <div>{label}</div>
      </Button>
    );
  }

  if (type === 'file') {
    const filters = props?.filters as { name: string; extensions: string[] }[] | undefined;
    return (
      <Button {...props} variant="outline" onClick={() => onFileClick && onFileClick(action, filters)}>
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
        <div>{label}</div>
      </div>
    );
  }

  if (type === 'select') {
    const options = ((props?.options as string[]) ?? []);
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

  return (
    <div className="flex items-center gap-2">
      <Input
        {...props}
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
    type: 'button' | 'input';
    value?: string;
    props?: Record<string, unknown>;
  }[] = plugin.actions || [];

  return (
    <PageLayout>
      <div className="px-4">
        <div className="flex flex-row gap-x-2 mb-4">
          <Button
            variant={plugin.disabled ? 'default' : 'outline'}
            onClick={onToggle}
          >
            <DynamicIcon className="size-4" name={plugin.disabled ? 'play' : 'pause'} />
            <div>{plugin.disabled ? 'Enable' : 'Disable'}</div>
          </Button>
          {actions.map((action) => (
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
