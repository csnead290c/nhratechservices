/**
 * EventStaffPanel — event staffing view/editor for an Event Ops plan.
 *
 * Shows name, assignment, radio, vehicle, phone, arrive/depart, duties, notes.
 * Desktop renders a table; mobile renders stacked cards.
 * Admin users get add/edit/delete plus per-person duty chips (v40).
 */

import { useState } from 'react';
import { useIsMobile } from '../../shared/hooks/useResponsive';
import {
  addStaff,
  updateStaff,
  deleteStaff,
  addStaffDuty,
  deleteStaffDuty,
  DUTY_SUGGESTIONS,
  type EventPlanStaff,
} from '../../domain/eventOps/eventOpsApi';

const S = {
  card:    { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1rem' } as React.CSSProperties,
  table:   { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.8rem' },
  th:      { padding: '0.5rem 0.6rem', textAlign: 'left' as const, borderBottom: '2px solid var(--color-border)', color: 'var(--color-muted)', fontWeight: 600, whiteSpace: 'nowrap' as const },
  td:      { padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)', verticalAlign: 'top' as const },
  btn:     { padding: '0.35rem 0.7rem', borderRadius: '6px', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties,
  btnPrim: { backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none' } as React.CSSProperties,
  btnDang: { backgroundColor: '#dc2626', color: '#fff', border: 'none' } as React.CSSProperties,
  chip:    { display: 'inline-block', padding: '1px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600, backgroundColor: 'var(--color-surface-alt)', color: 'var(--color-text)', border: '1px solid var(--color-border)', marginRight: '0.3rem', marginBottom: '0.25rem' } as React.CSSProperties,
  empty:   { padding: '2rem 1rem', textAlign: 'center' as const, color: 'var(--color-muted)', fontSize: '0.875rem' },
  modal:   { position: 'fixed' as const, inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', overflowY: 'auto' as const, padding: '2rem 0.75rem' },
  modalCard: { backgroundColor: 'var(--color-surface)', borderRadius: '10px', padding: '1.25rem', width: '100%', maxWidth: '560px', boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.25))' } as React.CSSProperties,
  label:   { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '0.2rem', marginTop: '0.7rem' } as React.CSSProperties,
  input:   { width: '100%', padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.85rem', boxSizing: 'border-box' as const } as React.CSSProperties,
  grid2:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 0.75rem' } as React.CSSProperties,
  toast:   (ok: boolean): React.CSSProperties => ({ padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, backgroundColor: ok ? '#dcfce7' : '#fef2f2', color: ok ? '#166534' : '#991b1b', border: `1px solid ${ok ? '#86efac' : '#fca5a5'}`, marginBottom: '1rem' }),
  error:   { padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b', fontSize: '0.85rem' } as React.CSSProperties,
  mobCard: { border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.65rem 0.8rem', marginBottom: '0.6rem', backgroundColor: 'var(--color-bg)' } as React.CSSProperties,
};

function fmtDT(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Staff edit modal ──────────────────────────────────────────────────────────

function StaffModal({
  planId, member, onClose, onSaved,
}: {
  planId: number;
  member: EventPlanStaff | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    display_name: member?.display_name ?? '',
    assignment: member?.assignment ?? '',
    radio_number: member?.radio_number ?? '',
    vehicle: member?.vehicle ?? '',
    phone: member?.phone ?? '',
    arrive_at: member?.arrive_at ? member.arrive_at.slice(0, 16).replace(' ', 'T') : '',
    depart_at: member?.depart_at ? member.depart_at.slice(0, 16).replace(' ', 'T') : '',
    notes: member?.notes ?? '',
    is_active: member ? member.is_active !== 0 : true,
    person_id: member?.person_id?.toString() ?? '',
  });
  const [newDuty, setNewDuty] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function save() {
    if (!form.display_name.trim() || !form.assignment.trim()) { setErr('Name and assignment are required.'); return; }
    setSaving(true); setErr('');
    const payload = {
      display_name: form.display_name.trim(),
      assignment: form.assignment.trim(),
      radio_number: form.radio_number || null,
      vehicle: form.vehicle || null,
      phone: form.phone || null,
      arrive_at: form.arrive_at ? form.arrive_at.replace('T', ' ') + ':00' : null,
      depart_at: form.depart_at ? form.depart_at.replace('T', ' ') + ':00' : null,
      notes: form.notes || null,
      is_active: form.is_active ? 1 : 0,
      person_id: form.person_id ? parseInt(form.person_id, 10) : null,
    };
    try {
      if (member) {
        await updateStaff(member.id, payload as never);
      } else {
        await addStaff(planId, payload as never);
      }
      onSaved();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Save failed');
      setSaving(false);
    }
  }

  async function addDuty() {
    const duty = newDuty.trim();
    if (!duty || !member) return;
    try { await addStaffDuty(planId, member.id, duty); setNewDuty(''); onSaved(); }
    catch (ex: unknown) { setErr(ex instanceof Error ? ex.message : 'Failed to add duty'); }
  }

  async function removeDuty(dutyId: number) {
    try { await deleteStaffDuty(dutyId); onSaved(); }
    catch (ex: unknown) { setErr(ex instanceof Error ? ex.message : 'Failed to remove duty'); }
  }

  return (
    <div style={S.modal} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modalCard} data-testid="staff-modal">
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>{member ? `Edit: ${member.display_name}` : 'Add Staff Member'}</h2>
        {err && <div style={S.error}>{err}</div>}

        <div style={S.grid2}>
          <div>
            <label style={S.label}>Name *</label>
            <input style={S.input} value={form.display_name} onChange={set('display_name')} placeholder="Full name" />
          </div>
          <div>
            <label style={S.label}>Primary Assignment *</label>
            <input style={S.input} value={form.assignment} onChange={set('assignment')} placeholder="e.g. Chief Tech Inspector" />
          </div>
          <div>
            <label style={S.label}>Radio #</label>
            <input style={S.input} value={form.radio_number} onChange={set('radio_number')} placeholder="e.g. 12" />
          </div>
          <div>
            <label style={S.label}>Vehicle / Scooter / Cart</label>
            <input style={S.input} value={form.vehicle} onChange={set('vehicle')} placeholder="e.g. Cart 3" />
          </div>
          <div>
            <label style={S.label}>Phone</label>
            <input style={S.input} value={form.phone} onChange={set('phone')} placeholder="optional" />
          </div>
          <div>
            <label style={S.label}>Person ID (Tech Master, optional)</label>
            <input style={S.input} type="number" value={form.person_id} onChange={set('person_id')} placeholder="link to persons record" />
          </div>
          <div>
            <label style={S.label}>Arrive</label>
            <input style={S.input} type="datetime-local" value={form.arrive_at} onChange={set('arrive_at')} />
          </div>
          <div>
            <label style={S.label}>Depart</label>
            <input style={S.input} type="datetime-local" value={form.depart_at} onChange={set('depart_at')} />
          </div>
        </div>

        <label style={S.label}>Notes</label>
        <input style={S.input} value={form.notes} onChange={set('notes')} />

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginTop: '0.8rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Active for this event
        </label>

        {member && (
          <>
            <label style={S.label}>Duties</label>
            <div style={{ marginBottom: '0.4rem' }}>
              {(member.duties ?? []).map(d => (
                <span key={d.id} style={S.chip}>
                  {d.duty}
                  <button type="button" onClick={() => removeDuty(d.id)} style={{ border: 'none', background: 'none', color: 'var(--color-error)', cursor: 'pointer', marginLeft: '0.3rem', fontWeight: 700 }}>×</button>
                </span>
              ))}
              {!(member.duties ?? []).length && <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>No duties yet.</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input style={S.input} list="eo-duty-list" placeholder="e.g. Fuel Check, Scales…" value={newDuty} onChange={e => setNewDuty(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDuty(); } }} />
              <datalist id="eo-duty-list">{DUTY_SUGGESTIONS.map(d => <option key={d} value={d} />)}</datalist>
              <button type="button" style={S.btn} onClick={addDuty}>Add</button>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" style={S.btn} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" style={{ ...S.btn, ...S.btnPrim }} onClick={save} disabled={saving} data-testid="staff-save">
            {saving ? 'Saving…' : member ? 'Save Changes' : 'Add Staff'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function EventStaffPanel({
  planId, staff, canAdmin, onChanged,
}: {
  planId: number;
  staff: EventPlanStaff[];
  canAdmin: boolean;
  onChanged: () => void;
}) {
  const isMobile = useIsMobile();
  const [modal, setModal] = useState<EventPlanStaff | null | 'new'>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3000); };

  async function remove(s: EventPlanStaff) {
    if (!confirm(`Remove ${s.display_name} from this event?`)) return;
    try { await deleteStaff(s.id); onChanged(); showToast(true, 'Removed.'); }
    catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Delete failed'); }
  }

  async function toggleActive(s: EventPlanStaff) {
    try { await updateStaff(s.id, { is_active: s.is_active ? 0 : 1 } as never); onChanged(); }
    catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Update failed'); }
  }

  const active = staff.filter(s => s.is_active !== 0);
  const inactive = staff.filter(s => s.is_active === 0);

  function dutiesCell(s: EventPlanStaff) {
    const ds = s.duties ?? [];
    if (!ds.length) return <span style={{ color: 'var(--color-muted)' }}>—</span>;
    return <>{ds.map(d => <span key={d.id} style={S.chip}>{d.duty}</span>)}</>;
  }

  function adminCell(s: EventPlanStaff) {
    return (
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        <button style={{ ...S.btn, padding: '0.2rem 0.5rem' }} onClick={() => setModal(s)}>Edit</button>
        <button style={{ ...S.btn, padding: '0.2rem 0.5rem' }} onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
        <button style={{ ...S.btn, ...S.btnDang, padding: '0.2rem 0.5rem' }} onClick={() => remove(s)}>×</button>
      </div>
    );
  }

  function renderRows(list: EventPlanStaff[]) {
    return list.map(s => (
      <tr key={s.id} data-testid={`staff-row-${s.id}`} style={{ opacity: s.is_active ? 1 : 0.55 }}>
        <td style={{ ...S.td, fontWeight: 600 }}>{s.display_name}</td>
        <td style={S.td}>{s.assignment}</td>
        <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{s.radio_number ?? '—'}</td>
        <td style={S.td}>{s.vehicle ?? '—'}</td>
        <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{s.phone ?? '—'}</td>
        <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtDT(s.arrive_at)}</td>
        <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtDT(s.depart_at)}</td>
        <td style={S.td}>{dutiesCell(s)}</td>
        <td style={{ ...S.td, maxWidth: '180px' }}>{s.notes ?? ''}</td>
        {canAdmin && <td style={S.td}>{adminCell(s)}</td>}
      </tr>
    ));
  }

  function renderCards(list: EventPlanStaff[]) {
    return list.map(s => (
      <div key={s.id} style={{ ...S.mobCard, opacity: s.is_active ? 1 : 0.55 }} data-testid={`staff-row-${s.id}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{s.display_name}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>{s.assignment}</div>
          </div>
          {!s.is_active && <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)', fontWeight: 600 }}>INACTIVE</span>}
        </div>
        <div style={{ fontSize: '0.78rem', marginTop: '0.35rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.1rem 0.6rem' }}>
          {s.radio_number && <><span style={{ color: 'var(--color-muted)' }}>Radio</span><span>{s.radio_number}</span></>}
          {s.vehicle && <><span style={{ color: 'var(--color-muted)' }}>Vehicle</span><span>{s.vehicle}</span></>}
          {s.phone && <><span style={{ color: 'var(--color-muted)' }}>Phone</span><span>{s.phone}</span></>}
          {(s.arrive_at || s.depart_at) && <><span style={{ color: 'var(--color-muted)' }}>Arr/Dep</span><span>{fmtDT(s.arrive_at)} → {fmtDT(s.depart_at)}</span></>}
        </div>
        {(s.duties ?? []).length > 0 && <div style={{ marginTop: '0.4rem' }}>{dutiesCell(s)}</div>}
        {s.notes && <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.3rem' }}>{s.notes}</div>}
        {canAdmin && <div style={{ marginTop: '0.5rem' }}>{adminCell(s)}</div>}
      </div>
    ));
  }

  return (
    <div data-testid="event-staff-panel">
      {toast && <div style={S.toast(toast.ok)}>{toast.msg}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
          {active.length} active{inactive.length ? ` · ${inactive.length} inactive` : ''}
        </div>
        {canAdmin && (
          <button style={{ ...S.btn, ...S.btnPrim }} data-testid="add-staff" onClick={() => setModal('new')}>+ Add Staff</button>
        )}
      </div>

      {staff.length === 0 ? (
        <div style={S.empty}>No staff assigned yet.{canAdmin && ' Click + Add Staff to begin.'}</div>
      ) : isMobile ? (
        <div>{renderCards(staff)}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Assignment</th>
                <th style={S.th}>Radio</th>
                <th style={S.th}>Vehicle</th>
                <th style={S.th}>Phone</th>
                <th style={S.th}>Arrive</th>
                <th style={S.th}>Depart</th>
                <th style={S.th}>Duties</th>
                <th style={S.th}>Notes</th>
                {canAdmin && <th style={S.th}></th>}
              </tr>
            </thead>
            <tbody>{renderRows(staff)}</tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <StaffModal
          planId={planId}
          member={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); onChanged(); showToast(true, 'Saved.'); }}
        />
      )}
    </div>
  );
}
