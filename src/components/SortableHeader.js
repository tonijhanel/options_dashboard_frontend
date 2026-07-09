import styles from './SortableHeader.module.css';

export default function SortableHeader({ label, columnKey, sortable, sortKey, direction, onSort }) {
  if (!sortable) return <th>{label}</th>;

  const isActive = sortKey === columnKey;
  return (
    <th className={styles.header} onClick={() => onSort(columnKey)}>
      {label}
      <span className={`${styles.arrow} ${isActive ? styles.active : ''}`}>
        {isActive ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  );
}