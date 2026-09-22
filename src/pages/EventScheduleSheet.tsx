/**
 * EventScheduleSheet — read-only presentation of the structured event schedule.
 *
 * Route: /event-ops/:id/sheet[?date=YYYY-MM-DD]
 *
 * Reproduces the INFORMATION on the printed Tech event schedule:
 *   - Event header (date, event code/name, track, day)
 *   - Per-day schedule: TIME / PROJECTED / ACTIVITY / ROUND / CARS / COMMENTS / SCALE / FUEL
 *   - Staff grid: STAFF / VEHICLE / PHONE / RADIO / ASSIGNMENT / DUTIES
 *
 * This is the shared data/presentation base for later print, PDF, tablet and
 * kiosk views — no kiosk hardware logic lives here.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  getPlan, getPlanStaff, getSchedule, fmtScheduleTime,
  type EventPlan, type EventPlanStaff, type EventScheduleItem,
} from '../domain/eventOps/eventOpsApi';
import { useIsMobile } from '../shared/hooks/useResponsive';

const MONO: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const S = {
  page:   { padding: '1rem 1.25rem', maxWidth: '1200px', margin: '0 auto' } as React.CSSProperties,
  header: { borderBottom: '3px solid var(--color-text)', paddingBottom: '0.75rem', marginBottom: '1rem' } as React.CSSProperties,
  table:  { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.82rem' },
  th:     { padding: '0.4rem 0.55rem', textAlign: 'left' as const, borderBottom: '2px solid var(--color-text)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' as const, letterSpacing: '0.03em', whiteSpace: 'nowrap' as const },
  td:     { padding: '0.4rem 0.55rem', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' as const },
  dayNav: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, alignItems: 'center', marginBottom: '0.9rem' } as React.CSSProperties,
  chip:   (active: boolean): React.CSSProperties => ({
    padding: '0.3rem 0.75rem', borderRadius: '9999px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: active ? 700 : 500,
    border: '1px solid var(--color-border)', backgroundColor: active ? 'var(--color-text)' : 'transparent',
    color: active ? 'var(--color-bg)' : 'var(--color-text)',
  }),
  mark:   { display: 'inline-block', minWidth: '1.1rem', textAlign: 'center' as const, fontWeight: 700 },
};

function fmtDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDT(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function itemLabel(it: EventScheduleItem): string {
  const parts = [it.title];
  if (it.category_code && it.category_code !== it.title) parts.push(`(${it.category_code})`);
  return parts.join(' ');
}

export default function EventScheduleSheet() {
  const { id } = useParams<{ id: string }>();
  const planId = parseInt(id ?? '0', 10);
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const [plan, setPlan] = useState<EventPlan | null>(null);
  const [staff, setStaff] = useState<EventPlanStaff[]>([]);
  const [items, setItems] = useState<EventScheduleItem[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!planId) return;
    Promise.all([getPlan(planId), getPlanStaff(planId), getSchedule(planId)])
      .then(([p, st, sc]) => {
        setPlan(p.plan);
        setStaff(st.staff);
        setItems(sc.items);
        setDays(sc.days);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [planId]);

  // Selected day: ?date= param, else event_date, else first day, else 'all'
  const selectedDay = searchParams.get('date') ?? plan?.event_date ?? days[0] ?? 'all';
  const dayIdx = days.indexOf(selectedDay);

  const grouped = useMemo(() => {
    const map = new Map<string, EventScheduleItem[]>();
    for (const it of items) {
      const key = it.schedule_date ?? 'unscheduled';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [items]);

  const visibleKeys = selectedDay === 'all'
    ? [...grouped.keys()].sort()
    : [selectedDay];

  function goDay(dir: -1 | 1) {
    const next = days[dayIdx + dir];
    if (next) setSearchParams({ date: next });
  }

  function assignmentSummary(item: EventScheduleItem): string {
    return (item.assignments ?? [])
      .map(a => `${a.staff_display_name ?? a.assignee_name ?? '?'} → ${a.responsibility}`)
      .join(' · ');
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>Loading schedule…</div>;
  if (error)   return <div style={{ padding: '2rem', color: 'var(--color-error)' }}>{error}</div>;
  if (!plan)   return <div style={{ padding: '2rem' }}>Plan not found.</div>;

  const activeStaff = staff.filter(s => s.is_active !== 0);

  return (
    <div style={S.page} data-testid="event-schedule-sheet">
      <style>{`
        @media print {
          .eo-sheet-nav, .eo-sheet-actions { display: none !important; }
          body { background: #fff !important; }
          header, footer { display: none !important; }
          table { font-size: 0.72rem; }
        }
      `}</style>

      <div className="eo-sheet-nav" style={{ marginBottom: '0.75rem' }}>
        <Link to={`/event-ops/${planId}`} style={{ fontSize: '0.85rem', color: 'var(--color-primary)', textDecoration: 'none' }}>← Event Plan</Link>
      </div>

      {/* ── Event header ── */}
      <div style={S.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.5rem', fontWeight: 800, letterSpacing: '0.02em' }}>
              {plan.event_code} — {plan.title}
            </h1>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginTop: '0.2rem' }}>
              {plan.track_name ?? 'Track TBD'}{plan.class_scope ? ` · ${plan.class_scope}` : ''}
              {plan.event_date ? ` · ${fmtDay(plan.event_date)}` : ''}
            </div>
          </div>
          <div className="eo-sheet-actions" style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => window.print()} style={{ padding: '0.4rem 0.9rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              Print
            </button>
          </div>
        </div>
      </div>

      {/* ── Day navigation ── */}
      {days.length > 0 && (
        <div style={S.dayNav} className="eo-sheet-nav" data-testid="sheet-day-nav">
          <button style={S.chip(false)} onClick={() => goDay(-1)} disabled={dayIdx <= 0}>← Prev</button>
          <button style={S.chip(selectedDay === 'all')} onClick={() => setSearchParams({ date: 'all' })}>All</button>
          {days.map(d => (
            <button key={d} style={S.chip(selectedDay === d)} onClick={() => setSearchParams({ date: d })}>
              {fmtDay(d).split(',')[0]} {d.slice(5)}
            </button>
          ))}
          <button style={S.chip(false)} onClick={() => goDay(1)} disabled={dayIdx < 0 || dayIdx >= days.length - 1}>Next →</button>
        </div>
      )}

      {/* ── Schedule tables ── */}
      {items.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>No schedule items recorded for this event.</div>
      )}

      {visibleKeys.map(key => {
        const dayItems = grouped.get(key) ?? [];
        if (!dayItems.length) return null;
        return (
          <div key={key} style={{ marginBottom: '1.5rem' }} data-testid={`sheet-day-${key}`}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
              {key === 'unscheduled' ? 'Unscheduled' : fmtDay(key)}
              {dayItems.find(i => i.day_label)?.day_label ? ` — ${dayItems.find(i => i.day_label)!.day_label}` : ''}
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Time</th>
                    <th style={S.th}>Proj</th>
                    <th style={S.th}>Activity / Category</th>
                    <th style={S.th}>Round</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Cars</th>
                    <th style={S.th}>Comments</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Scale</th>
                    <th style={{ ...S.th, textAlign: 'center' }}>Fuel</th>
                  </tr>
                </thead>
                <tbody>
                  {dayItems.map(it => (
                    <tr key={it.id} data-testid={`sheet-item-${it.id}`}>
                      <td style={{ ...S.td, ...MONO, whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtScheduleTime(it.scheduled_time, it.scheduled_time_label)}</td>
                      <td style={{ ...S.td, ...MONO, whiteSpace: 'nowrap' }}>{fmtScheduleTime(it.projected_time, it.projected_time_label)}</td>
                      <td style={S.td}>
                        <span style={{ fontWeight: 600 }}>{itemLabel(it)}</span>
                        {it.status !== 'upcoming' && (
                          <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-muted)' }}>[{it.status}]</span>
                        )}
                        {assignmentSummary(it) && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{assignmentSummary(it)}</div>
                        )}
                      </td>
                      <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{it.round_label ?? '—'}</td>
                      <td style={{ ...S.td, textAlign: 'center' }}>{it.expected_car_count ?? '—'}</td>
                      <td style={S.td}>{it.comments ?? ''}</td>
                      <td style={{ ...S.td, textAlign: 'center' }}>{it.scale_required ? <span style={S.mark}>✓</span> : ''}</td>
                      <td style={{ ...S.td, textAlign: 'center' }}>{it.fuel_required ? <span style={S.mark}>✓</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* ── Staff grid ── */}
      {activeStaff.length > 0 && (
        <div data-testid="sheet-staff">
          <h2 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', borderTop: '2px solid var(--color-text)', paddingTop: '0.75rem' }}>
            Tech Staff
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Staff</th>
                  <th style={S.th}>Vehicle</th>
                  <th style={S.th}>Phone</th>
                  <th style={S.th}>Radio</th>
                  <th style={S.th}>Assignment</th>
                  <th style={S.th}>Duties</th>
                  <th style={S.th}>Arrive</th>
                  <th style={S.th}>Depart</th>
                </tr>
              </thead>
              <tbody>
                {activeStaff.map(s => (
                  <tr key={s.id} data-testid={`sheet-staff-${s.id}`}>
                    <td style={{ ...S.td, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.display_name}</td>
                    <td style={S.td}>{s.vehicle ?? '—'}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{s.phone ?? '—'}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{s.radio_number ?? '—'}</td>
                    <td style={S.td}>{s.assignment}</td>
                    <td style={S.td}>{(s.duties ?? []).map(d => d.duty).join(', ') || '—'}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtDT(s.arrive_at)}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtDT(s.depart_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
