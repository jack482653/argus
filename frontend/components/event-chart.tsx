"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { EventTimeseries } from "@/types/responses/events";

interface EventChartProps {
  timeseries: EventTimeseries;
}

export function EventChart({ timeseries }: EventChartProps) {
  // Recharts' category x-axis derives its domain purely from the plotted
  // data, ignoring an explicit `domain` prop — so a ReferenceLine for a date
  // outside `labels` (e.g. an upcoming event's start date) is silently
  // discarded unless that date is itself a row in `data`. Add it as an
  // otherwise-empty row so the axis includes it, connecting the surrounding
  // line across the gap.
  const labels =
    timeseries.start_marker_label !== null &&
    !timeseries.labels.includes(timeseries.start_marker_label)
      ? [...timeseries.labels, timeseries.start_marker_label].sort()
      : timeseries.labels;

  const data = labels.map((label) => {
    const point: Record<string, string | number> = { label };
    const index = timeseries.labels.indexOf(label);
    if (index !== -1) {
      for (const dataset of timeseries.datasets) {
        point[dataset.name] = dataset.data[index];
      }
    }
    return point;
  });

  const config: ChartConfig = Object.fromEntries(
    timeseries.datasets.map((dataset, index) => [
      dataset.name,
      { label: dataset.name, color: `var(--chart-${(index % 5) + 1})` },
    ]),
  );

  return (
    <ChartContainer config={config} className="h-80 w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {timeseries.event.capacity !== null && (
          <ReferenceLine
            y={timeseries.event.capacity}
            strokeDasharray="4 4"
            label="Capacity"
            ifOverflow="extendDomain"
          />
        )}
        {timeseries.start_marker_label !== null && (
          <ReferenceLine
            x={timeseries.start_marker_label}
            strokeDasharray="4 4"
            label="Event start"
          />
        )}
        {timeseries.datasets.map((dataset) => (
          <Line
            key={dataset.name}
            dataKey={dataset.name}
            stroke={`var(--color-${dataset.name})`}
            strokeWidth={dataset.name === "Total" ? 2 : 1}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
