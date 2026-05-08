/**
 * Rules & Governance — Rule Detail Page (Phase 3A)
 *
 * Displays a single rule with version history.
 * Requires 'rules.read' capability (enforced by CapabilityRoute).
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchRule, fetchRuleVersions, type Rule, type RuleVersion } from '../domain/rules/rulesApi';

export default function RuleDetail() {
  const { id } = useParams<{ id: string }>();
  const [rule, setRule] = useState<Rule | null>(null);
  const [versions, setVersions] = useState<RuleVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    fetchRule(id)
      .then((data) => {
        setRule(data.rule);
        return fetchRuleVersions(data.rule.id);
      })
      .then((vData) => {
        setVersions(vData.versions);
      })
      .catch((e) => {
        setError(e.message || 'Failed to load rule');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem', textAlign: 'center', color: 'var(--color-muted)' }}>
        Loading rule...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{
          padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)', color: '#ef4444',
        }}>
          {error}
        </div>
        <Link to="/rules" style={{ display: 'inline-block', marginTop: '1rem', color: 'var(--color-primary)' }}>
          ← Back to Rules
        </Link>
      </div>
    );
  }

  if (!rule) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <p>Rule not found.</p>
        <Link to="/rules" style={{ color: 'var(--color-primary)' }}>← Back to Rules</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Link to="/rules" style={{
        display: 'inline-block', marginBottom: '1.5rem',
        color: 'var(--color-muted)', textDecoration: 'none', fontSize: '0.875rem',
      }}>
        ← Back to Rules
      </Link>

      {/* Header */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700,
            color: 'var(--color-primary)',
          }}>
            {rule.rule_number}
          </span>
          <StatusBadge status={rule.status} />
          <CategoryBadge category={rule.category} />
        </div>

        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.5rem 0 1rem' }}>
          {rule.title}
        </h1>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
          <span>Class Scope: <strong>{rule.class_scope || 'All'}</strong></span>
          <span>Effective: <strong>{rule.effective_from}{rule.effective_to ? ` – ${rule.effective_to}` : ' (current)'}</strong></span>
          {rule.current_version_id && (
            <span>Current Version: <strong>v{rule.current_version?.version_number || '?'}</strong></span>
          )}
        </div>
      </div>

      {/* Rule body */}
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        fontSize: '0.95rem',
      }}>
        {rule.body}
      </div>

      {/* Version history */}
      {versions.length > 0 && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          padding: '1.5rem',
        }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
            Version History
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {versions.map((v) => (
              <div
                key={v.id}
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>v{v.version_number}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                    {v.effective_from}{v.effective_to ? ` – ${v.effective_to}` : ''}
                  </span>
                </div>
                {v.change_summary && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                    {v.change_summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
      display: 'inline-block', padding: '2px 10px',
      borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
      backgroundColor: color + '22', color,
    }}>
      {status}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    Technical: '#3b82f6',
    Safety: '#ef4444',
    Eligibility: '#22c55e',
    Procedural: '#f59e0b',
    General: '#6b7280',
  };
  const color = colors[category] || 'var(--color-primary)';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px',
      borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
      backgroundColor: color + '22', color,
    }}>
      {category}
    </span>
  );
}
