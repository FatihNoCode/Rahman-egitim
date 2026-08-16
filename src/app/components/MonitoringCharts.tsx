import { useRef, useState } from 'react';

interface DailyPoint {
  date: string; // 'YYYY-MM-DD'
  count: number;
}

interface BarChartProps {
  data: DailyPoint[];
  color: string;
  label: string;
  locale: 'nl-NL' | 'tr-TR';
  formatValue?: (n: number) => string;
}

// Rounds a chart's max value up to a clean tick (1, 2, 5 x 10^n) so the
// y-axis reads 0 / 10 / 20 instead of 0 / 13.4 / 26.8.
function niceMax(value: number): number {
  if (value <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

const HEIGHT = 160;
const PAD_LEFT = 34;
const PAD_BOTTOM = 20;
const PAD_TOP = 10;

export default function MonitoringBarChart({ data, color, label, locale, formatValue }: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  const fmt = formatValue ?? ((n: number) => n.toLocaleString(locale));
  const max = niceMax(Math.max(...data.map((d) => d.count), 0));
  const chartWidth = Math.max(data.length * 26, 280);
  const plotWidth = chartWidth - PAD_LEFT - 8;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const barSlot = plotWidth / data.length;
  const barWidth = Math.min(24, barSlot * 0.6);

  const yFor = (count: number) => PAD_TOP + plotHeight - (count / max) * plotHeight;
  const gridValues = [0, max / 2, max];

  const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const handleEnter = (index: number, e: React.MouseEvent) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ index, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <div ref={containerRef} className="relative">
      <svg
        viewBox={`0 0 ${chartWidth} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={label}
        preserveAspectRatio="xMinYMid meet"
      >
        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              x2={chartWidth - 4}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="#e1e0d9"
              strokeWidth={1}
            />
            <text x={PAD_LEFT - 6} y={yFor(v) + 3} textAnchor="end" fontSize={9} fill="#898781">
              {Math.round(v).toLocaleString(locale)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD_LEFT + i * barSlot + (barSlot - barWidth) / 2;
          const y = yFor(d.count);
          const h = PAD_TOP + plotHeight - y;
          const showLabel = i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2);
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={h === 0 ? y - 1 : y}
                width={barWidth}
                height={Math.max(h, h === 0 ? 1 : h)}
                rx={4}
                fill={color}
                opacity={hover?.index === i ? 1 : 0.85}
                tabIndex={0}
                role="button"
                aria-label={`${dayLabel(d.date)}: ${fmt(d.count)}`}
                onMouseEnter={(e) => handleEnter(i, e)}
                onMouseMove={(e) => handleEnter(i, e)}
                onMouseLeave={() => setHover(null)}
                onFocus={(e) => {
                  const box = containerRef.current?.getBoundingClientRect();
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  if (!box) return;
                  setHover({ index: i, x: rect.left - box.left + rect.width / 2, y: rect.top - box.top });
                }}
                onBlur={() => setHover(null)}
              >
                <title>{`${dayLabel(d.date)}: ${fmt(d.count)}`}</title>
              </rect>
              {showLabel && (
                <text x={x + barWidth / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={9} fill="#898781">
                  {dayLabel(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          <span className="font-semibold">{fmt(data[hover.index].count)}</span>
          <span className="ml-1 text-gray-300">{dayLabel(data[hover.index].date)}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>{locale === 'tr-TR' ? 'Tarih' : 'Datum'}</th>
            <th>{locale === 'tr-TR' ? 'Değer' : 'Waarde'}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{dayLabel(d.date)}</td>
              <td>{fmt(d.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
