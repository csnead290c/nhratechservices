import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCapabilities } from '../domain/config/useCapabilities';
import {
  getPostReport,
  getPostReportSections,
  getPostReportItems,
  getPostReportFiles,
  getPostReportIncidents,
  finalizePostReport,
  reopenPostReport,
  regeneratePostReportSummary,
  updateReportSection,
  addReportItem,
  deleteReportItem,
  type EventPostReport,
  type EventPostReportSection,
  type EventPostReportItem,
  type EventPostReportFile,
  type EventPostReportIncident,
  type ReportStatus,
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
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Section editor ────────────────────────────────────────────────────────

interface SectionEditorProps {
  section: EventPostReportSection;
  reportId: number;
  isAdmin: boolean;
  onRefresh: () => void;
}

function SectionEditor({ section, reportId, isAdmin, onRefresh }: SectionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [body,    setBody]    = useState(section.body ?? section.generated_body ?? '');
  const [busy,    setBusy]    = useState(false);

  const save = async () => {
    setBusy(true);
    try { await updateReportSection(reportId, section.id, { body }); await onRefresh(); setEditing(false); }
    finally { setBusy(false); }
  };

  return (
    <div
      data-testid="report-section"
      style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}
    >
      <div style={{ background: '#f9fafb', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{section.title}</span>
        {isAdmin && !editing && (
          <button
            data-testid="edit-section-btn"
            onClick={() => { setBody(section.body ?? section.generated_body ?? ''); setEditing(true); }}
            style={{ fontSize: 12, padding: '3px 10px', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', background: '#fff' }}
          >
            Edit
          </button>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        {editing ? (
          <div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              style={{ width: '100%', fontSize: 13, padding: '8px', border: '1px solid #d1d5db', borderRadius: 4, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button disabled={busy} onClick={save} style={{ padding: '5px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>Save</button>
              <button onClick={() => setEditing(false)} style={{ padding: '5px 14px', background: '#f3f4f6', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {section.body || section.generated_body || <span style={{ color: '#9ca3af' }}>No content. Click Edit to add narrative.</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Items table ───────────────────────────────────────────────────────────

function ItemsPanel({ items, reportId, isAdmin, onRefresh }: {
  items: EventPostReportItem[];
  reportId: number;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const doAdd = async () => {
    if (!newTitle.trim()) return;
    setBusy(true);
    try { await addReportItem(reportId, { title: newTitle }); setNewTitle(''); setAdding(false); await onRefresh(); }
    finally { setBusy(false); }
  };

  const doDelete = async (itemId: number) => {
    setBusy(true);
    try { await deleteReportItem(reportId, itemId); await onRefresh(); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Action Items ({items.length})</div>
        {isAdmin && (
          <button
            data-testid="add-item-btn"
            onClick={() => setAdding(o => !o)}
            style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', background: '#fff' }}
          >
            + Add Item
          </button>
        )}
      </div>
      {isAdmin && adding && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Item title…" style={{ flex: 1, fontSize: 13, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4 }} />
          <button disabled={busy || !newTitle.trim()} onClick={doAdd} style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>Add</button>
        </div>
      )}
      {items.length === 0
        ? <div data-testid="items-empty" style={{ color: '#9ca3af', fontSize: 13 }}>No action items.</div>
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Title', 'Type', 'Priority', 'Status', isAdmin ? 'Actions' : ''].filter(Boolean).map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} data-testid="report-item-row">
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{item.title}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>{item.source_type}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{item.priority}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}><StatusBadge status={item.status} /></td>
                  {isAdmin && (
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>
                      <button disabled={busy} onClick={() => doDelete(item.id)} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #fca5a5', color: '#991b1b', background: '#fff', borderRadius: 4, cursor: 'pointer' }}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </div>
  );
}

// ── Files panel ───────────────────────────────────────────────────────────

function FilesPanel({ files }: { files: EventPostReportFile[] }) {
  if (!files.length) return <div style={{ color: '#9ca3af', fontSize: 13 }}>No files attached to this report.</div>;
  return (
    <div>
      {files.map(f => (
        <div key={f.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
          [{f.file_type}] {f.title}
          {f.url && <> — <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{f.url}</a></>}
        </div>
      ))}
    </div>
  );
}

// ── Incidents panel ───────────────────────────────────────────────────────

function IncidentsPanel({ incidents }: { incidents: EventPostReportIncident[] }) {
  if (!incidents.length) return <div data-testid="incidents-empty" style={{ color: '#9ca3af', fontSize: 13 }}>No incident references.</div>;
  return (
    <div>
      {incidents.map(inc => (
        <div key={inc.id} data-testid="incident-row" style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
          <strong>{inc.title}</strong>
          {inc.followup_required ? <span style={{ marginLeft: 8, color: '#92400e', fontSize: 11, fontWeight: 600 }}>↗ Follow-up</span> : null}
          {inc.summary && <div style={{ color: '#6b7280', marginTop: 2 }}>{inc.summary}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function EventPostReportDetail() {
  const { reportId: ridStr } = useParams<{ reportId: string }>();
  const reportId = Number(ridStr);
  const { can } = useCapabilities();
  const isAdmin = can('eventops.admin');

  const [report,    setReport]    = useState<EventPostReport | null>(null);
  const [sections,  setSections]  = useState<EventPostReportSection[]>([]);
  const [items,     setItems]     = useState<EventPostReportItem[]>([]);
  const [files,     setFiles]     = useState<EventPostReportFile[]>([]);
  const [incidents, setIncidents] = useState<EventPostReportIncident[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [busy,      setBusy]      = useState(false);

  const load = useCallback(async () => {
    if (!reportId) return;
    try {
      const [rRes, secRes, itemRes, fileRes, incRes] = await Promise.all([
        getPostReport(reportId),
        getPostReportSections(reportId),
        getPostReportItems(reportId),
        getPostReportFiles(reportId),
        getPostReportIncidents(reportId),
      ]);
      setReport(rRes.report);
      setSections(secRes.sections);
      setItems(itemRes.items);
      setFiles(fileRes.files);
      setIncidents(incRes.incidents);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading report…</div>;
  if (error)   return <div style={{ padding: '2rem', color: '#991b1b' }}>Error: {error}</div>;
  if (!report) return <div style={{ padding: '2rem' }}>Report not found.</div>;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link to={`/event-ops/${report.event_plan_id}/post-report`} style={{ fontSize: 13, color: '#2563eb' }}>← Post-Event Report Builder</Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 6, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{report.title || `Report #${report.id}`}</h1>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              <StatusBadge status={report.status} />
              {report.generated_at && <span style={{ fontSize: 12, color: '#6b7280' }}>Generated: {new Date(report.generated_at).toLocaleString()}</span>}
              {report.finalized_at && <span style={{ fontSize: 12, color: '#166534' }}>Finalized: {new Date(report.finalized_at).toLocaleString()}</span>}
            </div>
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(report.status as ReportStatus) !== 'finalized' && (
                <button
                  data-testid="finalize-btn"
                  disabled={busy}
                  onClick={() => act(() => finalizePostReport(reportId))}
                  style={{ padding: '7px 16px', background: '#166534', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                >
                  Finalize Report
                </button>
              )}
              {(report.status as ReportStatus) === 'finalized' && (
                <button
                  data-testid="reopen-btn"
                  disabled={busy}
                  onClick={() => act(() => reopenPostReport(reportId))}
                  style={{ padding: '7px 16px', background: '#92400e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                >
                  Reopen
                </button>
              )}
              <button
                data-testid="regenerate-btn"
                disabled={busy}
                onClick={() => act(() => regeneratePostReportSummary(reportId))}
                style={{ padding: '7px 16px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Regenerate
              </button>
              <button
                disabled
                title="Coming in Phase D"
                data-testid="pdf-export-btn"
                style={{ padding: '7px 16px', background: '#f3f4f6', color: '#9ca3af', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontSize: 13 }}
              >
                PDF Export (Coming Later)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Count summary */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24, padding: '12px 16px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        {[
          { l: 'Completed',     v: report.completed_task_count,     c: '#166534' },
          { l: 'Open',          v: report.open_task_count,          c: '#1d4ed8' },
          { l: 'Issues',        v: report.issue_task_count,         c: '#991b1b' },
          { l: 'Follow-ups',    v: report.followup_task_count,      c: '#92400e' },
          { l: 'Carry Forward', v: report.carry_forward_task_count, c: '#6d28d9' },
          { l: 'Incidents',     v: report.incident_count,           c: '#374151' },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Sections */}
      {sections.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Report Sections</div>
          {sections.map(s => (
            <SectionEditor key={s.id} section={s} reportId={reportId} isAdmin={isAdmin} onRefresh={load} />
          ))}
        </div>
      )}

      {/* Action items */}
      <ItemsPanel items={items} reportId={reportId} isAdmin={isAdmin} onRefresh={load} />

      {/* Files */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Files / Data Collection</div>
        <FilesPanel files={files} />
      </div>

      {/* Incidents */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Incident References</div>
        <IncidentsPanel incidents={incidents} />
      </div>
    </div>
  );
}
