import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceDot, ReferenceLine, ResponsiveContainer,
} from 'recharts';

export default function RiskCurveChart({ curve, spot, breakeven }) {
  const spotPoint = curve.reduce((closest, p) =>
    Math.abs(p.price - spot) < Math.abs(closest.price - spot) ? p : closest
  , curve[0]);

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
        <YAxis
          tickFormatter={(v) => `$${v.toLocaleString()}`}
          stroke="var(--text-tertiary)"
        />
        <Tooltip
          formatter={(value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          labelFormatter={(v) => `Price: $${v}`}
        />
        <Legend />
        <ReferenceLine y={0} stroke="var(--text-tertiary)" />
        <Area
          type="monotone"
          dataKey="atExpiration"
          name="At Expiration P/L"
          stroke="var(--status-take-profit)"
          fill="var(--status-take-profit-bg)"
          strokeWidth={3}
        />
        <Line
          type="monotone"
          dataKey="theoreticalToday"
          name="Theoretical P/L Today"
          stroke="var(--status-assignment)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
        />
        <ReferenceDot x={spotPoint.price} y={spotPoint.atExpiration} r={6} fill="var(--negative)" stroke="none" />
        <ReferenceLine x={breakeven} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: `Breakeven $${breakeven.toFixed(2)}`, position: 'top', fill: 'var(--accent)', fontSize: 12 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}