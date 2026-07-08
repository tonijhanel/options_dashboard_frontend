import styles from './ProfitTargetSlider.module.css';

export default function ProfitTargetSlider({ value, onChange }) {
  return (
    <div className={styles.wrap}>
      <label htmlFor="profit-target" className={styles.label}>
        Take-profit target: <span className="num">{value}%</span>
      </label>
      <input
        id="profit-target"
        type="range"
        min={10}
        max={95}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.slider}
      />
    </div>
  );
}
