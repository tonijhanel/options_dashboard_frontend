import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceDot, ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Same recharts pattern as BwbEvalChart.js/CreditSpreadEvalChart.js -
// single-tone P&L area + a ReferenceLine at y=0. Simpler than BWB's (one
// strike, no flat max-profit/max-loss lines - a calendar's curve has no
// algebraic asymptote, so curveMaxProfit/curveMaxLoss are just the
// curve's own min/max, not guaranteed figures worth drawing a
// reference line at).
export default function CalendarEvalChart({ curve, strike, currentSpot, spotPnl, title }) {
  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart data={curve} margin={{ top: 30, right: 30, left: 10, bottom: 10 }}>
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

        <ReferenceLine y={0} stroke="var(--text-tertiary)" />
        <Area
          type="monotone"
          dataKey="pnl"
          name={title || 'P&L at front expiration'}
          stroke="var(--accent)"
          fill="var(--accent)"
          fillOpacity={0.15}
          strokeWidth={3}
        />

        {strike != null && (
          <ReferenceLine x={strike} stroke="var(--text-tertiary)" strokeDasharray="4 4"
            label={{ value: `Strike ${strike}`, position: 'insideBottom', fill: 'var(--text-tertiary)', fontSize: 11 }} />
        )}

        {currentSpot != null && (
          <>
            <ReferenceLine x={currentSpot} stroke="var(--accent)"
              label={{ value: `Spot $${currentSpot}`, position: 'top', fill: 'var(--accent)', fontSize: 12 }} />
            <ReferenceDot x={currentSpot} y={spotPnl} r={6} fill="var(--accent)" stroke="none" />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
