import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceDot, ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Same dual-line technique as RiskCurveChart.js (the CSP page's own
// expiration-vs-today chart) - solid/heavier filled Area for the expiry
// curve, lighter dashed Line for the current/today curve, ReferenceDot
// on the expiry curve at live spot. Extended with multiple breakevens
// (a calendar can have 0-2, not always exactly 1 like a naked put).
//
// Spot/breakeven marker labels can land close together on the x-axis
// (e.g. spot sitting right next to a breakeven) and overlap at recharts'
// default "top" position - stackMarkerLabels below detects clusters (by
// PRICE proximity as a % of the plotted range, a resolution-independent
// proxy for pixel proximity, since the x-axis maps that range linearly
// onto whatever width the chart actually renders at) and gives each
// marker in a cluster a progressively larger label offset so they stack
// vertically instead of drawing on top of each other.
const LABEL_CLUSTER_THRESHOLD_PCT = 0.04;
const BASE_LABEL_OFFSET = 10;
const LABEL_STACK_STEP = 18;

function stackMarkerLabels(markers, priceRange) {
  const threshold = priceRange * LABEL_CLUSTER_THRESHOLD_PCT;
  const sorted = [...markers].sort((a, b) => a.price - b.price);
  const offsets = {};
  let stack = 0;
  sorted.forEach((marker, i) => {
    if (i > 0 && marker.price - sorted[i - 1].price < threshold) {
      stack += 1;
    } else {
      stack = 0;
    }
    offsets[marker.key] = BASE_LABEL_OFFSET + stack * LABEL_STACK_STEP;
  });
  return offsets;
}

export default function CalendarEvalChart({ curve, strike, currentSpot, spotPnl, breakevens, showCurrentCurve = true }) {
  const spotPoint = currentSpot != null
    ? curve.reduce((closest, p) =>
      Math.abs(p.price - currentSpot) < Math.abs(closest.price - currentSpot) ? p : closest
    , curve[0])
    : null;

  const priceRange = curve.length > 1 ? curve[curve.length - 1].price - curve[0].price : 0;
  const markers = [
    ...(currentSpot != null ? [{ key: 'spot', price: currentSpot }] : []),
    ...(breakevens || []).map((be, i) => ({ key: `be-${i}`, price: be })),
  ];
  const labelOffsets = stackMarkerLabels(markers, priceRange);

  return (
    <ResponsiveContainer width="100%" height={420}>
      <ComposedChart data={curve} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
        <XAxis
          dataKey="price"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          stroke="var(--text-tertiary)"
        />
        <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} stroke="var(--text-tertiary)" />
        <Tooltip
          formatter={(value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          labelFormatter={(v) => `Spot: $${v}`}
        />
        <Legend />

        <ReferenceLine y={0} stroke="var(--text-tertiary)" />

        <Area
          type="monotone"
          dataKey="pnl"
          name="P&L at Front Expiration"
          stroke="var(--status-take-profit)"
          fill="var(--status-take-profit-bg)"
          strokeWidth={3}
        />
        {showCurrentCurve && (
          <Line
            type="monotone"
            dataKey="currentPnl"
            name="Theoretical P&L Today"
            stroke="var(--status-assignment)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        )}

        {strike != null && (
          <ReferenceLine x={strike} stroke="var(--text-tertiary)" strokeDasharray="4 4"
            label={{ value: `Strike ${strike}`, position: 'insideBottom', fill: 'var(--text-tertiary)', fontSize: 11 }} />
        )}

        {(breakevens || []).map((be, i) => (
          <ReferenceLine key={be} x={be} stroke="var(--accent)" strokeDasharray="4 4"
            label={{ value: `BE $${be.toFixed(2)}`, position: 'top', offset: labelOffsets[`be-${i}`], fill: 'var(--accent)', fontSize: 11 }} />
        ))}

        {currentSpot != null && (
          <>
            <ReferenceLine x={currentSpot} stroke="var(--accent)"
              label={{ value: `Spot $${currentSpot}`, position: 'top', offset: labelOffsets.spot, fill: 'var(--accent)', fontSize: 12 }} />
            {spotPoint && (
              <ReferenceDot x={spotPoint.price} y={spotPnl} r={6} fill="var(--accent)" stroke="none" />
            )}
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
