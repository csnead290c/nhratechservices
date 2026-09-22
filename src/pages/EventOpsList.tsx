import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCapabilities } from '../domain/config/useCapabilities';
import { listPlans, createPlan, type EventPlan, type PlanType } from '../domain/eventOps/eventOpsApi';
import { techMasterApi, type EventInstance } from '../services/techMasterApi';

const S = {
  page:     { padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' } as React.CSSProperties,
  header:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem' } as React.CSSProperties,
  h1:       { fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 } as React.CSSProperties,
  btn:      { padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 } as React.CSSProperties,
  btnPrim:  { backgroundColor: 'var(--color-primary)', color: '#fff' } as React.CSSProperties,
  table:    { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.875rem' },
  th:       { padding: '0.6rem 0.75rem', textAlign: 'left' as const, borderBottom: '2px solid var(--color-border)', color: 'var(--color-muted)', fontWeight: 600, whiteSpace: 'nowrap' as const },
  td:       { padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)' },
  empty:    { padding: '3rem 1rem', textAlign: 'center' as const, color: 'var(--color-muted)', fontSize: '1rem' },
  error:    { padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b', marginBottom: '1rem' },
  modal:    { position: 'fixed' as const, inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  card:     { backgroundColor: 'var(--color-surface)', borderRadius: '10px', padding: '1.5rem', minWidth: '380px', maxWidth: '500px', width: '100%', boxShadow: 'var(--shadow-lg)' },
  label:    { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '0.3rem', marginTop: '1rem' },
  input:    { width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem', boxSizing: 'border-box' as const },
  row:      { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' },
};

function statusBadge(status: string) {
  const colors: Record<string, string> = { draft: '#6b7280', pending_review: '#d97706', approved: '#16a34a', archived: '#9ca3af' };
  return <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: (colors[status] ?? '#6b7280') + '22', color: colors[status] ?? '#6b7280' }}>{status.replace('_', ' ')}</span>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface CreateModalProps {
  onClose: () => void;
  onCreated: (id: number) => void;
}

function CreatePlanModal({ onClose, onCreated, canTechRead }: CreateModalProps & { canTechRead: boolean }) {
  const [form, setForm] = useState({ year: new Date().getFullYear(), event_code: '', title: '', track_name: '', class_scope: '', plan_type: 'pre_event' as PlanType, event_date: '', event_instance_id: '' });
  const [events, setEvents] = useState<EventInstance[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Load linkable event instances (Tech Master) so the plan reuses the canonical
  // event identity instead of creating a parallel one.
  useEffect(() => {
    if (!canTechRead) return;
    techMasterApi.listEvents({ limit: 100 })
      .then(r => setEvents(r.events.filter(e => e.status !== 'cancelled')))
      .catch(() => { /* tech events unavailable — linking stays optional */ });
  }, [canTechRead]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: k === 'year' ? parseInt(e.target.value) || f.year : e.target.value }));

  function pickEvent(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setForm(f => {
      const next = { ...f, event_instance_id: id };
      const ev = events.find(x => String(x.id) === id);
      if (ev) {
        next.event_code = ev.event_code ?? f.event_code;
        next.title = f.title || `${ev.name}`;
        next.track_name = ev.track_name ?? f.track_name;
        next.event_date = ev.start_date_local ?? f.event_date;
        if (ev.season_year) next.year = ev.season_year;
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.event_code.trim() || !form.title.trim()) { setErr('Event Code and Title are required.'); return; }
    setSaving(true); setErr('');
    try {
      const res = await createPlan({
        ...form,
        track_name: form.track_name || undefined,
        class_scope: form.class_scope || undefined,
        event_date: form.event_date || undefined,
        event_instance_id: form.event_instance_id ? parseInt(form.event_instance_id, 10) : undefined,
      });
      onCreated(res.plan_id);
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Failed to create plan');
      setSaving(false);
    }
  }

  return (
    <div style={S.modal} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.card}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700 }}>New Event Plan</h2>
        {err && <div style={{ ...S.error, marginTop: '0.75rem' }}>{err}</div>}
        <form onSubmit={submit}>
          {events.length > 0 && (
            <>
              <label style={S.label}>Link Event Instance (optional)</label>
              <select style={S.input} value={form.event_instance_id} onChange={pickEvent} data-testid="event-instance-select">
                <option value="">— standalone plan —</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.season_year ?? ''} {ev.name}{ev.event_code ? ` (${ev.event_code})` : ''}{ev.track_name ? ` — ${ev.track_name}` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
          <label style={S.label}>Year</label>
          <input style={S.input} type="number" value={form.year} onChange={set('year')} min={2020} max={2040} required />
          <label style={S.label}>Event Code *</label>
          <input style={S.input} placeholder="e.g. POMONA_Q1" value={form.event_code} onChange={set('event_code')} required />
          <label style={S.label}>Title *</label>
          <input style={S.input} placeholder="e.g. 2026 Winternationals Pre-Event Plan" value={form.title} onChange={set('title')} required />
          <label style={S.label}>Track Name</label>
          <input style={S.input} placeholder="e.g. Auto Club Raceway at Pomona" value={form.track_name} onChange={set('track_name')} />
          <label style={S.label}>Event Date (first day)</label>
          <input style={S.input} type="date" value={form.event_date} onChange={set('event_date')} />
          <label style={S.label}>Class Scope</label>
          <input style={S.input} placeholder="e.g. TF,FC or leave blank for all" value={form.class_scope} onChange={set('class_scope')} />
          <label style={S.label}>Plan Type</label>
          <select style={S.input} value={form.plan_type} onChange={set('plan_type')}>
            <option value="pre_event">Pre-Event</option>
            <option value="race_day">Race Day</option>
            <option value="post_event">Post-Event</option>
            <option value="template">Template</option>
          </select>
          <div style={S.row}>
            <button type="button" style={S.btn} onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" style={{ ...S.btn, ...S.btnPrim }} disabled={saving}>{saving ? 'Creating…' : 'Create Plan'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EventOpsList() {
  const { can } = useCapabilities();
  const canAdmin = can('eventops.admin');
  const [plans, setPlans] = useState<EventPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    listPlans()
      .then(r => { setPlans(r.plans); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  function handleCreated(id: number) {
    setShowCreate(false);
    listPlans().then(r => setPlans(r.plans));
    window.location.href = `/event-ops/${id}/pre-plan`;
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>Loading event plans…</div>;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.h1}>Event Operations</h1>
        {canAdmin && <button style={{ ...S.btn, ...S.btnPrim }} onClick={() => setShowCreate(true)}>+ New Plan</button>}
      </div>

      {error && <div style={S.error}>{error}</div>}

      {plans.length === 0 ? (
        <div data-testid="event-ops-empty" style={S.empty}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📋</div>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No event plans yet</div>
          {canAdmin
            ? <div>Click <strong>+ New Plan</strong> to create the first pre-event plan.</div>
            : <div>No event plans have been created yet.</div>}
        </div>
      ) : (
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Year</th>
              <th style={S.th}>Event Code</th>
              <th style={S.th}>Title</th>
              <th style={S.th}>Track</th>
              <th style={S.th}>Class Scope</th>
              <th style={S.th}>Type</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Updated</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {plans.map(p => (
              <tr key={p.id}>
                <td style={S.td}>{p.year}</td>
                <td style={S.td}><code style={{ fontSize: '0.8rem' }}>{p.event_code}</code></td>
                <td style={S.td}>{p.title}</td>
                <td style={S.td}>{p.track_name ?? <span style={{ color: 'var(--color-muted)' }}>—</span>}</td>
                <td style={S.td}>{p.class_scope ?? <span style={{ color: 'var(--color-muted)' }}>All</span>}</td>
                <td style={S.td}>{p.plan_type.replace('_', ' ')}</td>
                <td style={S.td}>{statusBadge(p.status)}</td>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtDate(p.updated_at)}</td>
                <td style={S.td}>
                  <Link to={`/event-ops/${p.id}`} style={{ color: 'var(--color-primary)', fontSize: '0.8rem', fontWeight: 600 }}>View</Link>
                  {canAdmin && <> · <Link to={`/event-ops/${p.id}/pre-plan`} style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>Edit</Link></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && <CreatePlanModal canTechRead={can('nhra.tech.read')} onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  );
}
