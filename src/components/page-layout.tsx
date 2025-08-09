import { PropsWithChildren } from "react";

interface PageLayoutProps {
  right?: React.ReactNode;
}

export function PageLayout({
  children,
  right,
}: PropsWithChildren<PageLayoutProps>) {
  return (
    <div className="flex flex-1 flex-row gap-2">
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {children}
          </div>
        </div>
      </div>

      {right}
    </div>
  );
}
