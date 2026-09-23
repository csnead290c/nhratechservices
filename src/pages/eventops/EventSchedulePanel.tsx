/**
 * EventSchedulePanel — structured event schedule for an Event Ops plan.
 *
 * Replaces the legacy freeform `event_schedule` markdown section with
 * structured rows (migration v40): time, projected, activity/category,
 * round, car count, comments, scale/fuel flags, status, and per-item
 * staff assignments.
 *
 * Read-only for eventops.read; full inline CRUD for eventops.admin.
 * Desktop renders a table; mobile renders cards.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '../../shared/hooks/useResponsive';
import {
  getSchedule,
  addScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  duplicateScheduleItem,
  reorderScheduleItems,
  setScheduleItemStatus,
  addScheduleAssignment,
  deleteScheduleAssignment,
  ACTIVITY_TYPES,
  SCHEDULE_STATUSES,
  CATEGORY_SUGGESTIONS,
  RESPONSIBILITY_SUGGESTIONS,
  fmtScheduleTime,
  type EventPlan,
  type EventPlanStaff,
  type EventPlanSession,
  type EventScheduleItem,
  type ScheduleStatus,
  type ActivityType,
} from '../../domain/eventOps/eventOpsApi';

// ── Styles (match EventPlanDetail inline-style conventions) ─────────────────

const S = {
  card:    { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1rem' } as React.CSSProperties,
  table:   { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.8rem' },
  th:      { padding: '0.5rem 0.6rem', textAlign: 'left' as const, borderBottom: '2px solid var(--color-border)', color: 'var(--color-muted)', fontWeight: 600, whiteSpace: 'nowrap' as const },
  td:      { padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)', verticalAlign: 'top' as const },
  btn:     { padding: '0.35rem 0.7rem', borderRadius: '6px', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties,
  btnPrim: { backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none' } as React.CSSProperties,
  btnDang: { backgroundColor: '#dc2626', color: '#fff', border: 'none' } as React.CSSProperties,
  dayChip: (active: boolean): React.CSSProperties => ({
    padding: '0.35rem 0.8rem', borderRadius: '9999px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: active ? 700 : 500,
    border: '1px solid var(--color-border)', backgroundColor: active ? 'var(--color-primary)' : 'var(--color-bg)',
    color: active ? '#fff' : 'var(--color-text)', whiteSpace: 'nowrap' as const,
  }),
  badge:   (color: string): React.CSSProperties => ({ display: 'inline-block', padding: '1px 7px', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 600, backgroundColor: color + '22', color, whiteSpace: 'nowrap' as const }),
  flag:    (on: boolean): React.CSSProperties => ({ display: 'inline-block', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: on ? '#dbeafe' : 'transparent', color: on ? '#1d4ed8' : 'var(--color-muted)', border: on ? '1px solid #93c5fd' : '1px solid var(--color-border)' }),
  empty:   { padding: '2rem 1rem', textAlign: 'center' as const, color: 'var(--color-muted)', fontSize: '0.875rem' },
  error:   { padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b', marginBottom: '1rem' } as React.CSSProperties,
  modal:   { position: 'fixed' as const, inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', overflowY: 'auto' as const, padding: '2rem 0.75rem' },
  modalCard: { backgroundColor: 'var(--color-surface)', borderRadius: '10px', padding: '1.25rem', width: '100%', maxWidth: '640px', boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.25))' } as React.CSSProperties,
  label:   { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '0.2rem', marginTop: '0.7rem' } as React.CSSProperties,
  input:   { width: '100%', padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.85rem', boxSizing: 'border-box' as const } as React.CSSProperties,
  grid2:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0 0.75rem' } as React.CSSProperties,
  toast:   (ok: boolean): React.CSSProperties => ({ padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, backgroundColor: ok ? '#dcfce7' : '#fef2f2', color: ok ? '#166534' : '#991b1b', border: `1px solid ${ok ? '#86efac' : '#fca5a5'}`, marginBottom: '1rem' }),
  mobCard: { border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.65rem 0.8rem', marginBottom: '0.6rem', backgroundColor: 'var(--color-bg)' } as React.CSSProperties,
};

const STATUS_COLORS: Record<string, string> = {
  upcoming: '#6b7280', called: '#2563eb', running: '#d97706',
  complete: '#16a34a', delayed: '#ea580c', cancelled: '#9ca3af',
};

const UNscheduled = '__unscheduled__';

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function statusBadge(status: string) {
  const label = SCHEDULE_STATUSES.find(s => s.value === status)?.label ?? status;
  return <span style={S.badge(STATUS_COLORS[status] ?? '#6b7280')} data-testid={`item-status-${status}`}>{label}</span>;
}

// ── Assignment sub-editor (inside item modal) ────────────────────────────────

const OTHER_STAFF = '__other__';

interface DraftAssignment {
  staff_id: number | null;
  assignee_name: string;
  responsibility: string;
  notes: string;
}

function AssignmentEditor({
  staff, existing, pending, onDeleteExisting, onChangePending,
}: {
  staff: EventPlanStaff[];
  existing: EventScheduleItem['assignments'];
  pending: DraftAssignment[];
  onDeleteExisting: (assignmentId: number) => void;
  onChangePending: (next: DraftAssignment[]) => void;
}) {
  const setPending = (i: number, k: keyof DraftAssignment, v: string) => {
    const next = pending.slice();
    next[i] = { ...next[i], [k]: v };
    onChangePending(next);
  };

  return (
    <div>
      {existing.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem' }}>
          <span style={{ flex: 1 }}>
            <strong>{a.staff_display_name ?? a.assignee_name ?? '—'}</strong> — {a.responsibility}
            {a.notes ? <span style={{ color: 'var(--color-muted)' }}> · {a.notes}</span> : null}
          </span>
          <button type="button" style={{ ...S.btn, ...S.btnDang, padding: '0.15rem 0.5rem' }} onClick={() => onDeleteExisting(a.id)}>×</button>
        </div>
      ))}
      {pending.map((p, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center' }}>
          <select
            style={S.input}
            value={p.staff_id !== null ? String(p.staff_id) : (p.assignee_name !== null && (p as DraftAssignment & { _other?: boolean })._other ? OTHER_STAFF : '')}
            onChange={e => {
              const next = pending.slice();
              if (e.target.value === OTHER_STAFF) {
                next[i] = { ...p, staff_id: null, assignee_name: p.assignee_name ?? '' };
                (next[i] as DraftAssignment & { _other?: boolean })._other = true;
              } else {
                next[i] = { ...p, staff_id: e.target.value ? parseInt(e.target.value, 10) : null, assignee_name: '' };
                delete (next[i] as DraftAssignment & { _other?: boolean })._other;
              }
              onChangePending(next);
            }}
            aria-label="assignee"
          >
            <option value="">— Select staff —</option>
            {staff.filter(s => s.is_active !== 0).map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
            <option value={OTHER_STAFF}>Someone not on staff list…</option>
          </select>
          <input style={S.input} list="eo-resp-list" placeholder="Responsibility" value={p.responsibility} onChange={e => setPending(i, 'responsibility', e.target.value)} />
          <button type="button" style={{ ...S.btn, padding: '0.3rem 0.55rem' }} onClick={() => onChangePending(pending.filter((_, j) => j !== i))}>×</button>
          {(p as DraftAssignment & { _other?: boolean })._other && (
            <input style={{ ...S.input, gridColumn: '1 / -1' }} placeholder="Name (one-off / non-staff assignee)" value={p.assignee_name} onChange={e => setPending(i, 'assignee_name', e.target.value)} />
          )}
        </div>
      ))}
      <datalist id="eo-resp-list">
        {RESPONSIBILITY_SUGGESTIONS.map(r => <option key={r} value={r} />)}
      </datalist>
      <button type="button" style={{ ...S.btn, marginTop: '0.5rem' }} onClick={() => onChangePending([...pending, { staff_id: null, assignee_name: '', responsibility: '', notes: '' }])}>
        + Add assignment
      </button>
    </div>
  );
}

// ── Item edit modal ──────────────────────────────────────────────────────────

interface ItemModalProps {
  planId: number;
  item: EventScheduleItem | null;   // null = create
  defaultDate: string | null;
  staff: EventPlanStaff[];
  sessions: EventPlanSession[];
  onClose: () => void;
  onSaved: () => void;
}

function ScheduleItemModal({ planId, item, defaultDate, staff, sessions, onClose, onSaved }: ItemModalProps) {
  const [form, setForm] = useState({
    schedule_date: item?.schedule_date ?? defaultDate ?? '',
    day_label: item?.day_label ?? '',
    title: item?.title ?? '',
    scheduled_time: item ? (item.scheduled_time_label ?? item.scheduled_time?.slice(0, 5) ?? '') : '',
    projected_time: item ? (item.projected_time_label ?? item.projected_time?.slice(0, 5) ?? '') : '',
    activity_type: (item?.activity_type ?? 'other') as ActivityType,
    category_code: item?.category_code ?? '',
    round_label: item?.round_label ?? '',
    expected_car_count: item?.expected_car_count?.toString() ?? '',
    comments: item?.comments ?? '',
    scale_required: !!item?.scale_required,
    fuel_required: !!item?.fuel_required,
    status: (item?.status ?? 'upcoming') as ScheduleStatus,
    session_id: item?.session_id?.toString() ?? '',
  });
  const [pending, setPending] = useState<DraftAssignment[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function save() {
    if (!form.title.trim()) { setErr('Activity title is required.'); return; }
    setSaving(true); setErr('');
    const payload = {
      schedule_date: form.schedule_date || null,
      day_label: form.day_label || null,
      title: form.title.trim(),
      scheduled_time: form.scheduled_time || null,
      projected_time: form.projected_time || null,
      activity_type: form.activity_type,
      category_code: form.category_code || null,
      round_label: form.round_label || null,
      expected_car_count: form.expected_car_count ? parseInt(form.expected_car_count, 10) : null,
      comments: form.comments || null,
      scale_required: form.scale_required ? 1 : 0,
      fuel_required: form.fuel_required ? 1 : 0,
      status: form.status,
      session_id: form.session_id ? parseInt(form.session_id, 10) : null,
    };
    try {
      let itemId = item?.id;
      if (itemId) {
        await updateScheduleItem(itemId, payload);
      } else {
        const res = await addScheduleItem(planId, { ...payload, title: payload.title });
        itemId = res.item_id;
      }
      for (const a of pending) {
        if (!a.responsibility.trim()) continue;
        await addScheduleAssignment(itemId!, {
          staff_id: a.staff_id,
          assignee_name: a.assignee_name || undefined,
          responsibility: a.responsibility.trim(),
          notes: a.notes || undefined,
        });
      }
      onSaved();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Save failed');
      setSaving(false);
    }
  }

  async function removeAssignment(assignmentId: number) {
    try { await deleteScheduleAssignment(assignmentId); onSaved(); }
    catch (ex: unknown) { setErr(ex instanceof Error ? ex.message : 'Delete failed'); }
  }

  return (
    <div style={S.modal} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modalCard} data-testid="schedule-item-modal">
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>{item ? 'Edit Schedule Item' : 'Add Schedule Item'}</h2>
        {err && <div style={S.error}>{err}</div>}

        <div style={S.grid2}>
          <div>
            <label style={S.label}>Date</label>
            <input style={S.input} type="date" value={form.schedule_date} onChange={set('schedule_date')} />
          </div>
          <div>
            <label style={S.label}>Day Label</label>
            <input style={S.input} placeholder="e.g. Thursday" value={form.day_label} onChange={set('day_label')} />
          </div>
          <div>
            <label style={S.label}>Scheduled Time</label>
            <input style={S.input} placeholder="08:00 / TBD / Following TF" value={form.scheduled_time} onChange={set('scheduled_time')} />
          </div>
          <div>
            <label style={S.label}>Projected Time</label>
            <input style={S.input} placeholder="optional" value={form.projected_time} onChange={set('projected_time')} />
          </div>
        </div>

        <label style={S.label}>Activity / Title *</label>
        <input style={S.input} placeholder="e.g. Tech Team Meeting, Top Fuel, Teardown" value={form.title} onChange={set('title')} />

        <div style={S.grid2}>
          <div>
            <label style={S.label}>Activity Type</label>
            <select style={S.input} value={form.activity_type} onChange={set('activity_type')}>
              {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Class / Category</label>
            <input style={S.input} list="eo-cat-list" placeholder="TF, FC, PS…" value={form.category_code} onChange={set('category_code')} />
            <datalist id="eo-cat-list">{CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label style={S.label}>Round / Session</label>
            <input style={S.input} placeholder="R1, Q2, Final…" value={form.round_label} onChange={set('round_label')} />
          </div>
          <div>
            <label style={S.label}>Expected Cars</label>
            <input style={S.input} type="number" min={0} value={form.expected_car_count} onChange={set('expected_car_count')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.scale_required} onChange={set('scale_required')} /> Scale required
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.fuel_required} onChange={set('fuel_required')} /> Fuel check required
          </label>
        </div>

        <div style={S.grid2}>
          <div>
            <label style={S.label}>Status</label>
            <select style={S.input} value={form.status} onChange={set('status')}>
              {SCHEDULE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Linked Session Plan (optional)</label>
            <select style={S.input} value={form.session_id} onChange={set('session_id')}>
              <option value="">— none —</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
        </div>

        <label style={S.label}>Comments</label>
        <textarea style={{ ...S.input, minHeight: '60px', fontFamily: 'inherit' }} value={form.comments} onChange={set('comments')} />

        <label style={S.label}>Assignments (person → responsibility for this item)</label>
        <AssignmentEditor
          staff={staff}
          existing={item?.assignments ?? []}
          pending={pending}
          onDeleteExisting={removeAssignment}
          onChangePending={setPending}
        />

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" style={S.btn} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" style={{ ...S.btn, ...S.btnPrim }} onClick={save} disabled={saving} data-testid="schedule-item-save">
            {saving ? 'Saving…' : item ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function EventSchedulePanel({
  planId, plan, staff, sessions, canAdmin,
}: {
  planId: number;
  plan: EventPlan;
  staff: EventPlanStaff[];
  sessions: EventPlanSession[];
  canAdmin: boolean;
}) {
  const isMobile = useIsMobile();
  const [items, setItems] = useState<EventScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [activeDate, setActiveDate] = useState<string>('all');
  const [modal, setModal] = useState<{ item: EventScheduleItem | null; date: string | null } | null>(null);

  const showToast = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3000); };

  const reload = useCallback(async () => {
    const res = await getSchedule(planId);
    setItems(res.items);
    return res;
  }, [planId]);

  useEffect(() => {
    reload()
      .then(() => setLoading(false))
      .catch(e => { setError(e.message); setLoading(false); });
  }, [reload]);

  // Group items by date (null → unscheduled bucket)
  const grouped = useMemo(() => {
    const map = new Map<string, EventScheduleItem[]>();
    for (const it of items) {
      const key = it.schedule_date ?? UNscheduled;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [items]);

  const dayKeys = useMemo(() => {
    const keys = [...grouped.keys()].filter(k => k !== UNscheduled).sort();
    if (grouped.has(UNscheduled)) keys.push(UNscheduled);
    return keys;
  }, [grouped]);

  const visibleKeys = activeDate === 'all' ? dayKeys : [activeDate];

  async function move(item: EventScheduleItem, dir: -1 | 1) {
    const key = item.schedule_date ?? UNscheduled;
    const dayItems = grouped.get(key) ?? [];
    const idx = dayItems.findIndex(i => i.id === item.id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= dayItems.length) return;
    const ids = dayItems.map(i => i.id);
    [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
    try { await reorderScheduleItems(planId, ids); await reload(); }
    catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Reorder failed'); }
  }

  async function remove(item: EventScheduleItem) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try { await deleteScheduleItem(item.id); await reload(); showToast(true, 'Item deleted.'); }
    catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Delete failed'); }
  }

  async function duplicate(item: EventScheduleItem) {
    try { await duplicateScheduleItem(item.id); await reload(); showToast(true, 'Item duplicated.'); }
    catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Duplicate failed'); }
  }

  async function quickStatus(item: EventScheduleItem, status: ScheduleStatus) {
    try { await setScheduleItemStatus(item.id, status); await reload(); }
    catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Status update failed'); }
  }

  function assignmentSummary(item: EventScheduleItem): string {
    return (item.assignments ?? [])
      .map(a => `${a.staff_display_name ?? a.assignee_name ?? '?'} → ${a.responsibility}`)
      .join(' · ');
  }

  function adminControls(item: EventScheduleItem, key: string) {
    const dayItems = grouped.get(key) ?? [];
    const idx = dayItems.findIndex(i => i.id === item.id);
    return (
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        <button style={{ ...S.btn, padding: '0.2rem 0.5rem' }} title="Move up" disabled={idx <= 0} onClick={() => move(item, -1)}>↑</button>
        <button style={{ ...S.btn, padding: '0.2rem 0.5rem' }} title="Move down" disabled={idx >= dayItems.length - 1} onClick={() => move(item, 1)}>↓</button>
        <button style={{ ...S.btn, padding: '0.2rem 0.5rem' }} title="Edit" onClick={() => setModal({ item, date: null })}>Edit</button>
        <button style={{ ...S.btn, padding: '0.2rem 0.5rem' }} title="Duplicate" onClick={() => duplicate(item)}>⧉</button>
        <button style={{ ...S.btn, ...S.btnDang, padding: '0.2rem 0.5rem' }} title="Delete" onClick={() => remove(item)}>×</button>
      </div>
    );
  }

  function renderRow(item: EventScheduleItem, key: string) {
    const summary = assignmentSummary(item);
    return (
      <tr key={item.id} data-testid={`schedule-item-${item.id}`}>
        <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtScheduleTime(item.scheduled_time, item.scheduled_time_label)}</td>
        <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtScheduleTime(item.projected_time, item.projected_time_label)}</td>
        <td style={S.td}>
          <div style={{ fontWeight: 600 }}>{item.title}</div>
          {item.category_code && <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{item.category_code}</span>}
          {summary && <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: '0.15rem' }}>{summary}</div>}
        </td>
        <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{item.round_label ?? '—'}</td>
        <td style={{ ...S.td, textAlign: 'center' }}>{item.expected_car_count ?? '—'}</td>
        <td style={{ ...S.td, maxWidth: '220px' }}>{item.comments ?? ''}</td>
        <td style={{ ...S.td, textAlign: 'center' }}><span style={S.flag(!!item.scale_required)}>SCALE</span></td>
        <td style={{ ...S.td, textAlign: 'center' }}><span style={S.flag(!!item.fuel_required)}>FUEL</span></td>
        <td style={S.td}>
          <select
            style={{ ...S.input, width: 'auto', padding: '0.15rem 0.3rem', fontSize: '0.72rem' }}
            value={item.status}
            disabled={!canAdmin}
            onChange={e => quickStatus(item, e.target.value as ScheduleStatus)}
            aria-label="status"
          >
            {SCHEDULE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </td>
        {canAdmin && <td style={S.td}>{adminControls(item, key)}</td>}
      </tr>
    );
  }

  function renderCard(item: EventScheduleItem, key: string) {
    const summary = assignmentSummary(item);
    return (
      <div key={item.id} style={S.mobCard} data-testid={`schedule-item-${item.id}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
              {(item.scheduled_time || item.scheduled_time_label) ? <span style={{ color: 'var(--color-primary)', marginRight: '0.4rem' }}>{fmtScheduleTime(item.scheduled_time, item.scheduled_time_label)}</span> : null}
              {item.title}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.15rem' }}>
              {[
                (item.projected_time || item.projected_time_label) ? `Proj ${fmtScheduleTime(item.projected_time, item.projected_time_label)}` : null,
                item.category_code,
                item.round_label,
                item.expected_car_count != null ? `${item.expected_car_count} cars` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          {statusBadge(item.status)}
        </div>
        {(item.scale_required || item.fuel_required) && (
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
            {!!item.scale_required && <span style={S.flag(true)}>SCALE</span>}
            {!!item.fuel_required && <span style={S.flag(true)}>FUEL</span>}
          </div>
        )}
        {item.comments && <div style={{ fontSize: '0.78rem', color: 'var(--color-text)', marginTop: '0.35rem' }}>{item.comments}</div>}
        {summary && <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.3rem' }}>{summary}</div>}
        {canAdmin && <div style={{ marginTop: '0.5rem' }}>{adminControls(item, key)}</div>}
      </div>
    );
  }

  if (loading) return <div style={S.empty}>Loading schedule…</div>;
  if (error) return <div style={S.error}>{error}</div>;

  return (
    <div data-testid="event-schedule-panel">
      {toast && <div style={S.toast(toast.ok)}>{toast.msg}</div>}

      {/* Day filter chips */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <button style={S.dayChip(activeDate === 'all')} onClick={() => setActiveDate('all')}>All days</button>
        {dayKeys.map(k => (
          <button key={k} style={S.dayChip(activeDate === k)} onClick={() => setActiveDate(k)}>
            {k === UNscheduled ? 'No date' : fmtDate(k)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {canAdmin && (
          <button
            style={{ ...S.btn, ...S.btnPrim }}
            data-testid="add-schedule-item"
            onClick={() => setModal({ item: null, date: activeDate !== 'all' && activeDate !== UNscheduled ? activeDate : (plan.event_date ?? null) })}
          >
            + Add Item
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div style={S.empty}>
          No structured schedule items yet.
          {canAdmin && <div style={{ marginTop: '0.5rem' }}>Click <strong>+ Add Item</strong> to build the event schedule.</div>}
        </div>
      )}

      {visibleKeys.map(key => {
        const dayItems = grouped.get(key) ?? [];
        if (!dayItems.length) return null;
        const label = key === UNscheduled ? 'No date assigned' : fmtDate(key);
        const dayLabel = dayItems.find(i => i.day_label)?.day_label;
        return (
          <div key={key} style={S.card} data-testid={`schedule-day-${key}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                {dayLabel ? `${dayLabel} — ` : ''}{label}
              </h3>
              {canAdmin && (
                <button style={{ ...S.btn, fontSize: '0.72rem' }} onClick={() => setModal({ item: null, date: key === UNscheduled ? null : key })}>
                  + Add to this day
                </button>
              )}
            </div>
            {isMobile ? (
              <div>{dayItems.map(it => renderCard(it, key))}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Time</th>
                      <th style={S.th}>Projected</th>
                      <th style={S.th}>Activity / Category</th>
                      <th style={S.th}>Round</th>
                      <th style={{ ...S.th, textAlign: 'center' }}>Cars</th>
                      <th style={S.th}>Comments</th>
                      <th style={{ ...S.th, textAlign: 'center' }}>Scale</th>
                      <th style={{ ...S.th, textAlign: 'center' }}>Fuel</th>
                      <th style={S.th}>Status</th>
                      {canAdmin && <th style={S.th}></th>}
                    </tr>
                  </thead>
                  <tbody>{dayItems.map(it => renderRow(it, key))}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {modal && (
        <ScheduleItemModal
          planId={planId}
          item={modal.item}
          defaultDate={modal.date}
          staff={staff}
          sessions={sessions}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); showToast(true, 'Saved.'); }}
        />
      )}
    </div>
  );
}
