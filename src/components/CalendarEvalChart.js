import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceDot, ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Same dual-line technique as RiskCurveChart.js (the CSP page's own
// expiration-vs-today chart) - solid/heavier filled Area for the expiry
// curve, lighter dashed Line for the current/today curve, ReferenceDot
// on the expiry curve at live spot. Extended with: multiple breakevens
// (a calendar can have 0-2, not always exactly 1 like a naked put), and
// an optional "Show legs" debug overlay (negIntrinsicShort/
// longLegValueAtFrontExp) - docs/calendarchart.md.
export default function CalendarEvalChart({ curve, strike, currentSpot, spotPnl, breakevens, showLegs, showCurrentCurve = true }) {
  const spotPoint = currentSpot != null
    ? curve.reduce((closest, p) =>
      Math.abs(p.price - currentSpot) < Math.abs(closest.price - currentSpot) ? p : closest
    , curve[0])
    : null;

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

        {showLegs && (
          <>
            <Line
              type="monotone"
              dataKey="negIntrinsicShort"
              name="-Intrinsic (Short Leg)"
              stroke="var(--negative)"
              strokeWidth={1.5}
              strokeDasharray="2 2"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="longLegValueAtFrontExp"
              name="Long Leg Value"
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="2 2"
              dot={false}
            />
          </>
        )}

        {strike != null && (
          <ReferenceLine x={strike} stroke="var(--text-tertiary)" strokeDasharray="4 4"
            label={{ value: `Strike ${strike}`, position: 'insideBottom', fill: 'var(--text-tertiary)', fontSize: 11 }} />
        )}

        {(breakevens || []).map((be) => (
          <ReferenceLine key={be} x={be} stroke="var(--accent)" strokeDasharray="4 4"
            label={{ value: `BE $${be.toFixed(2)}`, position: 'top', fill: 'var(--accent)', fontSize: 11 }} />
        ))}

        {currentSpot != null && (
          <>
            <ReferenceLine x={currentSpot} stroke="var(--accent)"
              label={{ value: `Spot $${currentSpot}`, position: 'top', fill: 'var(--accent)', fontSize: 12 }} />
            {spotPoint && (
              <ReferenceDot x={spotPoint.price} y={spotPnl} r={6} fill="var(--accent)" stroke="none" />
            )}
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
