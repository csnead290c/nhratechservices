/**
 * EventStaffPanel — event staffing view/editor for an Event Ops plan.
 *
 * Shows name, assignment, radio, vehicle, phone, arrive/depart, duties, notes.
 * Desktop renders a table; mobile renders stacked cards.
 * Admin users get add/edit/delete plus per-person duty chips (v40).
 */

import { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '../../shared/hooks/useResponsive';
import {
  addStaff,
  updateStaff,
  deleteStaff,
  addStaffDuty,
  deleteStaffDuty,
  listEventRequests,
  decideWorkRequest,
  getStaffDetail,
  addStaffClass,
  deleteStaffClass,
  addTravelLeg,
  deleteTravelLeg,
  upsertStaffLodging,
  DUTY_SUGGESTIONS,
  CLASS_SUGGESTIONS,
  DIETARY_CATEGORIES,
  type EventPlanStaff,
  type EventWorkRequest,
  type EventStaffDetail,
  type RequestStatus,
  type TravelLeg,
  type TravelMode,
  type LodgingType,
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

// ── v41: pending work requests ────────────────────────────────────────────────

function requestLabel(r: EventWorkRequest): string {
  const parts: string[] = [];
  if (r.availability === 'partial' && r.available_from && r.available_through) {
    parts.push(`Partial ${r.available_from.slice(5, 10)} → ${r.available_through.slice(5, 10)}`);
  } else {
    parts.push('Full event');
  }
  if (r.travel_intent) parts.push(r.travel_intent === 'local' ? 'Local' : r.travel_intent === 'fly' ? 'Fly' : r.travel_intent === 'drive' ? 'Drive' : r.travel_intent);
  if (r.lodging_intent) parts.push(r.lodging_intent === 'none' ? 'No lodging' : r.lodging_intent === 'hotel' ? 'Hotel' : r.lodging_intent === 'motorhome' ? 'Motorhome' : r.lodging_intent);
  if (r.roommate_pref === 'specific_person') parts.push(`Roommate: ${r.roommate_person_name ?? r.roommate_name ?? '?'}`);
  else if (r.roommate_pref === 'private_room') parts.push('Private room');
  return parts.join(' · ');
}

const REQUEST_STATUS_COLORS: Record<string, string> = {
  requested: '#d97706', confirmed: '#16a34a', waitlisted: '#2563eb', declined: '#dc2626', cancelled: '#9ca3af',
};

function RequestsSection({ planId, parityEventId, onChanged, showToast }: {
  planId: number;
  parityEventId: number | null;
  onChanged: () => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [requests, setRequests] = useState<EventWorkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    listEventRequests(planId)
      .then(r => { setRequests(r.requests); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, [planId]);

  useEffect(() => { if (parityEventId) reload(); else setLoading(false); }, [parityEventId, reload]);

  if (!parityEventId) return null;
  if (loading) return null;
  if (err) return <div style={S.error}>{err}</div>;
  if (!requests.length) return null;

  async function decide(r: EventWorkRequest, decision: RequestStatus) {
    try {
      await decideWorkRequest(r.id, planId, decision);
      showToast(true, `${r.user_name ?? 'Worker'} ${decision}.`);
      reload();
      onChanged();
    } catch (ex: unknown) {
      showToast(false, ex instanceof Error ? ex.message : 'Decision failed');
    }
  }

  const pending = requests.filter(r => r.status === 'requested');
  const others = requests.filter(r => r.status !== 'requested' && r.status !== 'confirmed');

  return (
    <div style={{ ...S.card, marginBottom: '1.25rem' }} data-testid="pending-requests">
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 700 }}>
        Work Requests
        {pending.length > 0 && <span style={{ marginLeft: '0.5rem', ...{ display: 'inline-block', padding: '1px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#d9770622', color: '#d97706' } }}>{pending.length} pending</span>}
      </h3>
      {requests.map(r => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }} data-testid={`request-row-${r.id}`}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
              {r.user_name ?? `User #${r.user_id}`}
              <span style={{ marginLeft: '0.5rem', display: 'inline-block', padding: '1px 8px', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: (REQUEST_STATUS_COLORS[r.status] ?? '#6b7280') + '22', color: REQUEST_STATUS_COLORS[r.status] ?? '#6b7280' }}>{r.status}</span>
              {r.dietary_on_file && <span style={{ marginLeft: '0.35rem', fontSize: '0.68rem', color: 'var(--color-muted)' }} title="Dietary accommodation on file">🍽 dietary</span>}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.15rem' }}>{requestLabel(r)}</div>
            {r.notes && <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{r.notes}</div>}
            {(r.beverages ?? []).length > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>🥤 {(r.beverages ?? []).join(', ')}</div>}
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', flexShrink: 0 }}>
            {r.status === 'requested' && (
              <>
                <button style={{ ...S.btn, ...S.btnPrim }} onClick={() => decide(r, 'confirmed')}>Confirm</button>
                <button style={S.btn} onClick={() => decide(r, 'waitlisted')}>Waitlist</button>
                <button style={{ ...S.btn, color: '#dc2626' }} onClick={() => decide(r, 'declined')}>Decline</button>
              </>
            )}
            {r.status === 'waitlisted' && (
              <>
                <button style={{ ...S.btn, ...S.btnPrim }} onClick={() => decide(r, 'confirmed')}>Confirm</button>
                <button style={{ ...S.btn, color: '#dc2626' }} onClick={() => decide(r, 'declined')}>Decline</button>
              </>
            )}
            {r.status === 'confirmed' && (
              <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>→ staff #{r.event_plan_staff_id}</span>
            )}
            {(r.status === 'declined' || r.status === 'cancelled') && (
              <button style={S.btn} onClick={() => decide(r, 'requested')}>Reopen</button>
            )}
          </div>
        </div>
      ))}
      {others.length > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: '0.4rem' }}>{others.length} closed request{others.length === 1 ? '' : 's'} shown above.</div>}
    </div>
  );
}

// ── v41: staff detail drawer (classes, travel, lodging, request) ─────────────

function StaffDetailDrawer({ staffId, staff, onClose, showToast }: {
  staffId: number;
  staff: EventPlanStaff[];
  onClose: () => void;
  showToast: (ok: boolean, msg: string) => void;
}) {
  const [detail, setDetail] = useState<EventStaffDetail | null>(null);
  const [err, setErr] = useState('');
  const [newClass, setNewClass] = useState('');
  const [legForm, setLegForm] = useState({ leg: 'outbound', mode: 'fly', airline: '', flight_number: '', origin_code: '', dest_code: '', depart_at: '', arrive_at: '', vehicle_desc: '', confirmation: '', notes: '' });
  const [lodgForm, setLodgForm] = useState({ type: 'hotel', property_name: '', check_in: '', check_out: '', confirmation: '', room_number: '', roommate_staff_id: '', roommate_name: '', site_notes: '', notes: '' });

  const reload = useCallback(() => {
    getStaffDetail(staffId)
      .then(d => {
        setDetail(d);
        if (d.lodging) {
          setLodgForm({
            type: d.lodging.type, property_name: d.lodging.property_name ?? '',
            check_in: d.lodging.check_in ?? '', check_out: d.lodging.check_out ?? '',
            confirmation: d.lodging.confirmation ?? '', room_number: d.lodging.room_number ?? '',
            roommate_staff_id: d.lodging.roommate_staff_id?.toString() ?? '',
            roommate_name: d.lodging.roommate_name ?? '',
            site_notes: d.lodging.site_notes ?? '', notes: d.lodging.notes ?? '',
          });
        }
      })
      .catch(e => setErr(e.message));
  }, [staffId]);

  useEffect(() => { reload(); }, [reload]);

  async function addClass() {
    const code = newClass.trim();
    if (!code) return;
    try { await addStaffClass(staffId, code, !(detail?.classes.length)); setNewClass(''); reload(); }
    catch (ex: unknown) { setErr(ex instanceof Error ? ex.message : 'Failed'); }
  }

  async function addLeg() {
    try {
      await addTravelLeg(staffId, {
        leg: legForm.leg as TravelLeg,
        mode: legForm.mode as TravelMode,
        airline: legForm.airline || null, flight_number: legForm.flight_number || null,
        origin_code: legForm.origin_code || null, dest_code: legForm.dest_code || null,
        depart_at: legForm.depart_at ? legForm.depart_at.replace('T', ' ') + ':00' : null,
        arrive_at: legForm.arrive_at ? legForm.arrive_at.replace('T', ' ') + ':00' : null,
        vehicle_desc: legForm.vehicle_desc || null, confirmation: legForm.confirmation || null,
        notes: legForm.notes || null,
      });
      setLegForm(f => ({ ...f, airline: '', flight_number: '', origin_code: '', dest_code: '', depart_at: '', arrive_at: '', vehicle_desc: '', confirmation: '', notes: '' }));
      reload();
      showToast(true, 'Travel leg added.');
    } catch (ex: unknown) { setErr(ex instanceof Error ? ex.message : 'Failed'); }
  }

  async function saveLodging() {
    try {
      await upsertStaffLodging(staffId, {
        type: lodgForm.type as LodgingType,
        property_name: lodgForm.property_name || null,
        check_in: lodgForm.check_in || null, check_out: lodgForm.check_out || null,
        confirmation: lodgForm.confirmation || null, room_number: lodgForm.room_number || null,
        roommate_staff_id: lodgForm.roommate_staff_id ? parseInt(lodgForm.roommate_staff_id, 10) : null,
        roommate_name: lodgForm.roommate_name || null,
        site_notes: lodgForm.site_notes || null, notes: lodgForm.notes || null,
      });
      reload();
      showToast(true, 'Lodging saved.');
    } catch (ex: unknown) { setErr(ex instanceof Error ? ex.message : 'Failed'); }
  }

  const s = detail?.staff;

  return (
    <div style={S.modal} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modalCard, maxWidth: '640px' }} data-testid="staff-detail-drawer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{s ? s.display_name : 'Staff Detail'}</h2>
          <button style={S.btn} onClick={onClose}>✕</button>
        </div>
        {err && <div style={S.error}>{err}</div>}
        {!detail ? <div style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>Loading…</div> : (
          <>
            {detail.request && (
              <div style={{ ...S.card, padding: '0.6rem 0.8rem', marginBottom: '0.75rem', fontSize: '0.78rem' }}>
                <strong>Original request:</strong> {requestLabel(detail.request)}
                {detail.request.dietary_on_file && (
                  <div style={{ marginTop: '0.2rem', color: '#92400e' }}>
                    🍽 {DIETARY_CATEGORIES.find(d => d.value === detail.request?.dietary_category)?.label ?? 'Dietary accommodation'}
                    {detail.request.dietary_detail && <>: {detail.request.dietary_detail}</>}
                  </div>
                )}
                {(detail.request.beverages ?? []).length > 0 && <div style={{ marginTop: '0.2rem' }}>🥤 {detail.request.beverages?.join(', ')}</div>}
                {detail.request.notes && <div style={{ marginTop: '0.2rem', color: 'var(--color-muted)' }}>{detail.request.notes}</div>}
              </div>
            )}

            {/* Classes */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', marginBottom: '0.3rem' }}>CLASS ASSIGNMENTS</div>
              <div style={{ marginBottom: '0.35rem' }}>
                {detail.classes.map(c => (
                  <span key={c.id} style={S.chip}>
                    {c.is_primary ? '★ ' : ''}{c.class_code}
                    <button type="button" onClick={() => deleteStaffClass(c.id).then(reload)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', marginLeft: '0.25rem', fontWeight: 700 }}>×</button>
                  </span>
                ))}
                {!detail.classes.length && <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>None.</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input style={{ ...S.input, maxWidth: '160px' }} list="eo-class-list" placeholder="e.g. TF" value={newClass} onChange={e => setNewClass(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addClass(); } }} />
                <datalist id="eo-class-list">{CLASS_SUGGESTIONS.map(c => <option key={c} value={c} />)}</datalist>
                <button type="button" style={S.btn} onClick={addClass}>Add Class</button>
              </div>
            </div>

            {/* Travel */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', marginBottom: '0.3rem' }}>TRAVEL</div>
              {detail.travel.map(t => (
                <div key={t.id} style={{ fontSize: '0.78rem', padding: '0.3rem 0', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span>
                    <strong>{t.leg}</strong> {t.mode}
                    {t.mode === 'fly' && <> {t.airline} {t.flight_number} {t.origin_code}→{t.dest_code}</>}
                    {t.mode === 'drive' && t.vehicle_desc && <> {t.vehicle_desc}</>}
                    {' '}{t.depart_at ? fmtDT(t.depart_at) : ''}{t.arrive_at ? ` → ${fmtDT(t.arrive_at)}` : ''}
                    {t.confirmation && <span style={{ color: 'var(--color-muted)' }}> ({t.confirmation})</span>}
                  </span>
                  <button type="button" style={{ ...S.btn, padding: '0.1rem 0.4rem' }} onClick={() => deleteTravelLeg(t.id).then(reload)}>×</button>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.3rem', marginTop: '0.4rem' }}>
                <select style={S.input} value={legForm.leg} onChange={e => setLegForm(f => ({ ...f, leg: e.target.value }))}>
                  <option value="outbound">Outbound</option><option value="return">Return</option><option value="other">Other</option>
                </select>
                <select style={S.input} value={legForm.mode} onChange={e => setLegForm(f => ({ ...f, mode: e.target.value }))}>
                  <option value="fly">Fly</option><option value="drive">Drive</option><option value="local">Local</option><option value="other">Other</option>
                </select>
                {legForm.mode === 'fly' && <>
                  <input style={S.input} placeholder="Airline" value={legForm.airline} onChange={e => setLegForm(f => ({ ...f, airline: e.target.value }))} />
                  <input style={S.input} placeholder="Flight #" value={legForm.flight_number} onChange={e => setLegForm(f => ({ ...f, flight_number: e.target.value }))} />
                  <input style={S.input} placeholder="From (PHX)" value={legForm.origin_code} onChange={e => setLegForm(f => ({ ...f, origin_code: e.target.value }))} />
                  <input style={S.input} placeholder="To (GRR)" value={legForm.dest_code} onChange={e => setLegForm(f => ({ ...f, dest_code: e.target.value }))} />
                </>}
                {legForm.mode === 'drive' && <input style={S.input} placeholder="Vehicle" value={legForm.vehicle_desc} onChange={e => setLegForm(f => ({ ...f, vehicle_desc: e.target.value }))} />}
                <input style={S.input} type="datetime-local" value={legForm.depart_at} onChange={e => setLegForm(f => ({ ...f, depart_at: e.target.value }))} />
                <input style={S.input} type="datetime-local" value={legForm.arrive_at} onChange={e => setLegForm(f => ({ ...f, arrive_at: e.target.value }))} />
                <input style={S.input} placeholder="Confirmation #" value={legForm.confirmation} onChange={e => setLegForm(f => ({ ...f, confirmation: e.target.value }))} />
              </div>
              <button type="button" style={{ ...S.btn, marginTop: '0.35rem' }} onClick={addLeg}>Add Travel Leg</button>
            </div>

            {/* Lodging */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', marginBottom: '0.3rem' }}>LODGING</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.3rem' }}>
                <select style={S.input} value={lodgForm.type} onChange={e => setLodgForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="hotel">Hotel</option><option value="motorhome">Motorhome</option><option value="none">None / Local</option><option value="other">Other</option>
                </select>
                {lodgForm.type === 'hotel' && <>
                  <input style={S.input} placeholder="Property" value={lodgForm.property_name} onChange={e => setLodgForm(f => ({ ...f, property_name: e.target.value }))} />
                  <input style={S.input} type="date" value={lodgForm.check_in} onChange={e => setLodgForm(f => ({ ...f, check_in: e.target.value }))} />
                  <input style={S.input} type="date" value={lodgForm.check_out} onChange={e => setLodgForm(f => ({ ...f, check_out: e.target.value }))} />
                  <input style={S.input} placeholder="Conf #" value={lodgForm.confirmation} onChange={e => setLodgForm(f => ({ ...f, confirmation: e.target.value }))} />
                  <input style={S.input} placeholder="Room #" value={lodgForm.room_number} onChange={e => setLodgForm(f => ({ ...f, room_number: e.target.value }))} />
                  <select style={S.input} value={lodgForm.roommate_staff_id} onChange={e => setLodgForm(f => ({ ...f, roommate_staff_id: e.target.value }))}>
                    <option value="">— actual roommate —</option>
                    {staff.filter(x => x.id !== staffId).map(x => <option key={x.id} value={x.id}>{x.display_name}</option>)}
                  </select>
                </>}
                {lodgForm.type === 'motorhome' && <input style={S.input} placeholder="Site / parking notes" value={lodgForm.site_notes} onChange={e => setLodgForm(f => ({ ...f, site_notes: e.target.value }))} />}
              </div>
              <button type="button" style={{ ...S.btn, marginTop: '0.35rem' }} onClick={saveLodging}>Save Lodging</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function EventStaffPanel({
  planId, parityEventId, staff, canAdmin, onChanged,
}: {
  planId: number;
  parityEventId: number | null;
  staff: EventPlanStaff[];
  canAdmin: boolean;
  onChanged: () => void;
}) {
  const isMobile = useIsMobile();
  const [modal, setModal] = useState<EventPlanStaff | null | 'new'>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
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
        <button style={{ ...S.btn, padding: '0.2rem 0.5rem' }} onClick={() => setDetailId(s.id)} data-testid={`staff-detail-${s.id}`}>Details</button>
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

      {canAdmin && <RequestsSection planId={planId} parityEventId={parityEventId} onChanged={onChanged} showToast={showToast} />}

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

      {detailId !== null && (
        <StaffDetailDrawer
          staffId={detailId}
          staff={staff}
          onClose={() => { setDetailId(null); onChanged(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
