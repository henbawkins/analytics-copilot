"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

export type ChartSpec = {
  type: "line" | "bar";
  title?: string;
  xKey: string;
  series: { key: string; label?: string }[];
  data: Array<Record<string, string | number>>;
};

// Kaseya brand palette (from the corporate template): indigo, purple, cyan,
// teal, sky. Used on both the dark chat UI and the light PDF report.
const COLORS = ["#3e3cff", "#994ffa", "#34beef", "#09cea8", "#12a7e1"];

/** Parse a fenced ```chart JSON block; returns null if invalid. */
export function parseChartSpec(raw: string): ChartSpec | null {
  try {
    const spec = JSON.parse(raw);
    if (
      (spec.type === "line" || spec.type === "bar") &&
      typeof spec.xKey === "string" &&
      Array.isArray(spec.series) &&
      Array.isArray(spec.data)
    ) {
      return spec as ChartSpec;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export default function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const axisProps = {
    stroke: "#9aa3b2",
    fontSize: 12,
    tickLine: false,
  };

  return (
    <div className="chart-card">
      {spec.title && <div className="chart-title">{spec.title}</div>}
      <ResponsiveContainer width="100%" height={260}>
        {spec.type === "line" ? (
          <LineChart data={spec.data}>
            <CartesianGrid stroke="#262c3a" strokeDasharray="3 3" />
            <XAxis dataKey={spec.xKey} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip
              contentStyle={{
                background: "#141821",
                border: "1px solid #262c3a",
                borderRadius: 8,
                color: "#e6e9ef",
              }}
            />
            <Legend />
            {spec.series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={spec.data}>
            <CartesianGrid stroke="#262c3a" strokeDasharray="3 3" />
            <XAxis dataKey={spec.xKey} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip
              cursor={{ fill: "#1b2030" }}
              contentStyle={{
                background: "#141821",
                border: "1px solid #262c3a",
                borderRadius: 8,
                color: "#e6e9ef",
              }}
            />
            <Legend />
            {spec.series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label ?? s.key}
                fill={COLORS[i % COLORS.length]}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
