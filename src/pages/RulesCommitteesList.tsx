/**
 * Rules Committees List Page
 *
 * Displays all rules committees with filtering.
 * Requires committees.read capability.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCapabilities } from '../domain/config/useCapabilities';
import { fetchCommittees, fetchCommitteeCategories, type Committee, CommitteesApiError } from '../domain/rules/committeesApi';

export default function RulesCommitteesList() {
  const { can } = useCapabilities();
  const canAdmin = can('committees.admin');

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  useEffect(() => {
    loadCommittees();
    loadCategories();
  }, [statusFilter, categoryFilter]);

  async function loadCommittees() {
    setLoading(true);
    setError(null);
    try {
      const params: { status?: string; category?: string } = {};
      if (statusFilter) params.status = statusFilter;
      if (categoryFilter) params.category = categoryFilter;

      const response = await fetchCommittees(params);
      setCommittees(response.committees);
    } catch (e: any) {
      if (e instanceof CommitteesApiError) {
        if (e.code === 'unauthorized') {
          setError('unauthorized');
        } else if (e.code === 'forbidden') {
          setError('forbidden');
        } else if (e.code === 'server_error') {
          setError('server_error');
        } else {
          setError(e.message || 'Failed to load committees');
        }
      } else {
        setError(e.message || 'Failed to load committees');
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const response = await fetchCommitteeCategories();
      setCategories(response.categories);
    } catch {
      // Categories are nice-to-have, don't block on error
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: '#22c55e',
      inactive: '#6b7280',
      dissolved: '#dc2626',
    };
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 500,
        background: colors[status] || '#6b7280',
        color: 'white',
        textTransform: 'capitalize',
      }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>Rules Committees</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            NHRA Tech Services committees and memberships
          </p>
        </div>
        {canAdmin && (
          <Link
            to="/rules/committees/new"
            style={{
              padding: '0.5rem 1rem',
              background: '#3b82f6',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            + Create Committee
          </Link>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="dissolved">Dissolved</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', minWidth: '150px' }}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {(statusFilter || categoryFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setCategoryFilter(''); }}
            style={{
              padding: '0.5rem 1rem',
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Error States */}
      {error === 'unauthorized' && (
        <div style={{
          padding: '1rem',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#dc2626',
          marginBottom: '1rem',
        }}>
          <strong>Authentication required</strong>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            Please log in to view committees.
          </p>
        </div>
      )}
      {error === 'forbidden' && (
        <div style={{
          padding: '1rem',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '6px',
          color: '#92400e',
          marginBottom: '1rem',
        }}>
          <strong>Access denied</strong>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            You don't have permission to view committees. Contact an administrator.
          </p>
        </div>
      )}
      {error === 'server_error' && (
        <div style={{
          padding: '1rem',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#dc2626',
          marginBottom: '1rem',
        }}>
          <strong>Committees API error</strong>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            The committees service encountered an error. Please try again later or contact support.
          </p>
          <button
            onClick={loadCommittees}
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 1rem',
              background: '#dc2626',
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
          padding: '1rem',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#dc2626',
          marginBottom: '1rem',
        }}>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          Loading committees...
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && committees.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px dashed #d1d5db',
        }}>
          <p style={{ fontSize: '1.125rem', color: '#374151', marginBottom: '0.5rem' }}>
            No committees defined yet
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Committees will appear here once they are created.
          </p>
          {canAdmin && (
            <Link
              to="/rules/committees/new"
              style={{
                padding: '0.5rem 1rem',
                background: '#3b82f6',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '0.875rem',
              }}
            >
              Create First Committee
            </Link>
          )}
        </div>
      )}

      {/* Committees Grid */}
      {!loading && !error && committees.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {committees.map((committee) => (
            <Link
              key={committee.id}
              to={`/rules/committees/${committee.slug || committee.id}`}
              style={{
                display: 'block',
                padding: '1.25rem',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'box-shadow 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', margin: 0 }}>
                  {committee.name}
                </h3>
                {statusBadge(committee.status)}
              </div>

              {committee.category && (
                <p style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  {committee.category}
                </p>
              )}

              {committee.description && (
                <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {committee.description.length > 120
                    ? committee.description.substring(0, 120) + '...'
                    : committee.description}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                <span>{committee.member_count} member{committee.member_count !== 1 ? 's' : ''}</span>
                {committee.class_scope && (
                  <span style={{ fontSize: '0.75rem', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
                    {committee.class_scope}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
