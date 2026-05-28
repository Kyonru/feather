import { CircleXIcon, FeatherIcon, FileClockIcon, FileQuestionMarkIcon } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { LogType } from '@/hooks/use-logs';
import { useConfigStore } from '@/store/config';
import { cn } from '@/utils/styles';

type LogTypeTone = {
  badgeClass: string;
  icon: ReactNode;
};

function isFeatherEvent(type: string) {
  return type === LogType.FEATHER_FINISH || type === LogType.FEATHER_START;
}

function logTypeTone(type: string): LogTypeTone {
  if (type === 'output') {
    return {
      badgeClass: 'bg-cyan-700 text-white dark:bg-cyan-400 dark:text-cyan-950',
      icon: <FileClockIcon className="size-3" />,
    };
  }

  if (type === 'error' || type === 'fatal') {
    return {
      badgeClass: 'bg-red-700 text-white dark:bg-red-400 dark:text-red-950',
      icon: <CircleXIcon className="size-3" />,
    };
  }

  if (isFeatherEvent(type)) {
    return {
      badgeClass: 'bg-yellow-700 text-white dark:bg-yellow-400 dark:text-yellow-950',
      icon: <FeatherIcon className="size-3" />,
    };
  }

  return {
    badgeClass: 'bg-gray-700 text-white dark:bg-gray-400 dark:text-gray-950',
    icon: <FileQuestionMarkIcon className="size-3" />,
  };
}

export function LogTypeBadge({ type, className }: { type: string; className?: string }) {
  const config = useConfigStore((state) => state.config);
  const tone = logTypeTone(type);
  let icon = tone.icon;

  if (config?.plugins) {
    const pluginKey = Object.keys(config.plugins).find((key) => {
      const pluginType = config.plugins[key].type;
      return pluginType ? type.includes(pluginType) : false;
    });

    if (pluginKey) {
      const plugin = config.plugins[pluginKey];
      if (plugin.icon) {
        icon = (
          <span className="inline-flex w-3">
            <DynamicIcon className="size-3" name={plugin.icon as IconName} />
          </span>
        );
      }
    }
  }

  return (
    <Badge variant="default" className={cn(tone.badgeClass, 'min-w-16 justify-center px-1.5 font-mono text-[10px]', className)}>
      {icon}
      {type}
    </Badge>
  );
}
