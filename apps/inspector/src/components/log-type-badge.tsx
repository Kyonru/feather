import { CircleXIcon, FeatherIcon, FileClockIcon, FileQuestionMarkIcon } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import type { ReactNode } from 'react';
import { Badge } from '@feather/ui/badge';
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

/**
 * Badges are tinted chips rather than solid fills.
 *
 * The fills they replaced (`bg-red-700 text-white dark:bg-red-400
 * dark:text-red-950`) hand-picked a pair per mode and had no contrast guarantee
 * on any of the themes Feather ships. The chip pairing does: the theme test
 * asserts every `--<state>` clears AA on its own `--<state>-surface`.
 *
 * It also reads better where it matters. Dozens of these stack in the log list,
 * and a column of solid saturated blocks is the shouting chrome that makes a
 * genuine error harder to pick out, not easier.
 */
function logTypeTone(type: string): LogTypeTone {
  if (type === 'output') {
    return {
      badgeClass: 'bg-info-surface text-info border-info-border',
      icon: <FileClockIcon className="size-3" />,
    };
  }

  if (type === 'error' || type === 'fatal') {
    return {
      badgeClass: 'bg-danger-surface text-danger border-danger-border',
      icon: <CircleXIcon className="size-3" />,
    };
  }

  // Runtime lifecycle. A game that started and finished is healthy, so this is
  // an ok signal — the amber it used to wear implied a problem that is not there.
  if (isFeatherEvent(type)) {
    return {
      badgeClass: 'bg-ok-surface text-ok border-ok-border',
      icon: <FeatherIcon className="size-3" />,
    };
  }

  // Unrecognized types carry no state, so they stay chrome.
  return {
    badgeClass: 'bg-muted text-muted-foreground border-border',
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
