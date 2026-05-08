import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/styles';
import { ObserverEntry } from '@/hooks/use-observability';

export function SectionCards({
  onSelect,
  selected,
  data,
}: {
  data: ObserverEntry[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-4 @5xl/main:grid-cols-6">
      {data.map((item) => {
        return (
          <Card
            key={item.key}
            className={cn({
              '@container/card': true,
              'justify-between': true,
              'hover:bg-pink-500': true,
              'active:bg-pink-900': true,
              'bg-pink-700': selected === item.key,
              'dark:hover:border-pink-500': true,
              'dark:active:border-pink-900': true,
              'dark:border-pink-700': selected === item.key,
            })}
            onClick={() => onSelect(item.key)}
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl font-semibold tabular-nums @[250px]/card:text-3xl">{item.key}</CardTitle>
                {item.changed && (
                  <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 shrink-0" title="Value changed" />
                )}
              </div>
            </CardHeader>
            <CardFooter>
              <div className="truncate">
                <p className="line-clamp-[calc(var(--characters)/100)]">{`${item.value}`}</p>
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
