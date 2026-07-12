import { useState, useEffect } from 'react';
import { getTickers, addTicker, deleteTicker } from '../api/client';
import { LoadingView, ErrorView, EmptyView } from '../components/StateViews';
import PageHeader from '../components/PageHeader';
import SortableHeader from '../components/SortableHeader';
import ColumnPicker, { useColumnVisibility } from '../components/ColumnPicker';
import { useSortableData } from '../lib/useSortableData';
import tableStyles from '../components/Table.module.css';
import styles from './TickerRegistryPage.module.css';

const COLUMNS = [
  { key: 'ticker', label: 'Ticker', alwaysVisible: true, sortable: true, getSortValue: (r) => r.ticker },
  { key: 'group', label: 'Group', sortable: true, getSortValue: (r) => r.group },
  { key: 'target_delta', label: 'Target Delta', sortable: true, getSortValue: (r) => r.target_delta },
  { key: 'default_contracts', label: 'Contracts', sortable: true, getSortValue: (r) => r.default_contracts },
  { key: 'sector', label: 'Sector', sortable: true, getSortValue: (r) => r.sector || '' },
  { key: 'rationale', label: 'Rationale', sortable: true, getSortValue: (r) => r.rationale || '' },
];

const EMPTY_FORM = { ticker: '', group: 'A', target_delta: -0.15, default_contracts: 1, sector: '', rationale: '' };

export default function TickerRegistryPage() {
  const [tickers, setTickers] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingTicker, setEditingTicker] = useState(null); // null = "add" mode, otherwise the ticker being edited
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deletingTicker, setDeletingTicker] = useState(null);

  const { hidden, toggle, visibleColumns } = useColumnVisibility(COLUMNS, 'tickerRegistryTable');

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const result = await getTickers();
      // Backend returns {ticker: {group, target_delta, ...}} - reshape into
      // an array of rows (each carrying its own ticker) for the table/sort
      // helpers, which expect a flat list like every other table in this app.
      const rows = Object.entries(result.tickers || {}).map(([ticker, config]) => ({ ticker, ...config }));
      setTickers(rows);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const { sorted, sortKey, direction, requestSort } = useSortableData(
    tickers || [],
    (row, key) => COLUMNS.find((c) => c.key === key).getSortValue(row)
  );

  function startEdit(row) {
    setEditingTicker(row.ticker);
    setForm({
      ticker: row.ticker,
      group: row.group || 'A',
      target_delta: row.target_delta ?? -0.15,
      default_contracts: row.default_contracts ?? 1,
      sector: row.sector || '',
      rationale: row.rationale || '',
    });
    setFormError(null);
  }

  function startAdd() {
    setEditingTicker(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.ticker.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      await addTicker({
        ticker: form.ticker.trim().toUpperCase(),
        group: form.group,
        target_delta: Number(form.target_delta),
        default_contracts: Number(form.default_contracts),
        sector: form.sector || 'Broad Market',
        rationale: form.rationale,
      });
      setForm(EMPTY_FORM);
      setEditingTicker(null);
      await fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ticker) {
    setDeletingTicker(ticker);
    try {
      await deleteTicker(ticker);
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingTicker(null);
    }
  }

  if (loading && !tickers) return <LoadingView label="Loading ticker registry" />;

  return (
    <div>
      <PageHeader title="Ticker Registry" onRefresh={fetchData} refreshing={loading} />

      <p className={styles.explainer}>
        Tickers here are what Bulk Scan screens automatically every run. Add a new one, adjust an
        existing target delta or contract size, or remove one you no longer want tracked.
      </p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formTitle}>
          {editingTicker ? `Editing ${editingTicker}` : 'Add a Ticker'}
        </div>
        <div className={styles.formRow}>
          <label>
            Ticker
            <input
              type="text"
              value={form.ticker}
              onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
              disabled={!!editingTicker}
              placeholder="e.g. SCHD"
              className={styles.tickerInput}
            />
          </label>
          <label>
            Group
            <select value={form.group} onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))} className={styles.selectInput}>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </label>
          <label>
            Target Delta
            <input
              type="number" step="0.01"
              value={form.target_delta}
              onChange={(e) => setForm((f) => ({ ...f, target_delta: e.target.value }))}
              className={styles.numberInput}
            />
          </label>
          <label>
            Contracts
            <input
              type="number" min="1"
              value={form.default_contracts}
              onChange={(e) => setForm((f) => ({ ...f, default_contracts: e.target.value }))}
              className={styles.numberInput}
            />
          </label>
          <label>
            Sector
            <input
              type="text"
              value={form.sector}
              onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
              placeholder="e.g. Energy"
              className={styles.sectorInput}
            />
          </label>
        </div>
        <label className={styles.rationaleLabel}>
          Rationale
          <textarea
            value={form.rationale}
            onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
            placeholder="Why this ticker, why this delta/sizing..."
            className={styles.rationaleInput}
            rows={2}
          />
        </label>
        <div className={styles.formActions}>
          <button type="submit" className={styles.submitButton} disabled={saving || !form.ticker.trim()}>
            {saving ? 'Saving…' : editingTicker ? 'Save Changes' : 'Add Ticker'}
          </button>
          {editingTicker && (
            <button type="button" className={styles.cancelButton} onClick={startAdd}>Cancel Edit</button>
          )}
        </div>
        {formError && <div className={styles.formError}>{formError}</div>}
      </form>

      {error && <ErrorView message={error} onRetry={fetchData} />}

      {tickers && (
        sorted.length === 0 ? (
          <EmptyView message="No tickers in the registry yet - add one above." />
        ) : (
          <>
            <div className={styles.tableToolbar}>
              <ColumnPicker columns={COLUMNS} hidden={hidden} onToggle={toggle} />
            </div>
            <div className={tableStyles.tableWrap}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    {visibleColumns.map((col) => (
                      <SortableHeader
                        key={col.key}
                        label={col.label}
                        columnKey={col.key}
                        sortable={col.sortable}
                        sortKey={sortKey}
                        direction={direction}
                        onSort={requestSort}
                      />
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.ticker}>
                      {visibleColumns.map((col) => (
                        <td
                          key={col.key}
                          className={
                            col.key === 'rationale' ? tableStyles.wrapCell
                              : col.key === 'ticker' || col.key === 'group' || col.key === 'sector' ? ''
                              : 'num'
                          }
                        >
                          {col.key === 'ticker'
                            ? <span className={styles.ticker}>{row.ticker}</span>
                            : row[col.key] ?? '—'}
                        </td>
                      ))}
                      <td className={styles.actionsCell}>
                        <button className={styles.actionButton} onClick={() => startEdit(row)}>Edit</button>
                        <button
                          className={styles.deleteButton}
                          onClick={() => handleDelete(row.ticker)}
                          disabled={deletingTicker === row.ticker}
                        >
                          {deletingTicker === row.ticker ? 'Removing…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
}