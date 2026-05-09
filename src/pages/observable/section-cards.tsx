import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="grid grid-cols-1 gap-2 px-4 lg:px-6 @xl/main:grid-cols-2 @4xl/main:grid-cols-3 @6xl/main:grid-cols-4">
      {data.map((item) => {
        const value = `${item.value}`;
        const isSelected = selected === item.key;
        return (
          <Card
            key={item.key}
            className={cn({
              'cursor-pointer gap-2 py-3 transition-colors hover:bg-muted/50': true,
              'border-primary bg-primary/5': isSelected,
            })}
            onClick={() => onSelect(item.key)}
          >
            <CardHeader className="px-3">
              <div className="flex min-w-0 items-center gap-2">
                <CardTitle className="min-w-0 truncate font-mono text-sm">{item.key}</CardTitle>
                {item.changed && (
                  <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 shrink-0" title="Value changed" />
                )}
                <Badge variant="secondary" className="ml-auto shrink-0 px-1.5 py-0 font-mono text-[10px]">
                  {item.type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-3">
              <p className="line-clamp-3 break-all font-mono text-xs text-muted-foreground">{value}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
