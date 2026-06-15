/**
 * Combo Tuner Panel
 *
 * A read-only tuning assistant that evaluates and recommends tPower, dPower, and FF
 * changes for engine combo definitions. Uses historical event run data to minimize
 * long-term corrected performance spread between combos.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  parityApi,
  type ComboTunerAnalyzeResponse,
  type ComboTunerRecommendResponse,
  type ComboTunerEvaluateResponse,
  type ComboTunerOverrides,
} from '../../services/parityApi';
import './ComboTunerPanel.css';

const SERIES_COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee', '#a3e635'];

const ENGINE_COMBO_CATEGORIES = ['Top Fuel', 'Funny Car', 'Pro Stock', 'Pro Stock Motorcycle', 'Pro Mod', 'Top Alcohol Dragster', 'Top Alcohol Funny Car'] as const;

interface ComboTunerPanelProps {
  engineCombos: Array<{
    id: number;
    name: string;
    category: string | null;
    t_power: number;
    d_power: number;
    friction_factor: number;
  }>;
}

export function ComboTunerPanel({ engineCombos }: ComboTunerPanelProps) {
  // Controls state
  const [category, setCategory] = useState<string>(ENGINE_COMBO_CATEGORIES[0]);
  const [eventWindow, setEventWindow] = useState<'previous20' | 'currentSeason' | 'custom'>('previous20');
  const [customEventCount, setCustomEventCount] = useState<number>(20);
  const [metric, setMetric] = useState<'quickest' | 'avg2' | 'avg4'>('quickest');
  const [minEventsPerCombo, setMinEventsPerCombo] = useState<number>(3);
  const [minCombosPerEvent, setMinCombosPerEvent] = useState<number>(2);
  const [anchorComboId, setAnchorComboId] = useState<number | null>(null);
  const [targetComboId, setTargetComboId] = useState<number | null>(null);
  const [lockTPower, setLockTPower] = useState<boolean>(false);
  const [lockDPower, setLockDPower] = useState<boolean>(false);
  const [lockFF, setLockFF] = useState<boolean>(false);

  // Results state
  const [analyzeResult, setAnalyzeResult] = useState<ComboTunerAnalyzeResponse | null>(null);
  const [recommendResult, setRecommendResult] = useState<ComboTunerRecommendResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Manual-edit / what-if state
  const [editParams, setEditParams] = useState<ComboTunerOverrides>({});
  const [evalResult, setEvalResult] = useState<ComboTunerEvaluateResponse | null>(null);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [parityView, setParityView] = useState<'proposed' | 'current'>('proposed');
  const evalTimer = useRef<number | null>(null);

  // Filter combos for current category
  const categoryCombos = engineCombos.filter(c => c.category === category);

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError('');
    setRecommendResult(null);
    try {
      const result = await parityApi.comboTunerAnalyze({
        category,
        eventWindow,
        customEventCount: eventWindow === 'custom' ? customEventCount : undefined,
        metric,
        minEventsPerCombo,
        minCombosPerEvent,
        anchorComboId: anchorComboId ?? undefined,
        targetComboId: targetComboId ?? undefined,
        lockTPower,
        lockDPower,
        lockFF,
      });
      setAnalyzeResult(result);
    } catch (e: any) {
      setError(e.message || 'Analysis failed');
    }
    setLoading(false);
  }, [category, eventWindow, customEventCount, metric, minEventsPerCombo, minCombosPerEvent, anchorComboId, targetComboId, lockTPower, lockDPower, lockFF]);

  const handleRecommend = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await parityApi.comboTunerRecommend({
        category,
        eventWindow,
        customEventCount: eventWindow === 'custom' ? customEventCount : undefined,
        metric,
        minEventsPerCombo,
        minCombosPerEvent,
        anchorComboId: anchorComboId ?? undefined,
        targetComboId: targetComboId ?? undefined,
        lockTPower,
        lockDPower,
        lockFF,
      });
      const seed: ComboTunerOverrides = {};
      result.recommendations.forEach(r => {
        seed[r.comboId] = { t: r.proposedTPower, d: r.proposedDPower, ff: r.proposedFF };
      });
      setEditParams(seed);
      setEvalResult(null);
      setRecommendResult(result);
      setAnalyzeResult(result); // Also show analyze data
    } catch (e: any) {
      setError(e.message || 'Recommendation failed');
    }
    setLoading(false);
  }, [category, eventWindow, customEventCount, metric, minEventsPerCombo, minCombosPerEvent, anchorComboId, targetComboId, lockTPower, lockDPower, lockFF]);

  // Update a single edited parameter (debounced re-evaluation happens via effect)
  const updateEditParam = useCallback((comboId: number, key: 't' | 'd' | 'ff', value: number) => {
    setEditParams(prev => ({
      ...prev,
      [comboId]: { ...(prev[comboId] ?? { t: 0, d: 0, ff: 0 }), [key]: value },
    }));
  }, []);

  // Reset edits back to the optimizer's recommendation
  const resetEdits = useCallback(() => {
    if (!recommendResult) return;
    const seed: ComboTunerOverrides = {};
    recommendResult.recommendations.forEach(r => {
      seed[r.comboId] = { t: r.proposedTPower, d: r.proposedDPower, ff: r.proposedFF };
    });
    setEditParams(seed);
    setEvalResult(null);
  }, [recommendResult]);

  // Debounced what-if evaluation whenever the user edits proposed params
  useEffect(() => {
    if (!recommendResult || Object.keys(editParams).length === 0) return;
    if (evalTimer.current) window.clearTimeout(evalTimer.current);
    evalTimer.current = window.setTimeout(async () => {
      setEvaluating(true);
      try {
        const res = await parityApi.comboTunerEvaluate({
          category,
          eventWindow,
          customEventCount: eventWindow === 'custom' ? customEventCount : undefined,
          metric,
          minEventsPerCombo,
          minCombosPerEvent,
          overrides: editParams,
        });
        setEvalResult(res);
      } catch (e: any) {
        setError(e.message || 'Evaluation failed');
      }
      setEvaluating(false);
    }, 450);
    return () => { if (evalTimer.current) window.clearTimeout(evalTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParams, recommendResult, category, eventWindow, customEventCount, metric, minEventsPerCombo, minCombosPerEvent]);

  // Format number for display
  const fmt = (v: number | null | undefined, decimals = 4) => {
    if (v == null) return '—';
    return v.toFixed(decimals);
  };

  // After-residual per combo, preferring the live what-if evaluation
  const evalByCombo = useMemo(() => {
    const map = new Map<number, number>();
    evalResult?.combos.forEach(c => map.set(c.comboId, c.avgResidualAfter));
    return map;
  }, [evalResult]);

  // Build chart data for residual comparison (after = live eval if present)
  const chartData = recommendResult?.recommendations.map(r => ({
    combo: r.comboName,
    before: r.avgResidualBefore,
    after: evalByCombo.get(r.comboId) ?? r.avgResidualAfter,
  })) ?? [];

  // Long-term parity series (current vs proposed/edited)
  const comboLabels = recommendResult?.comboLabels ?? [];
  const paritySeries = parityView === 'current'
    ? (recommendResult?.seriesCurrent ?? [])
    : (evalResult?.seriesProposed ?? recommendResult?.seriesProposed ?? []);
  const effectiveProposedStats = evalResult?.evalStats ?? recommendResult?.proposedStats;

  return (
    <div className="combo-tuner-panel">
      {/* Controls Section */}
      <div className="combo-tuner-controls">
        <div className="control-row">
          <div className="control-field">
            <label>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {ENGINE_COMBO_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="control-field">
            <label>Event Window</label>
            <select value={eventWindow} onChange={e => setEventWindow(e.target.value as any)}>
              <option value="previous20">Previous 20 Events</option>
              <option value="currentSeason">Current Season</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {eventWindow === 'custom' && (
            <div className="control-field">
              <label>Event Count</label>
              <input
                type="number"
                min={1}
                max={100}
                value={customEventCount}
                onChange={e => setCustomEventCount(parseInt(e.target.value) || 20)}
              />
            </div>
          )}

          <div className="control-field">
            <label>Metric</label>
            <select value={metric} onChange={e => setMetric(e.target.value as any)}>
              <option value="quickest">Quickest Run</option>
              <option value="avg2">Average of Best 2</option>
              <option value="avg4">Average of Best 4</option>
            </select>
          </div>
        </div>

        <div className="control-row">
          <div className="control-field">
            <label>Min Events per Combo</label>
            <input
              type="number"
              min={1}
              max={20}
              value={minEventsPerCombo}
              onChange={e => setMinEventsPerCombo(parseInt(e.target.value) || 3)}
            />
          </div>

          <div className="control-field">
            <label>Min Combos per Event</label>
            <input
              type="number"
              min={1}
              max={10}
              value={minCombosPerEvent}
              onChange={e => setMinCombosPerEvent(parseInt(e.target.value) || 2)}
            />
          </div>

          <div className="control-field">
            <label>Target Combo (tune just one)</label>
            <select
              value={targetComboId ?? ''}
              onChange={e => setTargetComboId(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">All (relative)</option>
              {categoryCombos.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="control-field">
            <label>Anchor Combo (optional)</label>
            <select
              value={anchorComboId ?? ''}
              onChange={e => setAnchorComboId(e.target.value ? parseInt(e.target.value) : null)}
              disabled={targetComboId != null}
            >
              <option value="">None</option>
              {categoryCombos.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="control-row">
          <div className="control-field locks">
            <label>Parameter Locks:</label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={lockTPower}
                onChange={e => setLockTPower(e.target.checked)}
              />
              Lock tPower
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={lockDPower}
                onChange={e => setLockDPower(e.target.checked)}
              />
              Lock dPower
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={lockFF}
                onChange={e => setLockFF(e.target.checked)}
              />
              Lock FF
            </label>
          </div>
        </div>

        <div className="control-actions">
          <button
            className="btn-analyze"
            onClick={handleAnalyze}
            disabled={loading || categoryCombos.length === 0}
          >
            {loading ? 'Analyzing...' : 'Analyze Current Settings'}
          </button>
          <button
            className="btn-recommend"
            onClick={handleRecommend}
            disabled={loading || categoryCombos.length === 0}
          >
            {loading ? 'Generating...' : 'Generate Recommendation'}
          </button>
        </div>
      </div>

      {error && <div className="combo-tuner-error">{error}</div>}

      {/* Summary Stats */}
      {analyzeResult && (
        <div className="combo-tuner-summary">
          <h4>Analysis Summary</h4>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">Events Used</span>
              <span className="summary-value">{analyzeResult.eventsUsed}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Runs Used</span>
              <span className="summary-value">{analyzeResult.runsUsed}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Combos Included</span>
              <span className="summary-value">{analyzeResult.combosIncluded.length}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Residual Range</span>
              <span className="summary-value">{fmt(analyzeResult.currentStats.residualRange)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Std Dev</span>
              <span className="summary-value">{fmt(analyzeResult.currentStats.residualStdDev)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Score</span>
              <span className="summary-value">{fmt(analyzeResult.currentStats.score)}</span>
            </div>
          </div>

          {recommendResult && (
            <div className="proposed-stats">
              <h4>
                {evalResult ? 'Proposed Settings (custom edits)' : 'Proposed Settings'}
                {evaluating ? ' · evaluating…' : ''}
              </h4>
              <div className="summary-grid">
                <div className="summary-item improved">
                  <span className="summary-label">New Range</span>
                  <span className="summary-value">{fmt(effectiveProposedStats?.residualRange)}</span>
                </div>
                <div className="summary-item improved">
                  <span className="summary-label">New Std Dev</span>
                  <span className="summary-value">{fmt(effectiveProposedStats?.residualStdDev)}</span>
                </div>
                <div className="summary-item improved">
                  <span className="summary-label">New Score</span>
                  <span className="summary-value">{fmt(effectiveProposedStats?.score)}</span>
                </div>
                {recommendResult.searchMetadata && (
                  <div className="summary-item">
                    <span className="summary-label">Search Iterations</span>
                    <span className="summary-value">
                      {recommendResult.searchMetadata.iterations}
                    </span>
                  </div>
                )}
                {recommendResult.mode && (
                  <div className="summary-item">
                    <span className="summary-label">Mode</span>
                    <span className="summary-value">
                      {recommendResult.mode === 'target' ? 'Single combo' : 'Relative field'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {analyzeResult.coverage && (
            <div className="combo-tuner-coverage">
              <span>Data coverage: </span>
              <strong>{analyzeResult.coverage.runsUsable}</strong> usable runs
              {' '}({analyzeResult.coverage.usablePct}% of {analyzeResult.coverage.runsTotal});
              {' '}weather match {analyzeResult.coverage.weatherPct}%,
              {' '}combo resolved {analyzeResult.coverage.resolvedPct}%.
            </div>
          )}

          {/* Per-combo current state */}
          {analyzeResult.combosIncluded.length > 0 && (
            <div className="combo-tuner-combos">
              <h4>Per-Combo Current State</h4>
              <div className="recommendation-table-wrapper">
                <table className="recommendation-table">
                  <thead>
                    <tr>
                      <th>Combo</th>
                      <th>tPower</th>
                      <th>dPower</th>
                      <th>FF</th>
                      <th>Events</th>
                      <th>Avg Residual</th>
                      <th>Residual σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyzeResult.combosIncluded.map(c => (
                      <tr key={c.comboId} className={c.comboId === targetComboId ? 'target-row' : ''}>
                        <td className="combo-name">
                          {c.comboName}{c.comboId === targetComboId ? ' ★' : ''}
                        </td>
                        <td>{fmt(c.currentTPower, 3)}</td>
                        <td>{fmt(c.currentDPower, 3)}</td>
                        <td>{fmt(c.currentFF, 2)}</td>
                        <td>{c.eventCount}</td>
                        <td>{fmt(c.avgResidual)}</td>
                        <td>{fmt(c.residualStdDev)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendation Table */}
      {recommendResult?.recommendations && recommendResult.recommendations.length > 0 && (
        <div className="combo-tuner-recommendations">
          <div className="recommendations-header">
            <h4>Recommendations</h4>
            <span className="edit-hint">Edit the Proposed values to see a live what-if{evaluating ? ' · evaluating…' : ''}</span>
            <button type="button" className="reset-edits-btn" onClick={resetEdits} disabled={!evalResult}>
              Reset to recommended
            </button>
          </div>
          <div className="recommendation-table-wrapper">
            <table className="recommendation-table">
              <thead>
                <tr>
                  <th>Combo</th>
                  <th colSpan={3}>Current</th>
                  <th colSpan={3}>Proposed</th>
                  <th colSpan={3}>Δ</th>
                  <th>Residual Before</th>
                  <th>Residual After</th>
                </tr>
                <tr className="sub-header">
                  <th></th>
                  <th>tPower</th>
                  <th>dPower</th>
                  <th>FF</th>
                  <th>tPower</th>
                  <th>dPower</th>
                  <th>FF</th>
                  <th>ΔtP</th>
                  <th>ΔdP</th>
                  <th>ΔFF</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recommendResult.recommendations.map(r => {
                  const ed = editParams[r.comboId] ?? { t: r.proposedTPower, d: r.proposedDPower, ff: r.proposedFF };
                  const dT = ed.t - r.currentTPower;
                  const dD = ed.d - r.currentDPower;
                  const dFF = ed.ff - r.currentFF;
                  const after = evalByCombo.get(r.comboId) ?? r.avgResidualAfter;
                  const onEdit = (key: 't' | 'd' | 'ff') => (e: React.ChangeEvent<HTMLInputElement>) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) updateEditParam(r.comboId, key, v);
                  };
                  return (
                    <tr key={r.comboId} className={r.tuned ? 'tuned-row' : 'fixed-row'}>
                      <td className="combo-name">
                        {r.comboName}
                        {r.comboId === targetComboId ? ' ★' : ''}
                        {!r.tuned ? ' (fixed)' : ''}
                      </td>
                      <td className="current">{fmt(r.currentTPower, 3)}</td>
                      <td className="current">{fmt(r.currentDPower, 3)}</td>
                      <td className="current">{fmt(r.currentFF, 2)}</td>
                      <td className="proposed">
                        <input type="number" step="0.01" className="param-input" value={ed.t} onChange={onEdit('t')} />
                        {r.hitBound?.t_power ? ' ⚠' : ''}
                      </td>
                      <td className="proposed">
                        <input type="number" step="0.01" className="param-input" value={ed.d} onChange={onEdit('d')} />
                        {r.hitBound?.d_power ? ' ⚠' : ''}
                      </td>
                      <td className="proposed">
                        <input type="number" step="0.1" className="param-input" value={ed.ff} onChange={onEdit('ff')} />
                        {r.hitBound?.ff ? ' ⚠' : ''}
                      </td>
                      <td className={Math.abs(dT) > 1e-9 ? 'delta' : ''}>{Math.abs(dT) > 1e-9 ? fmt(dT, 3) : '—'}</td>
                      <td className={Math.abs(dD) > 1e-9 ? 'delta' : ''}>{Math.abs(dD) > 1e-9 ? fmt(dD, 3) : '—'}</td>
                      <td className={Math.abs(dFF) > 1e-9 ? 'delta' : ''}>{Math.abs(dFF) > 1e-9 ? fmt(dFF, 2) : '—'}</td>
                      <td>{fmt(r.avgResidualBefore)}</td>
                      <td className={Math.abs(after) < Math.abs(r.avgResidualBefore) ? 'improved' : ''}>
                        {fmt(after)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Residual Comparison Chart */}
      {chartData.length > 0 && (
        <div className="combo-tuner-chart">
          <h4>Residual Comparison (Before vs After)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="combo" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v, 3)} />
              <Tooltip formatter={(v: number) => fmt(v, 4)} />
              <Legend />
              <Bar dataKey="before" name="Current Residual" fill="#8884d8" />
              <Bar dataKey="after" name="Proposed Residual" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Long-Term Parity Graph */}
      {paritySeries.length > 0 && comboLabels.length > 0 && (
        <div className="combo-tuner-chart">
          <div className="parity-graph-header">
            <h4>Long-Term Parity (residual vs field by event)</h4>
            <div className="parity-view-toggle">
              <button
                type="button"
                className={parityView === 'current' ? 'active' : ''}
                onClick={() => setParityView('current')}
              >Current</button>
              <button
                type="button"
                className={parityView === 'proposed' ? 'active' : ''}
                onClick={() => setParityView('proposed')}
              >{evalResult ? 'Custom' : 'Proposed'}</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={paritySeries} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="event" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} interval={0} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v, 3)} label={{ value: 'Residual (s)', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
              <Tooltip formatter={(v: number) => fmt(v, 4)} />
              <Legend />
              <ReferenceLine y={0} stroke="#999" strokeDasharray="4 4" />
              {comboLabels.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <p className="parity-graph-note">
            Each line is a combo's corrected-ET residual vs the event field median. Closer to the
            zero line (and flatter over time) = better long-term parity.
          </p>
        </div>
      )}

      {/* Read-only notice */}
      <div className="combo-tuner-notice">
        <strong>Read-only mode (v1):</strong> These are recommendations only. No changes have been saved.
        To apply changes, manually edit the combo definitions above.
      </div>
    </div>
  );
}
