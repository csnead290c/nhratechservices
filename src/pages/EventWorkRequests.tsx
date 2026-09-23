/**
 * EventWorkRequests — worker-facing event staffing requests.
 *
 * Any authenticated worker can:
 *   - see upcoming canonical (parity) events
 *   - submit/edit/cancel their own work request per event
 *   - maintain profile defaults (phone, travel, beverages, dietary)
 *
 * No eventops.* capability required — the API self-scopes to the caller.
 * Dietary detail entered here is visible only to the worker and
 * eventops.admin users; lists show an indicator, never the text.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  listCanonicalEvents,
  getMyRequests,
  getMyWorkerProfile,
  updateMyWorkerProfile,
  submitWorkRequest,
  updateWorkRequest,
  cancelWorkRequest,
  searchPersons,
  TRAVEL_INTENTS,
  LODGING_INTENTS,
  ROOMMATE_PREFS,
  DIETARY_CATEGORIES,
  BEVERAGE_SUGGESTIONS,
  type CanonicalEventListItem,
  type EventWorkRequest,
  type EventWorkerProfile,
  type AvailabilityKind,
  type TravelIntent,
  type LodgingIntent,
  type RoommatePref,
  type DietaryCategory,
} from '../domain/eventOps/eventOpsApi';

const S = {
  page:   { padding: '1.5rem 2rem', maxWidth: '760px', margin: '0 auto' } as React.CSSProperties,
  h1:     { fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 0.25rem' } as React.CSSProperties,
  h2:     { fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 0.6rem' } as React.CSSProperties,
  card:   { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1rem' } as React.CSSProperties,
  btn:    { padding: '0.45rem 0.9rem', borderRadius: '6px', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties,
  btnPrim:{ backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none' } as React.CSSProperties,
  label:  { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '0.2rem', marginTop: '0.7rem' } as React.CSSProperties,
  input:  { width: '100%', padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.85rem', boxSizing: 'border-box' as const } as React.CSSProperties,
  chip:   (on: boolean): React.CSSProperties => ({ display: 'inline-block', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`, backgroundColor: on ? 'var(--color-primary)' : 'transparent', color: on ? '#fff' : 'var(--color-text)', marginRight: '0.35rem', marginBottom: '0.35rem' }),
  badge:  (color: string): React.CSSProperties => ({ display: 'inline-block', padding: '1px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, backgroundColor: color + '22', color }),
  error:  { padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b', fontSize: '0.85rem', marginBottom: '0.75rem' } as React.CSSProperties,
  muted:  { fontSize: '0.78rem', color: 'var(--color-muted)' } as React.CSSProperties,
  grid2:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 0.75rem' } as React.CSSProperties,
};

const STATUS_COLORS: Record<string, string> = {
  requested: '#d97706', confirmed: '#16a34a', waitlisted: '#2563eb', declined: '#dc2626', cancelled: '#9ca3af',
};

function fmtRange(ev: CanonicalEventListItem | EventWorkRequest): string {
  const a = ev.start_date_local ?? '';
  const b = ev.end_date_local ?? '';
  return a === b || !b ? a : `${a} → ${b}`;
}

interface ReqForm {
  availability: AvailabilityKind;
  available_from: string;
  available_through: string;
  travel_intent: TravelIntent | '';
  lodging_intent: LodgingIntent | '';
  roommate_pref: RoommatePref | '';
  roommate_person_id: number | null;
  roommate_name: string;
  dietary_category: DietaryCategory | '';
  dietary_detail: string;
  notes: string;
  beverages: string[];
}

function RequestForm({ event, existing, profileBevs, onDone }: {
  event: CanonicalEventListItem;
  existing: EventWorkRequest | null;
  profileBevs: string[];
  onDone: () => void;
}) {
  const [form, setForm] = useState<ReqForm>({
    availability: existing?.availability ?? 'full',
    available_from: existing?.available_from?.slice(0, 16).replace(' ', 'T') ?? '',
    available_through: existing?.available_through?.slice(0, 16).replace(' ', 'T') ?? '',
    travel_intent: existing?.travel_intent ?? '',
    lodging_intent: existing?.lodging_intent ?? '',
    roommate_pref: existing?.roommate_pref ?? '',
    roommate_person_id: existing?.roommate_person_id ?? null,
    roommate_name: existing?.roommate_name ?? existing?.roommate_person_name ?? '',
    dietary_category: existing?.dietary_category ?? '',
    dietary_detail: existing?.dietary_detail ?? '',
    notes: existing?.notes ?? '',
    // Event-specific override only when explicitly stored; otherwise profile defaults apply server-side.
    beverages: existing?.beverages?.length ? existing.beverages : profileBevs,
  });
  const [bevOther, setBevOther] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [personHits, setPersonHits] = useState<{ id: number; display_name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = <K extends keyof ReqForm>(k: K, v: ReqForm[K]) => setForm(f => ({ ...f, [k]: v }));

  function toggleBev(b: string) {
    set('beverages', form.beverages.includes(b) ? form.beverages.filter(x => x !== b) : [...form.beverages, b]);
  }

  async function findPerson(q: string) {
    setPersonQuery(q);
    if (q.trim().length < 2) { setPersonHits([]); return; }
    try { const r = await searchPersons(q.trim()); setPersonHits(r.persons); }
    catch { setPersonHits([]); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const payload = {
        availability: form.availability,
        available_from: form.availability === 'partial' && form.available_from ? form.available_from.replace('T', ' ') + ':00' : null,
        available_through: form.availability === 'partial' && form.available_through ? form.available_through.replace('T', ' ') + ':00' : null,
        travel_intent: form.travel_intent || null,
        lodging_intent: form.lodging_intent || null,
        roommate_pref: form.lodging_intent === 'hotel' ? (form.roommate_pref || null) : null,
        roommate_person_id: form.roommate_pref === 'specific_person' ? form.roommate_person_id : null,
        roommate_name: form.roommate_pref === 'specific_person' && !form.roommate_person_id ? form.roommate_name || null : null,
        dietary_category: form.dietary_category || null,
        dietary_detail: form.dietary_detail || null,
        notes: form.notes || null,
        beverages: form.beverages,
      };
      if (existing) {
        await updateWorkRequest(existing.id, payload);
      } else {
        await submitWorkRequest({ parity_event_id: event.id, ...payload });
      }
      onDone();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Save failed');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} data-testid="work-request-form">
      {err && <div style={S.error}>{err}</div>}

      <label style={S.label}>Availability</label>
      <div>
        <button type="button" style={S.chip(form.availability === 'full')} onClick={() => set('availability', 'full')}>Full Event</button>
        <button type="button" style={S.chip(form.availability === 'partial')} onClick={() => set('availability', 'partial')}>Partial</button>
      </div>
      {form.availability === 'partial' && (
        <div style={S.grid2}>
          <div>
            <label style={S.label}>Available from *</label>
            <input style={S.input} type="datetime-local" value={form.available_from} onChange={e => set('available_from', e.target.value)} required />
          </div>
          <div>
            <label style={S.label}>Available through *</label>
            <input style={S.input} type="datetime-local" value={form.available_through} onChange={e => set('available_through', e.target.value)} required />
          </div>
        </div>
      )}

      <div style={S.grid2}>
        <div>
          <label style={S.label}>Travel</label>
          <select style={S.input} value={form.travel_intent} onChange={e => set('travel_intent', e.target.value as TravelIntent | '')} data-testid="req-travel">
            <option value="">—</option>
            {TRAVEL_INTENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Lodging</label>
          <select style={S.input} value={form.lodging_intent} onChange={e => set('lodging_intent', e.target.value as LodgingIntent | '')} data-testid="req-lodging">
            <option value="">—</option>
            {LODGING_INTENTS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </div>

      {form.lodging_intent === 'hotel' && (
        <>
          <label style={S.label}>Roommate preference</label>
          <select style={S.input} value={form.roommate_pref} onChange={e => set('roommate_pref', e.target.value as RoommatePref | '')} data-testid="req-roommate-pref">
            <option value="">—</option>
            {ROOMMATE_PREFS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {form.roommate_pref === 'specific_person' && (
            <>
              <label style={S.label}>Roommate name</label>
              <input
                style={S.input}
                data-testid="req-roommate-name"
                placeholder="Type to search people, or enter a name"
                value={form.roommate_person_id ? form.roommate_name : personQuery || form.roommate_name}
                onChange={e => { set('roommate_person_id', null); set('roommate_name', e.target.value); findPerson(e.target.value); }}
              />
              {personHits.length > 0 && !form.roommate_person_id && (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', marginTop: '0.25rem' }}>
                  {personHits.map(p => (
                    <div
                      key={p.id}
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}
                      onClick={() => { set('roommate_person_id', p.id); set('roommate_name', p.display_name); setPersonQuery(''); setPersonHits([]); }}
                    >
                      {p.display_name}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <label style={S.label}>Beverage preferences (pre-filled from your profile — adjust for this event)</label>
      <div>
        {BEVERAGE_SUGGESTIONS.concat(form.beverages.filter(b => !BEVERAGE_SUGGESTIONS.includes(b))).map(b => (
          <button key={b} type="button" style={S.chip(form.beverages.includes(b))} onClick={() => toggleBev(b)}>{b}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
        <input style={{ ...S.input, maxWidth: '220px' }} placeholder="Other beverage" value={bevOther} onChange={e => setBevOther(e.target.value)} />
        <button type="button" style={S.btn} onClick={() => { const v = bevOther.trim(); if (v && !form.beverages.includes(v)) { toggleBev(v); } setBevOther(''); }}>Add</button>
      </div>

      <div style={S.grid2}>
        <div>
          <label style={S.label}>Dietary needs</label>
          <select style={S.input} value={form.dietary_category} onChange={e => set('dietary_category', e.target.value as DietaryCategory | '')}>
            <option value="">—</option>
            {DIETARY_CATEGORIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        {form.dietary_category && form.dietary_category !== 'none' && (
          <div>
            <label style={S.label}>Dietary detail (staffing admin only)</label>
            <input style={S.input} value={form.dietary_detail} onChange={e => set('dietary_detail', e.target.value)} />
          </div>
        )}
      </div>

      <label style={S.label}>Notes</label>
      <input style={S.input} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything staffing should know" />

      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button type="button" style={S.btn} onClick={onDone} disabled={saving}>Cancel</button>
        <button type="submit" style={{ ...S.btn, ...S.btnPrim }} disabled={saving} data-testid="work-request-submit">
          {saving ? 'Saving…' : existing ? 'Update Request' : 'Submit Request'}
        </button>
      </div>
    </form>
  );
}

function ProfileEditor({ profile, beverages, onSaved }: {
  profile: EventWorkerProfile | null;
  beverages: string[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    phone: profile?.phone ?? '',
    travel_default: profile?.travel_default ?? '',
    dietary_category: profile?.dietary_category ?? '',
    dietary_detail: profile?.dietary_detail ?? '',
    notes: profile?.notes ?? '',
    beverages,
  });
  const [bevOther, setBevOther] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const toggleBev = (b: string) =>
    setForm(f => ({ ...f, beverages: f.beverages.includes(b) ? f.beverages.filter(x => x !== b) : [...f.beverages, b] }));

  async function save() {
    setSaving(true); setErr('');
    try {
      await updateMyWorkerProfile({
        phone: form.phone,
        travel_default: (form.travel_default || null) as TravelIntent | null,
        dietary_category: (form.dietary_category || null) as DietaryCategory | null,
        dietary_detail: form.dietary_detail || null,
        notes: form.notes || null,
        beverages: form.beverages,
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.card} data-testid="worker-profile-editor">
      <h2 style={S.h2}>My Worker Profile</h2>
      <div style={S.muted}>Defaults that pre-fill every event request — set once per season.</div>
      {err && <div style={S.error}>{err}</div>}
      <div style={S.grid2}>
        <div>
          <label style={S.label}>Phone</label>
          <input style={S.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div>
          <label style={S.label}>Usual travel</label>
          <select style={S.input} value={form.travel_default} onChange={e => setForm(f => ({ ...f, travel_default: e.target.value }))}>
            <option value="">—</option>
            {TRAVEL_INTENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <label style={S.label}>Beverage preferences</label>
      <div>
        {BEVERAGE_SUGGESTIONS.concat(form.beverages.filter(b => !BEVERAGE_SUGGESTIONS.includes(b))).map(b => (
          <button key={b} type="button" style={S.chip(form.beverages.includes(b))} onClick={() => toggleBev(b)}>{b}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <input style={{ ...S.input, maxWidth: '220px' }} placeholder="Other beverage" value={bevOther} onChange={e => setBevOther(e.target.value)} />
        <button type="button" style={S.btn} onClick={() => { const v = bevOther.trim(); if (v) toggleBev(v); setBevOther(''); }}>Add</button>
      </div>
      <div style={S.grid2}>
        <div>
          <label style={S.label}>Dietary needs</label>
          <select style={S.input} value={form.dietary_category} onChange={e => setForm(f => ({ ...f, dietary_category: e.target.value }))}>
            <option value="">—</option>
            {DIETARY_CATEGORIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        {form.dietary_category && form.dietary_category !== 'none' && (
          <div>
            <label style={S.label}>Dietary detail</label>
            <input style={S.input} value={form.dietary_detail} onChange={e => setForm(f => ({ ...f, dietary_detail: e.target.value }))} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', gap: '0.5rem', alignItems: 'center' }}>
        {saved && <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>Saved.</span>}
        <button type="button" style={{ ...S.btn, ...S.btnPrim }} onClick={save} disabled={saving} data-testid="profile-save">{saving ? 'Saving…' : 'Save Profile'}</button>
      </div>
    </div>
  );
}

export default function EventWorkRequests() {
  const [events, setEvents] = useState<CanonicalEventListItem[]>([]);
  const [requests, setRequests] = useState<EventWorkRequest[]>([]);
  const [profile, setProfile] = useState<EventWorkerProfile | null>(null);
  const [profileBevs, setProfileBevs] = useState<string[]>([]);
  const [openEvent, setOpenEvent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    return Promise.all([
      listCanonicalEvents({ upcoming: true }),
      getMyRequests(),
      getMyWorkerProfile(),
    ]).then(([e, r, p]) => {
      setEvents(e.events);
      setRequests(r.requests);
      setProfile(p.profile);
      setProfileBevs(p.beverages);
    });
  }, []);

  useEffect(() => {
    reload().catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [reload]);

  const reqByEvent = new Map<number, EventWorkRequest>();
  for (const r of requests) {
    if (r.status !== 'cancelled' && r.status !== 'declined') reqByEvent.set(r.parity_event_id, r);
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>Loading…</div>;

  return (
    <div style={S.page} data-testid="work-requests-page">
      <h1 style={S.h1}>Work an Event</h1>
      <div style={{ ...S.muted, marginBottom: '1.25rem' }}>Request to work upcoming NHRA Tech Services events. Staffing will confirm your assignment.</div>
      {err && <div style={S.error}>{err}</div>}

      <ProfileEditor profile={profile} beverages={profileBevs} onSaved={reload} />

      <h2 style={{ ...S.h2, marginTop: '1.25rem' }}>Upcoming Events</h2>
      {events.length === 0 && <div style={S.card}><span style={S.muted}>No upcoming events are open for requests.</span></div>}
      {events.map(ev => {
        const mine = reqByEvent.get(ev.id);
        const open = openEvent === ev.id;
        return (
          <div key={ev.id} style={S.card} data-testid={`event-card-${ev.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ev.event_name}</div>
                <div style={S.muted}>
                  {fmtRange(ev)}{ev.track_name ? ` · ${ev.track_name}` : ''}{ev.city ? ` — ${ev.city}, ${ev.state}` : ''}
                </div>
                {mine && <div style={{ marginTop: '0.3rem' }}><span style={S.badge(STATUS_COLORS[mine.status] ?? '#6b7280')}>{mine.status}</span>{mine.decision_note && <span style={{ ...S.muted, marginLeft: '0.4rem' }}>{mine.decision_note}</span>}</div>}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {!mine && <button style={{ ...S.btn, ...S.btnPrim }} onClick={() => setOpenEvent(open ? null : ev.id)} data-testid={`request-btn-${ev.id}`}>Request to Work</button>}
                {mine && mine.status === 'requested' && (
                  <>
                    <button style={S.btn} onClick={() => setOpenEvent(open ? null : ev.id)}>Edit Request</button>
                    <button style={{ ...S.btn, color: '#dc2626' }} onClick={() => { if (confirm('Cancel your request for this event?')) cancelWorkRequest(mine.id).then(reload); }}>Cancel</button>
                  </>
                )}
              </div>
            </div>
            {open && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.25rem' }}>
                <RequestForm event={ev} existing={mine ?? null} profileBevs={profileBevs} onDone={() => { setOpenEvent(null); reload(); }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
