import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCapabilities } from '../domain/config/useCapabilities';
import {
  getPlan, getPlanStaff, getPlanSections, getPlanSessions, getPlanTasks, getPlanFiles,
  type EventPlan, type EventPlanStaff, type EventPlanSection,
  type EventPlanSession, type EventPlanTask, type EventPlanFile,
} from '../domain/eventOps/eventOpsApi';
import EventSchedulePanel from './eventops/EventSchedulePanel';
import EventStaffPanel from './eventops/EventStaffPanel';

const S = {
  page:    { padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' } as React.CSSProperties,
  back:    { fontSize: '0.85rem', color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-block', marginBottom: '1rem' } as React.CSSProperties,
  header:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' as const } as React.CSSProperties,
  h1:      { fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 } as React.CSSProperties,
  meta:    { fontSize: '0.8rem', color: 'var(--color-muted)', marginTop: '0.3rem' } as React.CSSProperties,
  btn:     { padding: '0.45rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 } as React.CSSProperties,
  btnPrim: { backgroundColor: 'var(--color-primary)', color: '#fff' } as React.CSSProperties,
  tabs:    { display: 'flex', gap: '2px', borderBottom: '2px solid var(--color-border)', marginBottom: '1.5rem', flexWrap: 'wrap' as const } as React.CSSProperties,
  tab:     (active: boolean): React.CSSProperties => ({ padding: '0.5rem 1rem', cursor: 'pointer', background: 'none', border: 'none', borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent', fontWeight: active ? 700 : 400, color: active ? 'var(--color-primary)' : 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '-2px' }),
  card:    { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1rem' } as React.CSSProperties,
  prose:   { whiteSpace: 'pre-wrap' as const, fontSize: '0.875rem', color: 'var(--color-text)', lineHeight: 1.6 } as React.CSSProperties,
  table:   { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.8rem' },
  th:      { padding: '0.5rem 0.75rem', textAlign: 'left' as const, borderBottom: '2px solid var(--color-border)', color: 'var(--color-muted)', fontWeight: 600 },
  td:      { padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)' },
  empty:   { padding: '2rem 1rem', textAlign: 'center' as const, color: 'var(--color-muted)', fontSize: '0.875rem' },
  badge:   (color: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 7px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600, backgroundColor: color + '22', color }),
  error:   { padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b' } as React.CSSProperties,
};

const TABS = ['Overview', 'Staff', 'Schedule', 'Entries', 'Priority Inspections', 'Session Plan', 'Incident Plan', 'Files'] as const;
type TabName = typeof TABS[number];

function priorityColor(p: string) { return p === 'high' ? '#dc2626' : p === 'normal' ? '#2563eb' : '#6b7280'; }
function statusColor(s: string)   { return s === 'completed' ? '#16a34a' : s === 'cancelled' ? '#9ca3af' : s === 'in_progress' ? '#d97706' : '#6b7280'; }

function SectionView({ sections, keys }: { sections: EventPlanSection[]; keys: string[] }) {
  const filtered = sections.filter(s => keys.includes(s.section_key));
  if (!filtered.length) return <div style={S.empty}>No content yet.</div>;
  return <>{filtered.map(s => (
    <div key={s.id} style={S.card}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>{s.title}</h3>
      <div style={S.prose}>{s.body || <span style={{ color: 'var(--color-muted)' }}>No content.</span>}</div>
    </div>
  ))}</>;
}

export default function EventPlanDetail() {
  const { id } = useParams<{ id: string }>();
  const planId = parseInt(id ?? '0', 10);
  const { can } = useCapabilities();
  const canAdmin = can('eventops.admin');

  const [plan, setPlan]         = useState<EventPlan | null>(null);
  const [staff, setStaff]       = useState<EventPlanStaff[]>([]);
  const [sections, setSections] = useState<EventPlanSection[]>([]);
  const [sessions, setSessions] = useState<EventPlanSession[]>([]);
  const [tasks, setTasks]       = useState<EventPlanTask[]>([]);
  const [files, setFiles]       = useState<EventPlanFile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [activeTab, setActiveTab] = useState<TabName>('Overview');

  const reload = useCallback(() => {
    return Promise.all([
      getPlan(planId),
      getPlanStaff(planId),
      getPlanSections(planId),
      getPlanSessions(planId),
      getPlanTasks(planId),
      getPlanFiles(planId),
    ]).then(([p, st, sec, ses, t, f]) => {
      setPlan(p.plan);
      setStaff(st.staff);
      setSections(sec.sections);
      setSessions(ses.sessions);
      setTasks(t.tasks);
      setFiles(f.files);
    });
  }, [planId]);

  useEffect(() => {
    if (!planId) return;
    reload().then(() => setLoading(false)).catch(e => { setError(e.message); setLoading(false); });
  }, [planId, reload]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>Loading…</div>;
  if (error)   return <div style={{ padding: '2rem' }}><div style={S.error}>{error}</div></div>;
  if (!plan)   return <div style={{ padding: '2rem' }}><div style={S.error}>Plan not found.</div></div>;

  function renderOverview() {
    return (
      <div style={S.card}>
        <table style={{ fontSize: '0.875rem', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['Year', plan!.year],
              ['Event Code', plan!.event_code],
              ['Event Date', plan!.event_date ?? '—'],
              ['Track', plan!.track_name ?? '—'],
              ['Linked Event Instance', plan!.event_instance_id ? `#${plan!.event_instance_id}` : '—'],
              ['Class Scope', plan!.class_scope ?? 'All'],
              ['Plan Type', plan!.plan_type.replace('_', ' ')],
              ['Status', plan!.status.replace('_', ' ')],
              ['Lifecycle', (plan!.lifecycle_stage ?? 'pre_event').replace('_', ' ')],
              ['Summary', plan!.summary ?? '—'],
              ['Created', new Date(plan!.created_at).toLocaleString()],
              ['Updated', new Date(plan!.updated_at).toLocaleString()],
            ].map(([label, val]) => (
              <tr key={String(label)}>
                <td style={{ padding: '0.4rem 1rem 0.4rem 0', fontWeight: 600, color: 'var(--color-muted)', width: '160px', verticalAlign: 'top' }}>{label}</td>
                <td style={{ padding: '0.4rem 0', color: 'var(--color-text)' }}>{String(val)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSchedule() {
    const mapSections = sections.filter(s => s.section_key === 'event_map');
    const legacy = sections.filter(s => s.section_key === 'event_schedule');
    return (
      <div>
        <EventSchedulePanel planId={planId} plan={plan!} staff={staff} sessions={sessions} canAdmin={canAdmin} />
        {legacy.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-muted)', margin: '0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Legacy schedule notes
            </h3>
            <SectionView sections={sections} keys={['event_schedule']} />
          </div>
        )}
        {mapSections.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-muted)', margin: '0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Map
            </h3>
            <SectionView sections={sections} keys={['event_map']} />
          </div>
        )}
      </div>
    );
  }

  function renderSessions() {
    if (!sessions.length) return <div style={S.empty}>No sessions defined yet.</div>;
    return sessions.map(ses => {
      const sessTasks = tasks.filter(t => t.session_id === ses.id);
      return (
        <div key={ses.id} style={S.card}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700 }}>{ses.title}</h3>
          {ses.class_scope && <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>Classes: {ses.class_scope}</div>}
          {ses.scheduled_at && <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>Scheduled: {new Date(ses.scheduled_at).toLocaleString()}</div>}
          {ses.notes && <div style={{ fontSize: '0.875rem', color: 'var(--color-text)', marginBottom: '0.75rem' }}>{ses.notes}</div>}
          {sessTasks.length > 0 && (
            <table style={{ ...S.table, marginTop: '0.5rem' }}>
              <thead><tr><th style={S.th}>Task</th><th style={S.th}>Type</th><th style={S.th}>Priority</th><th style={S.th}>Status</th></tr></thead>
              <tbody>{sessTasks.map(t => (
                <tr key={t.id}>
                  <td style={S.td}>{t.title}</td>
                  <td style={S.td}>{t.task_type}</td>
                  <td style={S.td}><span style={S.badge(priorityColor(t.priority))}>{t.priority}</span></td>
                  <td style={S.td}><span style={S.badge(statusColor(t.status))}>{t.status.replace('_', ' ')}</span></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      );
    });
  }

  function renderFiles() {
    if (!files.length) return <div style={S.empty}>No files attached yet.</div>;
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={S.table}>
          <thead><tr><th style={S.th}>Type</th><th style={S.th}>Title</th><th style={S.th}>Link</th><th style={S.th}>Notes</th></tr></thead>
          <tbody>{files.map(f => (
            <tr key={f.id}>
              <td style={S.td}>{f.file_type}</td>
              <td style={S.td}>{f.title}</td>
              <td style={S.td}>{f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>Open</a> : '—'}</td>
              <td style={S.td}>{f.notes ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  const tabContent: Record<TabName, React.ReactNode> = {
    'Overview': renderOverview(),
    'Staff': <EventStaffPanel planId={planId} staff={staff} canAdmin={canAdmin} onChanged={reload} />,
    'Schedule': renderSchedule(),
    'Entries': <SectionView sections={sections} keys={['entries']} />,
    'Priority Inspections': <SectionView sections={sections} keys={['priority_inspections']} />,
    'Session Plan': renderSessions(),
    'Incident Plan': <SectionView sections={sections} keys={['incident_plan']} />,
    'Files': renderFiles(),
  };

  return (
    <div style={S.page}>
      <Link to="/event-ops" style={S.back}>← Event Ops</Link>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>{plan.title}</h1>
          <div style={S.meta}>{plan.year} · {plan.event_code}{plan.track_name ? ` · ${plan.track_name}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            to={`/event-ops/${planId}/sheet`}
            data-testid="schedule-sheet-link"
            style={{ ...S.btn, backgroundColor: '#0f766e', color: '#fff', textDecoration: 'none' } as React.CSSProperties}
          >
            Schedule Sheet
          </Link>
          <Link
            to={`/event-ops/${planId}/live`}
            data-testid="live-checklist-link"
            style={{ ...S.btn, backgroundColor: '#16a34a', color: '#fff', textDecoration: 'none' } as React.CSSProperties}
          >
            Live Checklist
          </Link>
          <Link
            to={`/event-ops/${planId}/post-report`}
            data-testid="post-report-link"
            style={{ ...S.btn, backgroundColor: '#7c3aed', color: '#fff', textDecoration: 'none' } as React.CSSProperties}
          >
            Post-Event Report
          </Link>
          {canAdmin && (
            <Link to={`/event-ops/${planId}/pre-plan`} style={{ ...S.btn, ...S.btnPrim, textDecoration: 'none' } as React.CSSProperties}>
              Edit Plan
            </Link>
          )}
        </div>
      </div>

      <div style={S.tabs}>
        {TABS.map(t => <button key={t} style={S.tab(activeTab === t)} onClick={() => setActiveTab(t)}>{t}</button>)}
      </div>

      <div data-testid={`event-plan-tab-${activeTab.toLowerCase().replace(/[\s/]+/g, '-')}`}>
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
