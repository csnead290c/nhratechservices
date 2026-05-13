import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCapabilities } from '../domain/config/useCapabilities';
import {
  getPlan, getPlanStaff, getPlanSections, getPlanSessions, getPlanTasks, getPlanFiles,
  updatePlan, addStaff, deleteStaff, addSection, updateSection, deleteSection,
  addSession, deleteSession, addTask, deleteTask, addFile, deleteFile,
  type EventPlan, type EventPlanStaff, type EventPlanSection,
  type EventPlanSession, type EventPlanTask, type EventPlanFile,
  type PlanStatus,
} from '../domain/eventOps/eventOpsApi';
import { NITRO_PRE_EVENT_TEMPLATE } from '../domain/eventOps/nitroTemplate';

const S = {
  page:    { padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' } as React.CSSProperties,
  back:    { fontSize: '0.85rem', color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-block', marginBottom: '1rem' } as React.CSSProperties,
  header:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' } as React.CSSProperties,
  h1:      { fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 } as React.CSSProperties,
  h2:      { fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 0.75rem' } as React.CSSProperties,
  tabs:    { display: 'flex', gap: '2px', borderBottom: '2px solid var(--color-border)', marginBottom: '1.5rem', flexWrap: 'wrap' as const } as React.CSSProperties,
  tab:     (active: boolean): React.CSSProperties => ({ padding: '0.5rem 1rem', cursor: 'pointer', background: 'none', border: 'none', borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent', fontWeight: active ? 700 : 400, color: active ? 'var(--color-primary)' : 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '-2px' }),
  card:    { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1rem' } as React.CSSProperties,
  btn:     { padding: '0.4rem 0.85rem', borderRadius: '6px', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties,
  btnPrim: { backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none' } as React.CSSProperties,
  btnDang: { backgroundColor: '#dc2626', color: '#fff', border: 'none' } as React.CSSProperties,
  label:   { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '0.25rem', marginTop: '0.75rem' } as React.CSSProperties,
  input:   { width: '100%', padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem', boxSizing: 'border-box' as const } as React.CSSProperties,
  textarea:{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem', boxSizing: 'border-box' as const, minHeight: '120px', fontFamily: 'inherit' } as React.CSSProperties,
  row:     { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' as const } as React.CSSProperties,
  toast:   (ok: boolean): React.CSSProperties => ({ padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, backgroundColor: ok ? '#dcfce7' : '#fef2f2', color: ok ? '#166534' : '#991b1b', border: `1px solid ${ok ? '#86efac' : '#fca5a5'}`, marginBottom: '1rem' }),
  error:   { padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#991b1b' } as React.CSSProperties,
  divider: { borderTop: '1px solid var(--color-border)', margin: '1rem 0' } as React.CSSProperties,
};

const EDIT_TABS = ['Plan Info', 'Staff', 'Sections', 'Sessions', 'Tasks', 'Files'] as const;
type EditTab = typeof EDIT_TABS[number];

interface Toast { ok: boolean; msg: string }

export default function EventPrePlanEditor() {
  const { id } = useParams<{ id: string }>();
  const planId = parseInt(id ?? '0', 10);
  const navigate = useNavigate();
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
  const [activeTab, setActiveTab] = useState<EditTab>('Plan Info');
  const [toast, setToast]       = useState<Toast | null>(null);
  const [saving, setSaving]     = useState(false);

  function showToast(ok: boolean, msg: string) { setToast({ ok, msg }); setTimeout(() => setToast(null), 3000); }

  function reload() {
    return Promise.all([
      getPlan(planId), getPlanStaff(planId), getPlanSections(planId),
      getPlanSessions(planId), getPlanTasks(planId), getPlanFiles(planId),
    ]).then(([p, st, sec, ses, t, f]) => {
      setPlan(p.plan); setStaff(st.staff); setSections(sec.sections);
      setSessions(ses.sessions); setTasks(t.tasks); setFiles(f.files);
    });
  }

  useEffect(() => {
    if (!planId) return;
    reload().then(() => setLoading(false)).catch(e => { setError(e.message); setLoading(false); });
  }, [planId]);

  if (!canAdmin) return <div style={{ padding: '2rem' }}><div style={S.error}>Admin capability required to edit event plans.</div></div>;
  if (loading)   return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>Loading…</div>;
  if (error)     return <div style={{ padding: '2rem' }}><div style={S.error}>{error}</div></div>;
  if (!plan)     return <div style={{ padding: '2rem' }}><div style={S.error}>Plan not found.</div></div>;

  // ── Plan Info ──────────────────────────────────────────────────────────

  function PlanInfoTab() {
    const [form, setForm] = useState({
      title: plan!.title, track_name: plan!.track_name ?? '',
      class_scope: plan!.class_scope ?? '', status: plan!.status,
      summary: plan!.summary ?? '',
    });
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

    async function save() {
      setSaving(true);
      try {
        await updatePlan(planId, { title: form.title, track_name: form.track_name || undefined, class_scope: form.class_scope || undefined, status: form.status as PlanStatus, summary: form.summary || undefined });
        await reload();
        showToast(true, 'Plan info saved.');
      } catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Save failed'); }
      setSaving(false);
    }

    return (
      <div style={S.card}>
        <h2 style={S.h2}>Plan Metadata</h2>
        <label style={S.label}>Title</label>
        <input style={S.input} value={form.title} onChange={set('title')} />
        <label style={S.label}>Track Name</label>
        <input style={S.input} value={form.track_name} onChange={set('track_name')} placeholder="Auto Club Raceway at Pomona" />
        <label style={S.label}>Class Scope</label>
        <input style={S.input} value={form.class_scope} onChange={set('class_scope')} placeholder="TF,FC or blank for all" />
        <label style={S.label}>Status</label>
        <select style={S.input} value={form.status} onChange={set('status')}>
          {(['draft','pending_review','approved','archived'] as const).map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
        <label style={S.label}>Summary</label>
        <textarea style={S.textarea} value={form.summary} onChange={set('summary')} />
        <div style={{ marginTop: '1rem' }}>
          <button style={{ ...S.btn, ...S.btnPrim }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    );
  }

  // ── Staff ──────────────────────────────────────────────────────────────

  function StaffTab() {
    const [form, setForm] = useState({ display_name: '', assignment: '', notes: '' });
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
    async function add() {
      if (!form.display_name || !form.assignment) { showToast(false, 'Name and assignment required'); return; }
      setSaving(true);
      try { await addStaff(planId, form); await reload(); setForm({ display_name:'', assignment:'', notes:'' }); showToast(true, 'Staff added.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }
    async function remove(staffId: number) {
      if (!confirm('Remove this staff member?')) return;
      setSaving(true);
      try { await deleteStaff(staffId); await reload(); showToast(true, 'Removed.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }
    return (
      <div>
        <div style={S.card}>
          <h2 style={S.h2}>Add Staff</h2>
          <label style={S.label}>Name</label>
          <input style={S.input} value={form.display_name} onChange={set('display_name')} placeholder="Full name" />
          <label style={S.label}>Assignment / Role</label>
          <input style={S.input} value={form.assignment} onChange={set('assignment')} placeholder="e.g. Chief Tech Inspector" />
          <label style={S.label}>Notes</label>
          <input style={S.input} value={form.notes} onChange={set('notes')} />
          <div style={{ marginTop:'0.75rem' }}><button style={{ ...S.btn, ...S.btnPrim }} onClick={add} disabled={saving}>Add</button></div>
        </div>
        {staff.length > 0 && (
          <div style={S.card}>
            <h2 style={S.h2}>Current Staff ({staff.length})</h2>
            {staff.map(s => (
              <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.4rem 0', borderBottom:'1px solid var(--color-border)' }}>
                <div><strong>{s.display_name}</strong> — {s.assignment}{s.notes ? <span style={{ color:'var(--color-muted)', fontSize:'0.8rem' }}> · {s.notes}</span> : ''}</div>
                <button style={{ ...S.btn, ...S.btnDang, padding:'0.25rem 0.6rem' }} onClick={() => remove(s.id)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Sections ───────────────────────────────────────────────────────────

  function SectionsTab() {
    const [newKey, setNewKey]     = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [editing, setEditing]   = useState<number | null>(null);
    const [editBody, setEditBody] = useState('');

    async function addSec() {
      if (!newKey || !newTitle) { showToast(false, 'Key and title required'); return; }
      setSaving(true);
      try { await addSection(planId, { section_key: newKey, title: newTitle }); await reload(); setNewKey(''); setNewTitle(''); showToast(true, 'Section added.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }
    async function saveBody(secId: number) {
      setSaving(true);
      try { await updateSection(secId, { body: editBody }); await reload(); setEditing(null); showToast(true, 'Saved.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }
    async function removeSec(secId: number) {
      if (!confirm('Remove section?')) return;
      setSaving(true);
      try { await deleteSection(secId); await reload(); showToast(true, 'Removed.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }

    async function applyTemplate() {
      if (!confirm('Apply Nitro template sections? This will add missing sections (existing ones are preserved).')) return;
      setSaving(true);
      const existingKeys = new Set(sections.map(s => s.section_key));
      try {
        for (const tmplSec of NITRO_PRE_EVENT_TEMPLATE.sections) {
          if (!existingKeys.has(tmplSec.section_key)) {
            await addSection(planId, { section_key: tmplSec.section_key, title: tmplSec.title, body: tmplSec.body, sort_order: tmplSec.sort_order });
          }
        }
        await reload(); showToast(true, 'Template sections applied.');
      } catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }

    return (
      <div>
        <div style={S.card}>
          <div style={S.row}>
            <h2 style={{ ...S.h2, margin: 0, flex: 1 }}>Freeform Sections</h2>
            <button style={S.btn} onClick={applyTemplate} disabled={saving}>Apply Nitro Template</button>
          </div>
          <div style={S.divider} />
          <label style={S.label}>Section Key (unique slug)</label>
          <input style={S.input} value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="e.g. event_schedule" />
          <label style={S.label}>Title</label>
          <input style={S.input} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Event Schedule" />
          <div style={{ marginTop:'0.75rem' }}><button style={{ ...S.btn, ...S.btnPrim }} onClick={addSec} disabled={saving}>Add Section</button></div>
        </div>
        {sections.map(sec => (
          <div key={sec.id} style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
              <strong style={{ fontSize:'0.9rem' }}>{sec.title} <code style={{ fontSize:'0.7rem', color:'var(--color-muted)' }}>({sec.section_key})</code></strong>
              <div style={S.row}>
                {editing === sec.id
                  ? <><button style={{ ...S.btn, ...S.btnPrim }} onClick={() => saveBody(sec.id)} disabled={saving}>Save</button><button style={S.btn} onClick={() => setEditing(null)}>Cancel</button></>
                  : <><button style={S.btn} onClick={() => { setEditing(sec.id); setEditBody(sec.body ?? ''); }}>Edit</button><button style={{ ...S.btn, ...S.btnDang }} onClick={() => removeSec(sec.id)}>Remove</button></>}
              </div>
            </div>
            {editing === sec.id
              ? <textarea style={S.textarea} value={editBody} onChange={e => setEditBody(e.target.value)} rows={10} />
              : <pre style={{ ...S.textarea, border:'none', padding:0, background:'transparent', overflowX:'auto' as const, whiteSpace:'pre-wrap' as const, margin:0 }}>{sec.body || <span style={{ color:'var(--color-muted)' }}>No content.</span>}</pre>}
          </div>
        ))}
      </div>
    );
  }

  // ── Sessions ───────────────────────────────────────────────────────────

  function SessionsTab() {
    const [form, setForm] = useState({ session_key:'', title:'', notes:'' });
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

    async function addSes() {
      if (!form.session_key || !form.title) { showToast(false, 'Key and title required'); return; }
      setSaving(true);
      try { await addSession(planId, form); await reload(); setForm({ session_key:'', title:'', notes:'' }); showToast(true, 'Session added.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }
    async function removeSes(sessionId: number) {
      if (!confirm('Remove session?')) return;
      setSaving(true);
      try { await deleteSession(sessionId); await reload(); showToast(true, 'Removed.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }
    async function applyTemplate() {
      if (!confirm('Apply Nitro template sessions?')) return;
      setSaving(true);
      const existingKeys = new Set(sessions.map(s => s.session_key));
      try {
        for (const t of NITRO_PRE_EVENT_TEMPLATE.sessions) {
          if (!existingKeys.has(t.session_key)) await addSession(planId, { session_key: t.session_key, title: t.title, notes: t.notes, sort_order: t.sort_order });
        }
        await reload(); showToast(true, 'Template sessions applied.');
      } catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }

    return (
      <div>
        <div style={S.card}>
          <div style={S.row}>
            <h2 style={{ ...S.h2, margin:0, flex:1 }}>Sessions</h2>
            <button style={S.btn} onClick={applyTemplate} disabled={saving}>Apply Nitro Template</button>
          </div>
          <div style={S.divider} />
          <label style={S.label}>Session Key</label>
          <input style={S.input} value={form.session_key} onChange={set('session_key')} placeholder="e.g. q1" />
          <label style={S.label}>Title</label>
          <input style={S.input} value={form.title} onChange={set('title')} placeholder="e.g. Qualifying Round 1" />
          <label style={S.label}>Notes</label>
          <input style={S.input} value={form.notes} onChange={set('notes')} />
          <div style={{ marginTop:'0.75rem' }}><button style={{ ...S.btn, ...S.btnPrim }} onClick={addSes} disabled={saving}>Add Session</button></div>
        </div>
        {sessions.map(ses => (
          <div key={ses.id} style={{ ...S.card, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div><strong>{ses.title}</strong> <code style={{ fontSize:'0.7rem', color:'var(--color-muted)' }}>({ses.session_key})</code>{ses.notes ? <span style={{ color:'var(--color-muted)', fontSize:'0.8rem' }}> · {ses.notes}</span> : ''}</div>
            <button style={{ ...S.btn, ...S.btnDang }} onClick={() => removeSes(ses.id)}>Remove</button>
          </div>
        ))}
      </div>
    );
  }

  // ── Tasks ──────────────────────────────────────────────────────────────

  function TasksTab() {
    const [form, setForm] = useState({ title:'', description:'', task_type:'other', priority:'normal', session_id:'' });
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

    async function addT() {
      if (!form.title) { showToast(false, 'Title required'); return; }
      setSaving(true);
      try {
        await addTask(planId, { title: form.title, description: form.description || undefined, task_type: form.task_type as any, priority: form.priority as any, session_id: form.session_id ? parseInt(form.session_id) : undefined });
        await reload(); setForm({ title:'', description:'', task_type:'other', priority:'normal', session_id:'' }); showToast(true, 'Task added.');
      } catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }
    async function removeT(taskId: number) {
      if (!confirm('Remove task?')) return;
      setSaving(true);
      try { await deleteTask(taskId); await reload(); showToast(true, 'Removed.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }

    return (
      <div>
        <div style={S.card}>
          <h2 style={S.h2}>Add Task</h2>
          <label style={S.label}>Title</label>
          <input style={S.input} value={form.title} onChange={set('title')} placeholder="Task title" />
          <label style={S.label}>Description</label>
          <textarea style={{ ...S.textarea, minHeight:'60px' }} value={form.description} onChange={set('description')} />
          <label style={S.label}>Session (optional)</label>
          <select style={S.input} value={form.session_id} onChange={set('session_id')}>
            <option value="">— No session —</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <label style={S.label}>Task Type</label>
          <select style={S.input} value={form.task_type} onChange={set('task_type')}>
            {['inspection','survey','briefing','logistics','safety','admin','other'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={S.label}>Priority</label>
          <select style={S.input} value={form.priority} onChange={set('priority')}>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <div style={{ marginTop:'0.75rem' }}><button style={{ ...S.btn, ...S.btnPrim }} onClick={addT} disabled={saving}>Add Task</button></div>
        </div>
        {tasks.length > 0 && (
          <div style={S.card}>
            <h2 style={S.h2}>Tasks ({tasks.length})</h2>
            {tasks.map(t => (
              <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'0.5rem 0', borderBottom:'1px solid var(--color-border)', gap:'0.5rem' }}>
                <div style={{ flex:1 }}>
                  <strong style={{ fontSize:'0.875rem' }}>{t.title}</strong>
                  <span style={{ fontSize:'0.75rem', color:'var(--color-muted)' }}> · {t.task_type} · {t.priority} · {t.status.replace('_',' ')}</span>
                  {t.description && <div style={{ fontSize:'0.8rem', color:'var(--color-muted)', marginTop:'0.2rem' }}>{t.description}</div>}
                </div>
                <button style={{ ...S.btn, ...S.btnDang, padding:'0.25rem 0.6rem', flexShrink:0 }} onClick={() => removeT(t.id)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Files ──────────────────────────────────────────────────────────────

  function FilesTab() {
    const [form, setForm] = useState({ file_type:'other', title:'', url:'', notes:'' });
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

    async function addF() {
      if (!form.title) { showToast(false, 'Title required'); return; }
      setSaving(true);
      try { await addFile(planId, { file_type: form.file_type as any, title: form.title, url: form.url || undefined, notes: form.notes || undefined }); await reload(); setForm({ file_type:'other', title:'', url:'', notes:'' }); showToast(true, 'File reference added.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }
    async function removeF(fileId: number) {
      if (!confirm('Remove file reference?')) return;
      setSaving(true);
      try { await deleteFile(fileId); await reload(); showToast(true, 'Removed.'); }
      catch (e: unknown) { showToast(false, e instanceof Error ? e.message : 'Failed'); }
      setSaving(false);
    }

    return (
      <div>
        <div style={S.card}>
          <h2 style={S.h2}>Add File Reference</h2>
          <label style={S.label}>Type</label>
          <select style={S.input} value={form.file_type} onChange={set('file_type')}>
            {['map','schedule','entry_list','manual','report','photo','other'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={S.label}>Title</label>
          <input style={S.input} value={form.title} onChange={set('title')} placeholder="Document title" />
          <label style={S.label}>URL (optional)</label>
          <input style={S.input} value={form.url} onChange={set('url')} placeholder="https://..." />
          <label style={S.label}>Notes</label>
          <input style={S.input} value={form.notes} onChange={set('notes')} />
          <div style={{ marginTop:'0.75rem' }}><button style={{ ...S.btn, ...S.btnPrim }} onClick={addF} disabled={saving}>Add File</button></div>
        </div>
        {files.map(f => (
          <div key={f.id} style={{ ...S.card, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <strong>{f.title}</strong> <span style={{ fontSize:'0.75rem', color:'var(--color-muted)' }}>({f.file_type})</span>
              {f.url && <> · <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize:'0.8rem', color:'var(--color-primary)' }}>Open</a></>}
              {f.notes && <div style={{ fontSize:'0.8rem', color:'var(--color-muted)' }}>{f.notes}</div>}
            </div>
            <button style={{ ...S.btn, ...S.btnDang }} onClick={() => removeF(f.id)}>Remove</button>
          </div>
        ))}
      </div>
    );
  }

  const tabContent: Record<EditTab, React.ReactNode> = {
    'Plan Info': <PlanInfoTab />,
    'Staff':     <StaffTab />,
    'Sections':  <SectionsTab />,
    'Sessions':  <SessionsTab />,
    'Tasks':     <TasksTab />,
    'Files':     <FilesTab />,
  };

  return (
    <div style={S.page}>
      <Link to={`/event-ops/${planId}`} style={S.back}>← View Plan</Link>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>Edit: {plan.title}</h1>
          <div style={{ fontSize:'0.8rem', color:'var(--color-muted)', marginTop:'0.25rem' }}>{plan.year} · {plan.event_code}{plan.track_name ? ` · ${plan.track_name}` : ''}</div>
        </div>
        <button style={S.btn} onClick={() => navigate(`/event-ops/${planId}`)}>← Done Editing</button>
      </div>

      {toast && <div style={S.toast(toast.ok)} data-testid="editor-toast">{toast.msg}</div>}

      <div style={S.tabs}>
        {EDIT_TABS.map(t => <button key={t} style={S.tab(activeTab === t)} onClick={() => setActiveTab(t)}>{t}</button>)}
      </div>

      <div data-testid={`editor-tab-${activeTab.toLowerCase().replace(/\s+/g, '-')}`}>
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
