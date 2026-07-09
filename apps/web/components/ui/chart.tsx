'use client';

import * as React from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';

import { cn } from '@/lib/utils';

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

type ChartContextProps = {
  config: ChartConfig;
};

type ChartResponsiveContainerProps = {
  children?: React.ReactNode;
};

type ChartTooltipPayloadItem = {
  dataKey?: string | number;
  name?: React.ReactNode;
  value?: React.ReactNode;
};

type ChartTooltipContentProps = {
  active?: boolean;
  className?: string;
  payload?: ChartTooltipPayloadItem[];
};

type ChartTooltipProps = {
  content?: React.ReactNode;
} & Record<string, unknown>;

const ChartContext = React.createContext<ChartContextProps | null>(null);
const ChartResponsiveContainer =
  ResponsiveContainer as unknown as React.ComponentType<ChartResponsiveContainerProps>;

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error('useChart must be used inside a <ChartContainer />');
  }
  return context;
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const entries = Object.entries(config).filter(([, item]) => item.color);
  if (!entries.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: entries
          .map(
            ([key, item]) =>
              `[data-chart="${id}"] { --color-${key}: ${item.color}; }`,
          )
          .join('\n'),
      }}
    />
  );
}

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig;
    children: React.ReactNode;
  }
>(({ id, className, config, children, ...props }, ref) => {
  const chartId = React.useId().replace(/:/g, '');
  const safeId = `chart-${id || chartId}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn(
          'flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-border/50 [&_.recharts-reference-line_[stroke="#ccc"]]:stroke-border [&_.recharts-sector[stroke="#fff"]]:stroke-transparent [&_.recharts-surface]:outline-hidden [&_.recharts-tooltip-cursor]:stroke-border',
          className,
        )}
        data-chart={safeId}
        ref={ref}
        {...props}
      >
        <ChartStyle config={config} id={safeId} />
        <ChartResponsiveContainer>{children}</ChartResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = 'ChartContainer';

export const ChartTooltip =
  Tooltip as unknown as React.ComponentType<ChartTooltipProps>;

export function ChartTooltipContent({
  active,
  payload,
  className,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!(active && payload?.length)) {
    return null;
  }

  return (
    <div
      className={cn(
        'grid min-w-32 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl',
        className,
      )}
    >
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name ?? 'value');
        const label = config[key]?.label ?? key;
        return (
          <div className="flex items-center justify-between gap-2" key={key}>
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium font-mono">{item.value}</span>
          </div>
        );
      })}
    </div>
  );
}
