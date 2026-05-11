/**
 * Rules Committee Detail Page
 *
 * Displays committee metadata and membership roster.
 * Requires committees.read capability.
 * Admin controls shown only to users with committees.admin.
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCapabilities } from '../domain/config/useCapabilities';
import { fetchCommittee, type CommitteeResponse, type CommitteeMember } from '../domain/rules/committeesApi';

export default function RulesCommitteeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useCapabilities();
  const canAdmin = can('committees.admin');

  const [data, setData] = useState<CommitteeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('No committee ID provided');
      setLoading(false);
      return;
    }
    loadCommittee();
  }, [id]);

  async function loadCommittee() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCommittee(id);
      setData(response);
    } catch (e: any) {
      setError(e.message || 'Failed to load committee');
    } finally {
      setLoading(false);
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

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = {
      chairman: 'Chair',
      co_chairman: 'Co-Chair',
      member: 'Member',
      advisor: 'Advisor',
      secretary: 'Secretary',
      liaison: 'Liaison',
      guest: 'Guest',
      observer: 'Observer',
    };
    return labels[role] || role;
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, { bg: string; color: string }> = {
      chairman: { bg: '#fef3c7', color: '#92400e' },
      co_chairman: { bg: '#fef3c7', color: '#92400e' },
      member: { bg: '#dbeafe', color: '#1e40af' },
      advisor: { bg: '#f3e8ff', color: '#6b21a8' },
      secretary: { bg: '#fce7f3', color: '#9d174d' },
      liaison: { bg: '#e0e7ff', color: '#3730a3' },
      guest: { bg: '#f3f4f6', color: '#4b5563' },
      observer: { bg: '#f3f4f6', color: '#4b5563' },
    };
    const style = colors[role] || { bg: '#f3f4f6', color: '#4b5563' };
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 500,
        background: style.bg,
        color: style.color,
      }}>
        {roleLabel(role)}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading committee...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '2rem' }}>
        <Link to="/rules/committees" style={{ color: '#3b82f6', textDecoration: 'none' }}>← Back to Committees</Link>
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#dc2626',
        }}>
          {error || 'Committee not found'}
        </div>
      </div>
    );
  }

  const { committee, members, chair, co_chair } = data;

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/rules" style={{ color: '#3b82f6', textDecoration: 'none' }}>Rules</Link>
        {' / '}
        <Link to="/rules/committees" style={{ color: '#3b82f6', textDecoration: 'none' }}>Committees</Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>{committee.name}</h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {statusBadge(committee.status)}
            {committee.category && (
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{committee.category}</span>
            )}
          </div>
        </div>
        {canAdmin && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => {/* TODO: Edit committee */}}
              style={{
                padding: '0.5rem 1rem',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Edit
            </button>
            <button
              onClick={() => {/* TODO: Add member */}}
              style={{
                padding: '0.5rem 1rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              + Add Member
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      {committee.description && (
        <div style={{
          padding: '1rem',
          background: '#f9fafb',
          borderRadius: '6px',
          marginBottom: '1.5rem',
          lineHeight: 1.6,
        }}>
          {committee.description}
        </div>
      )}

      {/* Class Scope */}
      {committee.class_scope && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            Class Scope
          </h3>
          <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            background: '#f3f4f6',
            borderRadius: '4px',
            fontSize: '0.875rem',
          }}>
            {committee.class_scope}
          </span>
        </div>
      )}

      {/* Leadership */}
      {(chair || co_chair) && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Leadership</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {chair && (
              <div style={{
                padding: '1rem',
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: '6px',
              }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#92400e', marginBottom: '0.25rem' }}>
                  Chair
                </div>
                <div style={{ fontWeight: 600 }}>{chair.user_name}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{chair.user_email}</div>
                {chair.title && <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>{chair.title}</div>}
              </div>
            )}
            {co_chair && (
              <div style={{
                padding: '1rem',
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: '6px',
              }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#92400e', marginBottom: '0.25rem' }}>
                  Co-Chair
                </div>
                <div style={{ fontWeight: 600 }}>{co_chair.user_name}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{co_chair.user_email}</div>
                {co_chair.title && <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>{co_chair.title}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Members */}
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Members ({members.length})
        </h3>

        {members.length === 0 ? (
          <div style={{
            padding: '2rem',
            background: '#f9fafb',
            borderRadius: '6px',
            textAlign: 'center',
            color: '#6b7280',
          }}>
            No members assigned to this committee yet.
          </div>
        ) : (
          <div style={{
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Name</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Role</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Title</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Since</th>
                  {canAdmin && <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member, index) => (
                  <tr key={member.id} style={{ borderBottom: index < members.length - 1 ? '1px solid #e5e7eb' : undefined }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 500 }}>{member.user_name || 'Unknown'}</div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{member.user_email}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{roleBadge(member.role)}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#4b5563' }}>{member.title || '-'}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#6b7280' }}>{member.start_date}</td>
                    {canAdmin && (
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          onClick={() => {/* TODO: Edit member */}}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            background: 'transparent',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginRight: '0.5rem',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {/* TODO: Remove member */}}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            background: 'transparent',
                            border: '1px solid #ef4444',
                            color: '#ef4444',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
