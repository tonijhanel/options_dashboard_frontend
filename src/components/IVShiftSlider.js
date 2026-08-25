import styles from './IVShiftSlider.module.css';

// Same slider pattern as ProfitTargetSlider.js. -20 to +20, step 5, per
// docs/calendarspreads.md's required IV-shift control - a static
// single-IV curve misrepresents a calendar's vega/term-structure risk.
export default function IVShiftSlider({ value, onChange }) {
  return (
    <div className={styles.wrap}>
      <label htmlFor="iv-shift" className={styles.label}>
        Back-leg IV shift at front expiration: <span className="num">{value > 0 ? `+${value}` : value}%</span>
      </label>
      <input
        id="iv-shift"
        type="range"
        min={-20}
        max={20}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.slider}
      />
    </div>
  );
}
