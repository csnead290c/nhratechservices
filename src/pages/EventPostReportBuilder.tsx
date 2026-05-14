import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCapabilities } from '../domain/config/useCapabilities';
import {
  getPlan,
  getPostReportPreview,
  listPostReports,
  generatePostReport,
  type EventPlan,
  type EventPostReport,
  type ReportPreview,
} from '../domain/eventOps/eventOpsApi';

// ── Status badge ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:      { bg: '#f3f4f6', color: '#374151' },
  generated:  { bg: '#dbeafe', color: '#1d4ed8' },
  in_review:  { bg: '#fef3c7', color: '#92400e' },
  finalized:  { bg: '#dcfce7', color: '#166534' },
  archived:   { bg: '#e5e7eb', color: '#6b7280' },
};

function StatusBadge({ status }: { status: string }) {
  const { bg, color } = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: bg, color }}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────

function CountCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 18px', minWidth: 110, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Section preview ───────────────────────────────────────────────────────

function SectionPreview({ section }: { section: { section_key: string; title: string; generated_body: string | null } }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: '#f9fafb', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>{section.title}</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '10px 14px', background: '#fff', fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {section.generated_body || <span style={{ color: '#9ca3af' }}>No content generated.</span>}
        </div>
      )}
    </div>
  );
}

// ── Issues / follow-up table ──────────────────────────────────────────────

function ItemTable({ title, items, emptyMsg }: {
  title: string;
  items: Array<{ id: number; title: string; live_update: { status: string; notes: string | null } }>;
  emptyMsg: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{title}</div>
      {items.length === 0
        ? <div data-testid="empty-items" style={{ color: '#9ca3af', fontSize: 13 }}>{emptyMsg}</div>
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Task', 'Status', 'Notes'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} data-testid="item-row">
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{item.title}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{item.live_update.status}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>{item.live_update.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </div>
  );
}

// ── Session summary table ─────────────────────────────────────────────────

function SessionSummaryTable({ sessions }: { sessions: ReportPreview['sessions'] }) {
  if (!sessions.length) return <div style={{ color: '#9ca3af', fontSize: 13 }}>No sessions in this plan.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {['Session', 'Status', 'Tasks', 'Complete'].map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sessions.map(s => (
          <tr key={s.session.id}>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{s.session.title}</td>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}><StatusBadge status={s.live_status?.status ?? 'not_started'} /></td>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{s.task_count}</td>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{s.complete_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function EventPostReportBuilder() {
  const { id } = useParams<{ id: string }>();
  const planId = Number(id);
  const { can } = useCapabilities();
  const isAdmin = can('eventops.admin');
  const navigate = useNavigate();

  const [plan,      setPlan]      = useState<EventPlan | null>(null);
  const [preview,   setPreview]   = useState<ReportPreview | null>(null);
  const [reports,   setReports]   = useState<EventPostReport[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!planId) return;
    try {
      const [planRes, prevRes, repRes] = await Promise.all([
        getPlan(planId),
        getPostReportPreview(planId),
        listPostReports(planId),
      ]);
      setPlan(planRes.plan);
      setPreview(prevRes.preview);
      setReports(repRes.reports);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report builder');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading post-event report…</div>;
  if (error)   return <div style={{ padding: '2rem', color: '#991b1b' }}>Error: {error}</div>;
  if (!plan)   return <div style={{ padding: '2rem' }}>Plan not found.</div>;

  const latestReport = reports[0] ?? null;
  const counts = preview?.counts;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link to={`/event-ops/${planId}`} style={{ fontSize: 13, color: '#2563eb' }}>← Back to Plan</Link>
        <h1 style={{ margin: '6px 0 4px', fontSize: 22, fontWeight: 700 }}>
          Post-Event Report — {plan.event_code} {plan.year}
        </h1>
        <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {plan.track_name && <span>🏁 {plan.track_name}</span>}
          {plan.class_scope && <span>Class: {plan.class_scope}</span>}
          {latestReport && <StatusBadge status={latestReport.status} />}
          {latestReport && (
            <Link
              to={`/event-ops/reports/${latestReport.id}`}
              data-testid="view-report-link"
              style={{ fontSize: 13, color: '#2563eb' }}
            >
              View saved report →
            </Link>
          )}
        </div>
      </div>

      {/* Existing reports list */}
      {reports.length > 1 && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Previous Reports</div>
          {reports.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, marginBottom: 4 }}>
              <StatusBadge status={r.status} />
              <Link to={`/event-ops/reports/${r.id}`} style={{ color: '#2563eb' }}>{r.title || `Report #${r.id}`}</Link>
              <span style={{ color: '#9ca3af' }}>{r.generated_at ? `Generated ${new Date(r.generated_at).toLocaleDateString()}` : 'Draft'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      {counts && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }} data-testid="summary-cards">
          <CountCard label="Total Tasks"    value={counts.total_tasks}         color="#374151" />
          <CountCard label="Completed"      value={counts.completed_tasks}     color="#166534" />
          <CountCard label="Open"           value={counts.open_tasks}          color="#1d4ed8" />
          <CountCard label="Issues"         value={counts.issue_tasks}         color="#991b1b" />
          <CountCard label="Follow-ups"     value={counts.followup_tasks}      color="#92400e" />
          <CountCard label="Carry Forward"  value={counts.carry_forward_tasks} color="#6d28d9" />
          <CountCard label="Files"          value={counts.file_count}          color="#0369a1" />
          <CountCard label="Staff"          value={counts.staff_count}         color="#374151" />
        </div>
      )}

      {/* Admin controls */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <button
            data-testid="generate-report-btn"
            disabled={generating}
            onClick={async () => {
              setGenerating(true);
              try {
                const res = await generatePostReport(planId);
                await load();
                navigate(`/event-ops/reports/${res.report_id}`);
              } finally {
                setGenerating(false);
              }
            }}
            style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            {generating ? 'Generating…' : latestReport ? 'Regenerate Report' : 'Generate Report'}
          </button>
          <button
            disabled
            title="Coming in Phase D"
            data-testid="pdf-export-btn"
            style={{ padding: '8px 18px', background: '#e5e7eb', color: '#9ca3af', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontWeight: 600 }}
          >
            PDF Export (Coming Later)
          </button>
        </div>
      )}

      {/* No report state */}
      {!latestReport && (
        <div data-testid="no-report-state" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>No report generated yet.</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            The preview below shows live data from the current plan. {isAdmin ? 'Click "Generate Report" to create a saved snapshot.' : ''}
          </div>
        </div>
      )}

      {/* Generated section previews */}
      {preview && preview.sections.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Report Sections Preview</div>
          {preview.sections.map(s => <SectionPreview key={s.section_key} section={s} />)}
        </div>
      )}

      {/* Issues */}
      {preview && (
        <ItemTable
          title="Issues Found"
          items={preview.issue_items as any}
          emptyMsg="No issues recorded."
        />
      )}

      {/* Follow-ups */}
      {preview && (
        <ItemTable
          title="Follow-Ups / Carry-Forward"
          items={preview.followup_items as any}
          emptyMsg="No follow-up or carry-forward items."
        />
      )}

      {/* Session summary */}
      {preview && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Session Summary</div>
          <SessionSummaryTable sessions={preview.sessions} />
        </div>
      )}

      {/* Files */}
      {preview && preview.files.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Files / Data Collection</div>
          {preview.files.map(f => (
            <div key={f.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
              [{f.file_type}] {f.title}{f.url ? <> — <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{f.url}</a></> : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
