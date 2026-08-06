import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceDot, ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Same recharts pattern as BwbEvalChart.js/RiskCurveChart.js - a standard
// vertical credit spread's payoff has just two kink points (the two
// strikes) instead of a BWB's three legs, so this is simpler: flat at
// net_credit above short_strike, linear ramp down to -max_loss at
// long_strike, flat below that.
export default function CreditSpreadEvalChart({
  curve, shortStrike, longStrike, currentSpot, spotPnl, totalMaxProfit, totalMaxLoss, breakeven,
}) {
  return (
    <ResponsiveContainer width="100%" height={420}>
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
          name="Expiration P&L"
          stroke="var(--accent)"
          fill="var(--accent)"
          fillOpacity={0.15}
          strokeWidth={3}
        />

        <ReferenceLine x={longStrike} stroke="var(--negative)" strokeDasharray="4 4"
          label={{ value: `Long ${longStrike}`, position: 'insideBottomLeft', fill: 'var(--negative)', fontSize: 11 }} />
        <ReferenceLine x={shortStrike} stroke="var(--positive)" strokeDasharray="4 4"
          label={{ value: `Short ${shortStrike}`, position: 'insideBottomRight', fill: 'var(--positive)', fontSize: 11 }} />

        <ReferenceLine y={totalMaxProfit} stroke="var(--positive)" strokeDasharray="2 2"
          label={{ value: `Max Profit $${totalMaxProfit.toFixed(0)}`, position: 'insideTopLeft', fill: 'var(--positive)', fontSize: 11 }} />
        <ReferenceLine y={-totalMaxLoss} stroke="var(--negative)" strokeDasharray="2 2"
          label={{ value: `Max Loss -$${totalMaxLoss.toFixed(0)}`, position: 'insideBottomLeft', fill: 'var(--negative)', fontSize: 11 }} />

        <ReferenceLine x={breakeven} stroke="var(--accent)" strokeDasharray="2 2"
          label={{ value: `Breakeven $${breakeven.toFixed(2)}`, position: 'top', fill: 'var(--accent)', fontSize: 12 }} />

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
