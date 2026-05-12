/**
 * Rules & Governance — Rules List Page (Phase 3A)
 *
 * Browse, search, and filter the NHRA rulebook.
 * Requires 'rules.read' capability (enforced by CapabilityRoute).
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchRules, fetchCategories, type Rule, RulesApiError } from '../domain/rules/rulesApi';

const CATEGORY_COLORS: Record<string, string> = {
  Technical: '#3b82f6',
  Safety: '#ef4444',
  Eligibility: '#22c55e',
  Procedural: '#f59e0b',
  General: '#6b7280',
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] || 'var(--color-primary)';
}

export default function RulesList() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [classScopeFilter, setClassScopeFilter] = useState('');

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter) params.status = statusFilter;
      if (classScopeFilter) params.class_scope = classScopeFilter;

      const data = await fetchRules(params);
      setRules(data.rules);
    } catch (e: any) {
      if (e instanceof RulesApiError) {
        if (e.code === 'unauthorized') {
          setError('unauthorized');
        } else if (e.code === 'forbidden') {
          setError('forbidden');
        } else if (e.code === 'server_error') {
          setError('server_error');
        } else {
          setError(e.message || 'Failed to load rules');
        }
      } else {
        setError(e.message || 'Failed to load rules');
      }
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter, classScopeFilter]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    fetchCategories()
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        Rules & Governance
      </h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        NHRA rulebook — browse current and historical rules.
      </p>

      {/* Committees Link */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          to="/rules/committees"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            color: 'var(--color-text)',
            fontWeight: 500,
          }}
        >
          <span>👥</span>
          <span>Rules Committees</span>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-muted)' }}>→</span>
        </Link>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem',
        padding: '1rem', backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
      }}>
        <input
          type="text"
          placeholder="Search rules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px', padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg)', color: 'var(--color-text)',
            fontSize: '0.875rem',
          }}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg)', color: 'var(--color-text)',
            fontSize: '0.875rem',
          }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Class scope..."
          value={classScopeFilter}
          onChange={(e) => setClassScopeFilter(e.target.value)}
          style={{
            width: '140px', padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg)', color: 'var(--color-text)',
            fontSize: '0.875rem',
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg)', color: 'var(--color-text)',
            fontSize: '0.875rem',
          }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="superseded">Superseded</option>
          <option value="proposed">Proposed</option>
        </select>
      </div>

      {/* Error States */}
      {error === 'unauthorized' && (
        <div style={{
          padding: '1rem', marginBottom: '1rem',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)', color: '#ef4444',
        }}>
          <strong>Authentication required</strong>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            Please log in to view rules.
          </p>
        </div>
      )}
      {error === 'forbidden' && (
        <div style={{
          padding: '1rem', marginBottom: '1rem',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 'var(--radius-md)', color: '#f59e0b',
        }}>
          <strong>Access denied</strong>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            You don't have permission to view rules. Contact an administrator.
          </p>
        </div>
      )}
      {error === 'server_error' && (
        <div style={{
          padding: '1rem', marginBottom: '1rem',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)', color: '#ef4444',
        }}>
          <strong>Rules API error</strong>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            The rules service encountered an error. Please try again later or contact support.
          </p>
          <button
            onClick={loadRules}
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 1rem',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Retry
          </button>
        </div>
      )}
      {error && error !== 'unauthorized' && error !== 'forbidden' && error !== 'server_error' && (
        <div style={{
          padding: '1rem', marginBottom: '1rem',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)', color: '#ef4444',
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-muted)' }}>
          Loading rules...
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && rules.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '3rem',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
        }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            No rules found
          </p>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
            {search || categoryFilter || statusFilter
              ? 'Try adjusting your filters.'
              : 'No rule records have been imported yet. Rules will appear here once the rulebook is seeded.'}
          </p>
        </div>
      )}

      {/* Rules table */}
      {!loading && rules.length > 0 && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{
                backgroundColor: 'var(--color-surface-alt)',
                borderBottom: '2px solid var(--color-border)',
              }}>
                <th style={thStyle}>Rule #</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Class Scope</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Effective</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td style={tdStyle}>
                    <Link
                      to={`/rules/${rule.uuid}`}
                      style={{
                        color: 'var(--color-primary)', textDecoration: 'none',
                        fontWeight: 600, fontFamily: 'monospace',
                      }}
                    >
                      {rule.rule_number}
                    </Link>
                  </td>
                  <td style={tdStyle}>
                    <Link
                      to={`/rules/${rule.uuid}`}
                      style={{ color: 'var(--color-text)', textDecoration: 'none' }}
                    >
                      {rule.title}
                    </Link>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px',
                      borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                      backgroundColor: categoryColor(rule.category) + '22',
                      color: categoryColor(rule.category),
                    }}>
                      {rule.category}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--color-muted)' }}>
                    {rule.class_scope || 'All'}
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={rule.status} />
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--color-muted)', fontSize: '0.8rem' }}>
                    {rule.effective_from}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '1rem', color: 'var(--color-muted)', fontSize: '0.8rem' }}>
        {rules.length} rule{rules.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: '#22c55e',
    superseded: '#f59e0b',
    proposed: '#3b82f6',
    deleted: '#ef4444',
  };
  const color = colors[status] || 'var(--color-muted)';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
      backgroundColor: color + '22', color,
    }}>
      {status}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '0.75rem 1rem',
  fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase',
  letterSpacing: '0.05em', color: 'var(--color-muted)',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem 1rem', verticalAlign: 'middle',
};
