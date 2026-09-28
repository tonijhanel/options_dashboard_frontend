import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceDot, ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Combined iron-condor view - same idea as CreditSpreadEvalChart.js but
// for the SUMMED curve of a put spread + call spread sharing a
// strategy_group (see ActiveSpreadsPage.js's CombinedIronCondorChartPanel),
// so all 4 strikes get their own reference line instead of just 2. No
// breakeven lines (an IC has two, and they're less useful here than on a
// single spread's chart - the combined shape's flat profit plateau
// between the two short strikes already makes the breakevens visually
// obvious without labeling them).
export default function CombinedSpreadChart({
  curve, putShortStrike, putLongStrike, callShortStrike, callLongStrike, currentSpot, spotPnl, totalMaxProfit, totalMaxLoss,
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
          name="Combined Expiration P&L"
          stroke="var(--accent)"
          fill="var(--accent)"
          fillOpacity={0.15}
          strokeWidth={3}
        />

        <ReferenceLine x={putLongStrike} stroke="var(--negative)" strokeDasharray="4 4"
          label={{ value: `Put Long ${putLongStrike}`, position: 'insideBottomLeft', fill: 'var(--negative)', fontSize: 10 }} />
        <ReferenceLine x={putShortStrike} stroke="var(--positive)" strokeDasharray="4 4"
          label={{ value: `Put Short ${putShortStrike}`, position: 'insideBottomLeft', fill: 'var(--positive)', fontSize: 10 }} />
        <ReferenceLine x={callShortStrike} stroke="var(--positive)" strokeDasharray="4 4"
          label={{ value: `Call Short ${callShortStrike}`, position: 'insideBottomRight', fill: 'var(--positive)', fontSize: 10 }} />
        <ReferenceLine x={callLongStrike} stroke="var(--negative)" strokeDasharray="4 4"
          label={{ value: `Call Long ${callLongStrike}`, position: 'insideBottomRight', fill: 'var(--negative)', fontSize: 10 }} />

        <ReferenceLine y={totalMaxProfit} stroke="var(--positive)" strokeDasharray="2 2"
          label={{ value: `Max Profit $${totalMaxProfit.toFixed(0)}`, position: 'insideTopLeft', fill: 'var(--positive)', fontSize: 11 }} />
        <ReferenceLine y={-totalMaxLoss} stroke="var(--negative)" strokeDasharray="2 2"
          label={{ value: `Max Loss -$${totalMaxLoss.toFixed(0)}`, position: 'insideBottomLeft', fill: 'var(--negative)', fontSize: 11 }} />

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
