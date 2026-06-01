/**
 * Combo Tuner Panel
 *
 * A read-only tuning assistant that evaluates and recommends tPower, dPower, and FF
 * changes for engine combo definitions. Uses historical event run data to minimize
 * long-term corrected performance spread between combos.
 */

import { useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { parityApi, type ComboTunerAnalyzeResponse, type ComboTunerRecommendResponse } from '../../services/parityApi';
import './ComboTunerPanel.css';

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
  const [lockTPower, setLockTPower] = useState<boolean>(false);
  const [lockDPower, setLockDPower] = useState<boolean>(false);
  const [lockFF, setLockFF] = useState<boolean>(false);

  // Results state
  const [analyzeResult, setAnalyzeResult] = useState<ComboTunerAnalyzeResponse | null>(null);
  const [recommendResult, setRecommendResult] = useState<ComboTunerRecommendResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

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
        lockTPower,
        lockDPower,
        lockFF,
      });
      setAnalyzeResult(result);
    } catch (e: any) {
      setError(e.message || 'Analysis failed');
    }
    setLoading(false);
  }, [category, eventWindow, customEventCount, metric, minEventsPerCombo, minCombosPerEvent, anchorComboId, lockTPower, lockDPower, lockFF]);

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
        lockTPower,
        lockDPower,
        lockFF,
      });
      setRecommendResult(result);
      setAnalyzeResult(result); // Also show analyze data
    } catch (e: any) {
      setError(e.message || 'Recommendation failed');
    }
    setLoading(false);
  }, [category, eventWindow, customEventCount, metric, minEventsPerCombo, minCombosPerEvent, anchorComboId, lockTPower, lockDPower, lockFF]);

  // Format number for display
  const fmt = (v: number | null | undefined, decimals = 4) => {
    if (v == null) return '—';
    return v.toFixed(decimals);
  };

  // Build chart data for residual comparison
  const chartData = recommendResult?.recommendations.map(r => ({
    combo: r.comboName,
    before: r.avgResidualBefore,
    after: r.avgResidualAfter,
  })) ?? [];

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
            <label>Metric (v1: quickest only)</label>
            <select value={metric} onChange={e => setMetric(e.target.value as any)} disabled>
              <option value="quickest">Quickest Run</option>
              <option value="avg2">Average 2 (future)</option>
              <option value="avg4">Average 4 (future)</option>
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
            <label>Anchor Combo (optional)</label>
            <select
              value={anchorComboId ?? ''}
              onChange={e => setAnchorComboId(e.target.value ? parseInt(e.target.value) : null)}
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
              <h4>Proposed Settings</h4>
              <div className="summary-grid">
                <div className="summary-item improved">
                  <span className="summary-label">New Range</span>
                  <span className="summary-value">{fmt(recommendResult.proposedStats.residualRange)}</span>
                </div>
                <div className="summary-item improved">
                  <span className="summary-label">New Std Dev</span>
                  <span className="summary-value">{fmt(recommendResult.proposedStats.residualStdDev)}</span>
                </div>
                <div className="summary-item improved">
                  <span className="summary-label">New Score</span>
                  <span className="summary-value">{fmt(recommendResult.proposedStats.score)}</span>
                </div>
                {recommendResult.searchMetadata && (
                  <div className="summary-item">
                    <span className="summary-label">Search Iterations</span>
                    <span className="summary-value">
                      {recommendResult.searchMetadata.coarseIterations + recommendResult.searchMetadata.fineIterations}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendation Table */}
      {recommendResult?.recommendations && recommendResult.recommendations.length > 0 && (
        <div className="combo-tuner-recommendations">
          <h4>Recommendations</h4>
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
                {recommendResult.recommendations.map(r => (
                  <tr key={r.comboId}>
                    <td className="combo-name">{r.comboName}</td>
                    <td className="current">{r.comboId === anchorComboId ? fmt(r.proposedTPower - r.deltaTPower, 3) : fmt(r.proposedTPower - r.deltaTPower, 3)}</td>
                    <td className="current">{fmt(r.proposedDPower - r.deltaDPower, 3)}</td>
                    <td className="current">{fmt(r.proposedFF - r.deltaFF, 2)}</td>
                    <td className="proposed">{fmt(r.proposedTPower, 3)}</td>
                    <td className="proposed">{fmt(r.proposedDPower, 3)}</td>
                    <td className="proposed">{fmt(r.proposedFF, 2)}</td>
                    <td className={r.deltaTPower !== 0 ? 'delta' : ''}>{r.deltaTPower !== 0 ? fmt(r.deltaTPower, 3) : '—'}</td>
                    <td className={r.deltaDPower !== 0 ? 'delta' : ''}>{r.deltaDPower !== 0 ? fmt(r.deltaDPower, 3) : '—'}</td>
                    <td className={r.deltaFF !== 0 ? 'delta' : ''}>{r.deltaFF !== 0 ? fmt(r.deltaFF, 2) : '—'}</td>
                    <td>{fmt(r.avgResidualBefore)}</td>
                    <td className={Math.abs(r.avgResidualAfter) < Math.abs(r.avgResidualBefore) ? 'improved' : ''}>
                      {fmt(r.avgResidualAfter)}
                    </td>
                  </tr>
                ))}
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

      {/* Read-only notice */}
      <div className="combo-tuner-notice">
        <strong>Read-only mode (v1):</strong> These are recommendations only. No changes have been saved.
        To apply changes, manually edit the combo definitions above.
      </div>
    </div>
  );
}
