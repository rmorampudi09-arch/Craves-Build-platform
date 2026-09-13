import type { HourlyActivity } from "@/lib/delivery-contract";
import { formatDateTime } from "@/lib/format";
import { activityBuckets } from "@/lib/delivery-history";

export function ActivityChart({ points }: { points: HourlyActivity[] }) {
  const visible = activityBuckets(points);
  const max = Math.max(1, ...visible.map(point => point.commandCount + point.deliveryEventCount));
  const width = 720;
  const height = 180;
  const slot = width / Math.max(1, visible.length);
  if (!visible.length) return <div className="empty-state">No activity in the selected period.</div>;

  return (
    <div className="chart-wrap" role="img" aria-label={`Delivery activity across the entire selected period: ${visible.reduce((sum, p) => sum + p.commandCount, 0)} commands and ${visible.reduce((sum, p) => sum + p.deliveryEventCount, 0)} status events`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="activity-svg" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75, 1].map(level => (
          <line key={level} x1="0" x2={width} y1={height - height * level} y2={height - height * level} className="chart-grid" />
        ))}
        {visible.map((point, index) => {
          const commands = point.commandCount ? Math.max(2, (point.commandCount / max) * (height - 18)) : 0;
          const events = point.deliveryEventCount ? Math.max(2, (point.deliveryEventCount / max) * (height - 18)) : 0;
          const x = index * slot + slot * 0.14;
          const bar = Math.max(3, slot * 0.28);
          return (
            <g key={point.bucketStart}>
              <title>{formatDateTime(point.bucketStart)} – {formatDateTime(point.bucketEnd)} IST: {point.commandCount} commands, {point.deliveryEventCount} events</title>
              <rect x={x} y={height - commands} width={bar} height={commands} rx="3" className="chart-command" />
              <rect x={x + bar + 2} y={height - events} width={bar} height={events} rx="3" className="chart-event" />
            </g>
          );
        })}
      </svg>
      <div className="chart-axis">
        {visible.filter((_, index) => index % Math.max(1, Math.floor(visible.length / 5)) === 0).map(point => (
          <span key={point.bucketStart}>{formatDateTime(point.bucketStart)}</span>
        ))}
      </div>
      <div className="chart-legend">
        <span><i className="legend-swatch legend-command" /> Commands</span>
        <span><i className="legend-swatch legend-event" /> Status events</span>
      </div>
    </div>
  );
}
