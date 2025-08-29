import { PageLayout } from '@/components/page-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  type: 'button' | 'input' | 'checkbox';
  value?: string;
  onClick?: (action: string) => void;
  onChange?: (action: string, value: string | boolean) => void;
  props?: Record<string, unknown>;
};

const PluginAction = ({ label, action, icon, type, value, onClick, onChange, props }: PluginActionProps) => {
  if (type === 'button') {
    return (
      <Button {...props} variant="outline" onClick={() => onClick && onClick(action)}>
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
  const { onActionChange, onAction: onPluginAction } = usePluginAction(currentUrl);

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
          {actions.map((action) => (
            <PluginAction
              key={action.key}
              action={action.key}
              label={action.label}
              icon={action.icon}
              type={action.type}
              value={action.value}
              onClick={onPluginAction}
              onChange={onActionChange}
              props={action.props}
            />
          ))}
        </div>
        <PluginContent data={data.data} type={data.type} loading={data.loading} />
      </div>
    </PageLayout>
  );
}
