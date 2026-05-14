import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCapabilities } from '../domain/config/useCapabilities';
import {
  getPlan,
  getLiveChecklist,
  listLiveSessionStatus,
  listLiveTaskUpdates,
  getLiveTaskSummary,
  startLiveChecklist,
  updateTaskStatus,
  addTaskNote,
  updateSessionStatus,
  markTaskFollowupRequired,
  markTaskCarryForward,
  clearTaskFollowup,
  clearTaskCarryForward,
  type EventPlan,
  type EventPlanTaskWithLive,
  type EventPlanSessionWithLive,
  type EventLiveChecklist as ChecklistType,
  type LiveTaskSummary,
  type LiveStatus,
} from '../domain/eventOps/eventOpsApi';

// ── Status badge helpers ──────────────────────────────────────────────────

const STATUS_LABELS: Record<LiveStatus, string> = {
  not_started:    'Not Started',
  in_progress:    'In Progress',
  complete:       'Complete',
  issue_found:    'Issue Found',
  skipped:        'Skipped',
  blocked:        'Blocked',
  not_applicable: 'N/A',
};

const STATUS_COLORS: Record<LiveStatus, { bg: string; color: string }> = {
  not_started:    { bg: '#e5e7eb', color: '#374151' },
  in_progress:    { bg: '#dbeafe', color: '#1d4ed8' },
  complete:       { bg: '#dcfce7', color: '#166534' },
  issue_found:    { bg: '#fee2e2', color: '#991b1b' },
  skipped:        { bg: '#f3f4f6', color: '#6b7280' },
  blocked:        { bg: '#fef3c7', color: '#92400e' },
  not_applicable: { bg: '#f3f4f6', color: '#9ca3af' },
};

function StatusBadge({ status }: { status: LiveStatus }) {
  const { bg, color } = STATUS_COLORS[status] ?? STATUS_COLORS.not_started;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, background: bg, color,
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Task status actions ───────────────────────────────────────────────────

const QUICK_STATUSES: { label: string; value: LiveStatus }[] = [
  { label: '✓ Complete',    value: 'complete' },
  { label: '⚠ Issue Found', value: 'issue_found' },
  { label: '↷ Skip',        value: 'skipped' },
  { label: '✗ Blocked',     value: 'blocked' },
  { label: '— N/A',         value: 'not_applicable' },
];

// ── Summary bar ──────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: LiveTaskSummary }) {
  const pct = summary.total > 0 ? Math.round((summary.complete / summary.total) * 100) : 0;
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
      {[
        { label: 'Total', val: summary.total, color: '#6b7280' },
        { label: 'Complete', val: summary.complete, color: '#166534' },
        { label: 'Open', val: summary.open, color: '#1d4ed8' },
        { label: 'In Progress', val: summary.in_progress, color: '#1d4ed8' },
        { label: 'Issues', val: summary.issue_found, color: '#991b1b' },
        { label: 'Follow-ups', val: summary.followup_required, color: '#92400e' },
        { label: 'Carry Forward', val: summary.carry_forward, color: '#6d28d9' },
      ].map(({ label, val, color }) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
        </div>
      ))}
      <div style={{ flexGrow: 1, alignSelf: 'center' }}>
        <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22c55e', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{pct}% complete</div>
      </div>
    </div>
  );
}

// ── Task card ────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: EventPlanTaskWithLive;
  planId: number;
  isAdmin: boolean;
  onRefresh: () => void;
}

function TaskCard({ task, planId, isAdmin, onRefresh }: TaskCardProps) {
  const update = task.live_update;
  const status: LiveStatus = update?.status ?? 'not_started';
  const [noteInput, setNoteInput] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await onRefresh(); } finally { setBusy(false); }
  };

  return (
    <div
      data-testid="task-card"
      style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
        padding: '12px 16px', marginBottom: 8,
        borderLeft: `4px solid ${STATUS_COLORS[status].bg}`,
        opacity: busy ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{task.title}</div>
          {task.description && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{task.description}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={status} />
            {!!update?.issue_found && <span style={{ fontSize: 11, color: '#991b1b', fontWeight: 600 }}>⚠ Issue</span>}
            {!!update?.followup_required && <span data-testid="followup-flag" style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>↗ Follow-up</span>}
            {!!update?.carry_forward && <span data-testid="carry-forward-flag" style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600 }}>→ Carry Forward</span>}
            {task.priority && <span style={{ fontSize: 11, color: '#6b7280' }}>P: {task.priority}</span>}
            {task.task_type && <span style={{ fontSize: 11, color: '#6b7280' }}>{task.task_type}</span>}
          </div>
          {update?.notes && (
            <div style={{ fontSize: 12, color: '#374151', marginTop: 4, background: '#f9fafb', padding: '4px 8px', borderRadius: 4 }}>
              📝 {update.notes}
            </div>
          )}
          {update?.result && (
            <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
              Result: {update.result}
            </div>
          )}
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260 }}>
            {QUICK_STATUSES.map(({ label, value }) => (
              <button
                key={value}
                data-testid={`task-status-${value}`}
                disabled={busy || status === value}
                onClick={() => act(() => updateTaskStatus(planId, task.id, { status: value }))}
                style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid #d1d5db',
                  background: status === value ? STATUS_COLORS[value].bg : '#f9fafb',
                  color: status === value ? STATUS_COLORS[value].color : '#374151',
                }}
              >
                {label}
              </button>
            ))}
            <button
              data-testid="followup-btn"
              disabled={busy}
              onClick={() => act(() => update?.followup_required
                ? clearTaskFollowup(planId, task.id)
                : markTaskFollowupRequired(planId, task.id)
              )}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid #d1d5db', background: '#f9fafb' }}
            >
              {update?.followup_required ? '✓ Unmark Follow-up' : '↗ Follow-up'}
            </button>
            <button
              data-testid="carry-forward-btn"
              disabled={busy}
              onClick={() => act(() => update?.carry_forward
                ? clearTaskCarryForward(planId, task.id)
                : markTaskCarryForward(planId, task.id)
              )}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid #d1d5db', background: '#f9fafb' }}
            >
              {update?.carry_forward ? '✓ Unmark Carry' : '→ Carry Fwd'}
            </button>
            <button
              disabled={busy}
              onClick={() => setNoteOpen(o => !o)}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid #d1d5db', background: '#f9fafb' }}
            >
              📝 Note
            </button>
          </div>
        )}
      </div>
      {isAdmin && noteOpen && (
        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
          <input
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            placeholder="Add note / result..."
            style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4 }}
          />
          <button
            disabled={busy || !noteInput.trim()}
            onClick={() => act(async () => { await addTaskNote(planId, task.id, noteInput); setNoteInput(''); setNoteOpen(false); })}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', background: '#2563eb', color: '#fff', border: 'none' }}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

// ── Session block ────────────────────────────────────────────────────────

interface SessionBlockProps {
  session: EventPlanSessionWithLive;
  tasks: EventPlanTaskWithLive[];
  planId: number;
  isAdmin: boolean;
  isActive: boolean;
  onRefresh: () => void;
}

function SessionBlock({ session, tasks, planId, isAdmin, isActive, onRefresh }: SessionBlockProps) {
  const liveStatus = session.live_status?.status ?? 'not_started';
  const sessionTasks = tasks.filter(t => t.session_id === session.id);
  const complete = sessionTasks.filter(t => t.live_update?.status === 'complete').length;
  const issues   = sessionTasks.filter(t => t.live_update?.issue_found).length;
  const followups = sessionTasks.filter(t => t.live_update?.followup_required).length;
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await onRefresh(); } finally { setBusy(false); }
  };

  return (
    <div
      data-testid="session-block"
      style={{
        marginBottom: 24,
        border: isActive ? '2px solid #2563eb' : '1px solid #e5e7eb',
        borderRadius: 10, overflow: 'hidden',
      }}
    >
      <div style={{ background: isActive ? '#eff6ff' : '#f9fafb', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{session.title}</span>
            {isActive && <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>● ACTIVE</span>}
            <StatusBadge status={liveStatus} />
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, display: 'flex', gap: 12 }}>
            {session.class_scope && <span>Class: {session.class_scope}</span>}
            {session.scheduled_at && <span>⏰ {new Date(session.scheduled_at).toLocaleString()}</span>}
            <span>{sessionTasks.length} tasks</span>
            <span style={{ color: '#166534' }}>{complete} complete</span>
            {issues > 0 && <span style={{ color: '#991b1b' }}>⚠ {issues} issue{issues !== 1 ? 's' : ''}</span>}
            {followups > 0 && <span style={{ color: '#92400e' }}>↗ {followups} follow-up{followups !== 1 ? 's' : ''}</span>}
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6 }}>
            {liveStatus === 'not_started' && (
              <button
                data-testid="start-session-btn"
                disabled={busy}
                onClick={() => act(() => updateSessionStatus(planId, session.id, 'in_progress'))}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, cursor: 'pointer', background: '#2563eb', color: '#fff', border: 'none' }}
              >
                Start
              </button>
            )}
            {liveStatus === 'in_progress' && (
              <button
                data-testid="complete-session-btn"
                disabled={busy}
                onClick={() => act(() => updateSessionStatus(planId, session.id, 'complete'))}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, cursor: 'pointer', background: '#166534', color: '#fff', border: 'none' }}
              >
                Complete Session
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        {sessionTasks.length === 0
          ? <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>No tasks assigned to this session.</div>
          : sessionTasks.map(t => (
              <TaskCard key={t.id} task={t} planId={planId} isAdmin={isAdmin} onRefresh={onRefresh} />
            ))
        }
      </div>
    </div>
  );
}

// ── Follow-ups tab ───────────────────────────────────────────────────────

function FollowupsPanel({ tasks, planId, isAdmin, onRefresh }: {
  tasks: EventPlanTaskWithLive[];
  planId: number;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const flagged = tasks.filter(t => t.live_update?.followup_required || t.live_update?.carry_forward);
  if (flagged.length === 0) {
    return <div data-testid="followups-empty" style={{ padding: '2rem', color: '#6b7280', textAlign: 'center' }}>No follow-ups or carry-forward items flagged.</div>;
  }
  return (
    <div>
      {flagged.map(t => <TaskCard key={t.id} task={t} planId={planId} isAdmin={isAdmin} onRefresh={onRefresh} />)}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

export default function EventLiveChecklist() {
  const { id } = useParams<{ id: string }>();
  const planId = Number(id);
  const { can } = useCapabilities();
  const isAdmin = can('eventops.admin');

  const [plan,      setPlan]      = useState<EventPlan | null>(null);
  const [checklist, setChecklist] = useState<ChecklistType | null>(null);
  const [sessions,  setSessions]  = useState<EventPlanSessionWithLive[]>([]);
  const [tasks,     setTasks]     = useState<EventPlanTaskWithLive[]>([]);
  const [summary,   setSummary]   = useState<LiveTaskSummary | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [tab,       setTab]       = useState<'checklist' | 'followups'>('checklist');
  const [starting,  setStarting]  = useState(false);

  const load = useCallback(async () => {
    if (!planId) return;
    try {
      const [planRes, clRes, sessRes, taskRes, sumRes] = await Promise.all([
        getPlan(planId),
        getLiveChecklist(planId),
        listLiveSessionStatus(planId),
        listLiveTaskUpdates(planId),
        getLiveTaskSummary(planId),
      ]);
      setPlan(planRes.plan);
      setChecklist(clRes.checklist);
      setSessions(sessRes.sessions);
      setTasks(taskRes.tasks);
      setSummary(sumRes.summary);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load live checklist');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading live checklist…</div>;
  if (error)   return <div style={{ padding: '2rem', color: '#991b1b' }}>Error: {error}</div>;
  if (!plan)   return <div style={{ padding: '2rem' }}>Plan not found.</div>;

  const activeSessionId = checklist?.active_session_id;

  const currentSession: EventPlanSessionWithLive | undefined = (() => {
    if (activeSessionId) return sessions.find(s => s.id === activeSessionId);
    const inProg = sessions.find(s => s.live_status?.status === 'in_progress');
    if (inProg) return inProg;
    const next = sessions.find(s => s.scheduled_at && new Date(s.scheduled_at) > new Date());
    if (next) return next;
    return sessions.find(s => (s.live_status?.status ?? 'not_started') === 'not_started');
  })();

  const unassignedTasks = tasks.filter(t => !t.session_id);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
          <Link to={`/event-ops/${planId}`} style={{ fontSize: 13, color: '#2563eb' }}>← Back to Plan</Link>
          <Link
            to={`/event-ops/${planId}/post-report`}
            data-testid="post-report-link"
            style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600 }}
          >
            Generate Post-Event Report →
          </Link>
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          Live Checklist — {plan.event_code} {plan.year}
        </h1>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {plan.track_name && <span>🏁 {plan.track_name}</span>}
          {plan.class_scope && <span>Class: {plan.class_scope}</span>}
          {checklist && <StatusBadge status={checklist.status} />}
        </div>
      </div>

      {/* Start checklist CTA */}
      {isAdmin && checklist?.status === 'not_started' && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14 }}>Checklist has not been started yet.</span>
          <button
            data-testid="start-checklist-btn"
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              try { await startLiveChecklist(planId); await load(); } finally { setStarting(false); }
            }}
            style={{ padding: '6px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            Start Checklist
          </button>
        </div>
      )}

      {/* Summary bar */}
      {summary && <SummaryBar summary={summary} />}

      {/* Current session highlight */}
      {currentSession && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
          <strong>Current Session:</strong> {currentSession.title}
          {' — '}
          <StatusBadge status={currentSession.live_status?.status ?? 'not_started'} />
          {summary && (
            <span style={{ marginLeft: 12, color: '#6b7280' }}>
              {tasks.filter(t => t.session_id === currentSession.id && t.live_update?.status === 'complete').length}/
              {tasks.filter(t => t.session_id === currentSession.id).length} tasks complete
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        {(['checklist', 'followups'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: 'none', borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              color: tab === t ? '#2563eb' : '#6b7280',
            }}
          >
            {t === 'checklist' ? 'Checklist' : `Follow-ups (${(summary?.followup_required ?? 0) + (summary?.carry_forward ?? 0)})`}
          </button>
        ))}
      </div>

      {/* Checklist tab */}
      {tab === 'checklist' && (
        <div>
          {sessions.length === 0 && unassignedTasks.length === 0 && (
            <div data-testid="live-checklist-empty" style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
              No sessions or tasks in this plan yet. Add them in the Pre-Plan Editor.
            </div>
          )}
          {sessions.map(session => (
            <SessionBlock
              key={session.id}
              session={session}
              tasks={tasks}
              planId={planId}
              isAdmin={isAdmin}
              isActive={session.id === activeSessionId}
              onRefresh={load}
            />
          ))}
          {unassignedTasks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#374151' }}>Unassigned Tasks</div>
              {unassignedTasks.map(t => (
                <TaskCard key={t.id} task={t} planId={planId} isAdmin={isAdmin} onRefresh={load} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Follow-ups tab */}
      {tab === 'followups' && (
        <FollowupsPanel tasks={tasks} planId={planId} isAdmin={isAdmin} onRefresh={load} />
      )}
    </div>
  );
}
