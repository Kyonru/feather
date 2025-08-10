import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SectionCards({
  onSelect,
  selected,
  data,
}: {
  data: Record<string, any>[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-2 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-5 @5xl/main:grid-cols-8">
      {data.map((item) => {
        return (
          <Card
            key={item.key}
            className={cn({
              "@container/card": true,
              "hover:bg-pink-500": true,
              "active:bg-pink-900": true,
              "bg-pink-700": selected === item.key,
            })}
            onClick={() => onSelect(item.key)}
          >
            <CardHeader>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {item.key}
              </CardTitle>
            </CardHeader>
            <CardFooter>
              <div className="truncate">
                <p className="line-clamp-[calc(var(--characters)/100)]">
                  {`${item.value}`}
                </p>
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
