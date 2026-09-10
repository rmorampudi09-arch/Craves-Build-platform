import type { HourlyActivity } from "@/lib/delivery-contract";
import { formatDateTime, formatTime } from "@/lib/format";

export function ActivityChart({ points, bucketUnit }: { points: HourlyActivity[]; bucketUnit: "hour" | "day" | "week" | "month" }) {
  const visible = points;
  const max = Math.max(1, ...visible.map(point => point.commandCount + point.deliveryEventCount));
  const width = 720;
  const height = 180;
  const slot = width / Math.max(1, visible.length);

  return (
    <div className="chart-wrap" role="img" aria-label={`Delivery command and normalized event activity by ${bucketUnit}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="activity-svg" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75, 1].map(level => (
          <line key={level} x1="0" x2={width} y1={height - height * level} y2={height - height * level} className="chart-grid" />
        ))}
        {visible.map((point, index) => {
          const commands = (point.commandCount / max) * (height - 18);
          const events = (point.deliveryEventCount / max) * (height - 18);
          const x = index * slot + slot * 0.14;
          const bar = slot * 0.28;
          return (
            <g key={point.bucketStart}>
              <title>{formatDateTime(point.bucketStart)} IST · {point.commandCount} commands · {point.deliveryEventCount} events</title>
              <rect x={x} y={height - commands} width={bar} height={commands} rx="3" className="chart-command" />
              <rect x={x + bar + slot * 0.06} y={height - events} width={bar} height={events} rx="3" className="chart-event" />
            </g>
          );
        })}
      </svg>
      <div className="chart-axis">
        {visible.filter((_, index) => index % Math.max(1, Math.floor(visible.length / 5)) === 0).map(point => (
          <span key={point.bucketStart}>{bucketUnit === "hour" && visible.length <= 24 ? formatTime(point.bucketStart).slice(0, 5)
            : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: bucketUnit === "month" ? undefined : "2-digit", month: "short", year: "2-digit" }).format(new Date(point.bucketStart))}</span>
        ))}
      </div>
      <div className="chart-legend">
        <span><i className="legend-swatch legend-command" /> Commands</span>
        <span><i className="legend-swatch legend-event" /> Status events</span>
      </div>
    </div>
  );
}
