import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceDot, ReferenceLine, ResponsiveContainer,
} from 'recharts';

// Port of docs/bwb_eval.md's reference generate_bwb_chart (Plotly, from
// Toni's notebook) onto recharts - the charting library already used
// elsewhere in this app (RiskCurveChart.js), not a new dependency. Single-
// tone P&L area + a ReferenceLine at y=0 (RiskCurveChart's own convention)
// rather than Plotly's two-tone red/green fill-by-sign, which recharts
// doesn't support as directly.
export default function BwbEvalChart({
  curve, longLowStrike, shortMidStrike, longHighStrike, currentSpot, spotPnl,
  totalMaxProfit, totalMaxLoss, guaranteedProfit, downsideBreakeven, isRiskFree,
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

        <ReferenceLine x={longLowStrike} stroke="var(--negative)" strokeDasharray="4 4"
          label={{ value: `Low ${longLowStrike}`, position: 'insideBottomLeft', fill: 'var(--negative)', fontSize: 11 }} />
        <ReferenceLine x={shortMidStrike} stroke="var(--positive)" strokeDasharray="4 4"
          label={{ value: `Short ${shortMidStrike}`, position: 'insideBottom', fill: 'var(--positive)', fontSize: 11 }} />
        <ReferenceLine x={longHighStrike} stroke="var(--text-tertiary)" strokeDasharray="4 4"
          label={{ value: `High ${longHighStrike}`, position: 'insideBottomRight', fill: 'var(--text-tertiary)', fontSize: 11 }} />

        <ReferenceLine y={totalMaxProfit} stroke="var(--positive)" strokeDasharray="2 2"
          label={{ value: `Max Profit $${totalMaxProfit.toFixed(0)}`, position: 'insideTopLeft', fill: 'var(--positive)', fontSize: 11 }} />

        {isRiskFree ? (
          <ReferenceLine y={guaranteedProfit} stroke="var(--accent)" strokeDasharray="2 2"
            label={{ value: `Guaranteed Floor $${guaranteedProfit.toFixed(0)}`, position: 'insideBottomLeft', fill: 'var(--accent)', fontSize: 11 }} />
        ) : (
          <ReferenceLine y={-totalMaxLoss} stroke="var(--negative)" strokeDasharray="2 2"
            label={{ value: `Max Loss -$${totalMaxLoss.toFixed(0)}`, position: 'insideBottomLeft', fill: 'var(--negative)', fontSize: 11 }} />
        )}

        {!isRiskFree && downsideBreakeven != null && (
          <ReferenceLine x={downsideBreakeven} stroke="var(--accent)" strokeDasharray="2 2"
            label={{ value: `Breakeven $${downsideBreakeven.toFixed(2)}`, position: 'top', fill: 'var(--accent)', fontSize: 12 }} />
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
