/**
 * Event Operations API Client
 *
 * Typed wrappers for /api/event-ops.php.
 * Read actions require eventops.read capability.
 * Admin actions require eventops.admin capability.
 */

import { getAuthToken } from '../../services/api';

const API_BASE = '/api';

// ── Helpers ────────────────────────────────────────────────────────────────

async function eoGet<T>(action: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}/event-ops.php`, window.location.origin);
  url.searchParams.set('action', action);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const token = getAuthToken();
  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Cache-Control': 'no-cache',
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function eoPost<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/event-ops.php?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────

export type PlanType = 'pre_event' | 'race_day' | 'post_event' | 'template';
export type PlanStatus = 'draft' | 'pending_review' | 'approved' | 'archived';
export type TaskType = 'inspection' | 'survey' | 'briefing' | 'logistics' | 'safety' | 'admin' | 'other';
export type TaskPriority = 'high' | 'normal' | 'low';
export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'deferred' | 'cancelled';
export type FileType = 'map' | 'schedule' | 'entry_list' | 'manual' | 'report' | 'photo' | 'other';

export interface EventPlan {
  id: number;
  uuid: string;
  event_instance_id: number | null;
  parity_event_id: number | null;
  year: number;
  event_code: string;
  track_name: string | null;
  title: string;
  class_scope: string | null;
  plan_type: PlanType;
  status: PlanStatus;
  summary: string | null;
  created_by: number;
  approved_by: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventPlanStaff {
  id: number;
  event_plan_id: number;
  user_id: number | null;
  person_id: number | null;
  display_name: string;
  assignment: string;
  arrive_at: string | null;
  depart_at: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventPlanSection {
  id: number;
  event_plan_id: number;
  section_key: string;
  title: string;
  body: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventPlanSession {
  id: number;
  event_plan_id: number;
  session_key: string;
  title: string;
  class_scope: string | null;
  scheduled_at: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventPlanTask {
  id: number;
  event_plan_id: number;
  session_id: number | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_user_id: number | null;
  assigned_person_id: number | null;
  due_at: string | null;
  completed_at: string | null;
  completed_by: number | null;
  carry_forward_to_next_event: number;
  result_summary: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventPlanTaskTarget {
  id: number;
  task_id: number;
  event_entry_id: number | null;
  driver_name: string | null;
  class_code: string | null;
  vehicle_identifier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventPlanFile {
  id: number;
  event_plan_id: number;
  file_type: FileType;
  title: string;
  url: string | null;
  box_file_id: string | null;
  box_folder_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Read actions ───────────────────────────────────────────────────────────

export async function listPlans(): Promise<{ plans: EventPlan[] }> {
  return eoGet('listPlans');
}

export async function getPlan(planId: number): Promise<{ plan: EventPlan }> {
  return eoGet('getPlan', { plan_id: planId });
}

export async function getPlanStaff(planId: number): Promise<{ staff: EventPlanStaff[] }> {
  return eoGet('getPlanStaff', { plan_id: planId });
}

export async function getPlanSections(planId: number): Promise<{ sections: EventPlanSection[] }> {
  return eoGet('getPlanSections', { plan_id: planId });
}

export async function getPlanSessions(planId: number): Promise<{ sessions: EventPlanSession[] }> {
  return eoGet('getPlanSessions', { plan_id: planId });
}

export async function getPlanTasks(planId: number): Promise<{ tasks: EventPlanTask[] }> {
  return eoGet('getPlanTasks', { plan_id: planId });
}

export async function getPlanFiles(planId: number): Promise<{ files: EventPlanFile[] }> {
  return eoGet('getPlanFiles', { plan_id: planId });
}

// ── Plan admin actions ─────────────────────────────────────────────────────

export async function createPlan(data: {
  year: number;
  event_code: string;
  title: string;
  track_name?: string;
  class_scope?: string;
  plan_type?: PlanType;
  status?: PlanStatus;
  summary?: string;
  event_instance_id?: number;
  parity_event_id?: number;
}): Promise<{ success: boolean; plan_id: number }> {
  return eoPost('createPlan', data);
}

export async function updatePlan(planId: number, data: Partial<Omit<EventPlan, 'id' | 'uuid' | 'created_by' | 'created_at' | 'updated_at'>>): Promise<{ success: boolean }> {
  return eoPost('updatePlan', { plan_id: planId, ...data });
}

export async function softDeletePlan(planId: number): Promise<{ success: boolean }> {
  return eoPost('softDeletePlan', { plan_id: planId });
}

export async function clonePlan(planId: number, overrides?: { title?: string; event_code?: string; year?: number; event_instance_id?: number }): Promise<{ success: boolean; plan_id: number }> {
  return eoPost('clonePlan', { plan_id: planId, ...overrides });
}

export async function generateFromTemplate(): Promise<{ success: boolean; message: string }> {
  return eoPost('generateFromTemplate', {});
}

// ── Staff admin actions ────────────────────────────────────────────────────

export async function addStaff(planId: number, data: {
  display_name: string;
  assignment: string;
  user_id?: number;
  person_id?: number;
  arrive_at?: string;
  depart_at?: string;
  notes?: string;
  sort_order?: number;
}): Promise<{ success: boolean; staff_id: number }> {
  return eoPost('addStaff', { plan_id: planId, ...data });
}

export async function updateStaff(staffId: number, data: Partial<Omit<EventPlanStaff, 'id' | 'event_plan_id' | 'created_at' | 'updated_at'>>): Promise<{ success: boolean }> {
  return eoPost('updateStaff', { staff_id: staffId, ...data });
}

export async function deleteStaff(staffId: number): Promise<{ success: boolean }> {
  return eoPost('deleteStaff', { staff_id: staffId });
}

// ── Section admin actions ──────────────────────────────────────────────────

export async function addSection(planId: number, data: {
  section_key: string;
  title: string;
  body?: string;
  sort_order?: number;
}): Promise<{ success: boolean; section_id: number }> {
  return eoPost('addSection', { plan_id: planId, ...data });
}

export async function updateSection(sectionId: number, data: { title?: string; body?: string; sort_order?: number }): Promise<{ success: boolean }> {
  return eoPost('updateSection', { section_id: sectionId, ...data });
}

export async function deleteSection(sectionId: number): Promise<{ success: boolean }> {
  return eoPost('deleteSection', { section_id: sectionId });
}

// ── Session admin actions ──────────────────────────────────────────────────

export async function addSession(planId: number, data: {
  session_key: string;
  title: string;
  class_scope?: string;
  scheduled_at?: string;
  notes?: string;
  sort_order?: number;
}): Promise<{ success: boolean; session_id: number }> {
  return eoPost('addSession', { plan_id: planId, ...data });
}

export async function updateSession(sessionId: number, data: Partial<Omit<EventPlanSession, 'id' | 'event_plan_id' | 'session_key' | 'created_at' | 'updated_at'>>): Promise<{ success: boolean }> {
  return eoPost('updateSession', { session_id: sessionId, ...data });
}

export async function deleteSession(sessionId: number): Promise<{ success: boolean }> {
  return eoPost('deleteSession', { session_id: sessionId });
}

// ── Task admin actions ─────────────────────────────────────────────────────

export async function addTask(planId: number, data: {
  title: string;
  description?: string;
  task_type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  session_id?: number;
  assigned_user_id?: number;
  assigned_person_id?: number;
  due_at?: string;
  carry_forward_to_next_event?: number;
  sort_order?: number;
}): Promise<{ success: boolean; task_id: number }> {
  return eoPost('addTask', { plan_id: planId, ...data });
}

export async function updateTask(taskId: number, data: Partial<Omit<EventPlanTask, 'id' | 'event_plan_id' | 'created_at' | 'updated_at'>>): Promise<{ success: boolean }> {
  return eoPost('updateTask', { task_id: taskId, ...data });
}

export async function deleteTask(taskId: number): Promise<{ success: boolean }> {
  return eoPost('deleteTask', { task_id: taskId });
}

export async function addTaskTarget(taskId: number, data: {
  event_entry_id?: number;
  driver_name?: string;
  class_code?: string;
  vehicle_identifier?: string;
  notes?: string;
}): Promise<{ success: boolean; target_id: number }> {
  return eoPost('addTaskTarget', { task_id: taskId, ...data });
}

export async function deleteTaskTarget(targetId: number): Promise<{ success: boolean }> {
  return eoPost('deleteTaskTarget', { target_id: targetId });
}

// ── File admin actions ─────────────────────────────────────────────────────

export async function addFile(planId: number, data: {
  file_type?: FileType;
  title: string;
  url?: string;
  box_file_id?: string;
  box_folder_id?: string;
  notes?: string;
}): Promise<{ success: boolean; file_id: number }> {
  return eoPost('addFile', { plan_id: planId, ...data });
}

export async function updateFile(fileId: number, data: Partial<Omit<EventPlanFile, 'id' | 'event_plan_id' | 'created_at' | 'updated_at'>>): Promise<{ success: boolean }> {
  return eoPost('updateFile', { file_id: fileId, ...data });
}

export async function deleteFile(fileId: number): Promise<{ success: boolean }> {
  return eoPost('deleteFile', { file_id: fileId });
}

// ── v38 Live Checklist Types ───────────────────────────────────────────────

export type LiveStatus =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'issue_found'
  | 'skipped'
  | 'blocked'
  | 'not_applicable';

export interface EventLiveChecklist {
  id: number;
  uuid: string;
  event_plan_id: number;
  status: LiveStatus;
  active_session_id: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface EventLiveTaskUpdate {
  id: number;
  uuid: string;
  event_plan_id: number;
  task_id: number;
  session_id: number | null;
  status: LiveStatus;
  result: string | null;
  notes: string | null;
  issue_found: number;
  followup_required: number;
  carry_forward: number;
  completed_by: number | null;
  completed_at: string | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface EventLiveSessionStatus {
  id: number;
  event_plan_id: number;
  session_id: number;
  status: LiveStatus;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface LiveTaskSummary {
  total: number;
  by_status: Partial<Record<LiveStatus, number>>;
  complete: number;
  open: number;
  in_progress: number;
  issue_found: number;
  followup_required: number;
  carry_forward: number;
}

export interface EventPlanSessionWithLive extends EventPlanSession {
  live_status: EventLiveSessionStatus | null;
}

export interface EventPlanTaskWithLive extends EventPlanTask {
  live_update: EventLiveTaskUpdate | null;
}

// ── v38 Live Checklist read actions ───────────────────────────────────────

export async function getLiveChecklist(planId: number): Promise<{ checklist: EventLiveChecklist }> {
  return eoGet('getLiveChecklist', { plan_id: planId });
}

export async function listLiveSessionStatus(planId: number): Promise<{ sessions: EventPlanSessionWithLive[] }> {
  return eoGet('listLiveSessionStatus', { plan_id: planId });
}

export async function listLiveTaskUpdates(planId: number): Promise<{ tasks: EventPlanTaskWithLive[] }> {
  return eoGet('listLiveTaskUpdates', { plan_id: planId });
}

export async function getLiveTaskSummary(planId: number): Promise<{ summary: LiveTaskSummary }> {
  return eoGet('getLiveTaskSummary', { plan_id: planId });
}

// ── v38 Live Checklist admin actions ──────────────────────────────────────

export async function startLiveChecklist(planId: number): Promise<{ success: boolean; checklist_id: number }> {
  return eoPost('startLiveChecklist', { plan_id: planId });
}

export async function updateLiveChecklistStatus(planId: number, status: LiveStatus): Promise<{ success: boolean }> {
  return eoPost('updateLiveChecklistStatus', { plan_id: planId, status });
}

export async function updateSessionStatus(planId: number, sessionId: number, status: LiveStatus, notes?: string): Promise<{ success: boolean }> {
  return eoPost('updateSessionStatus', { plan_id: planId, session_id: sessionId, status, notes: notes ?? '' });
}

export async function startSession(planId: number, sessionId: number): Promise<{ success: boolean }> {
  return eoPost('startSession', { plan_id: planId, session_id: sessionId });
}

export async function completeSession(planId: number, sessionId: number): Promise<{ success: boolean }> {
  return eoPost('completeSession', { plan_id: planId, session_id: sessionId });
}

export async function updateTaskStatus(planId: number, taskId: number, payload: { status: LiveStatus; result?: string }): Promise<{ success: boolean }> {
  return eoPost('updateTaskStatus', { plan_id: planId, task_id: taskId, ...payload });
}

export async function addTaskNote(planId: number, taskId: number, notes: string): Promise<{ success: boolean }> {
  return eoPost('addTaskNote', { plan_id: planId, task_id: taskId, notes });
}

export async function markTaskFollowupRequired(planId: number, taskId: number): Promise<{ success: boolean }> {
  return eoPost('markTaskFollowupRequired', { plan_id: planId, task_id: taskId });
}

export async function markTaskCarryForward(planId: number, taskId: number): Promise<{ success: boolean }> {
  return eoPost('markTaskCarryForward', { plan_id: planId, task_id: taskId });
}

export async function clearTaskFollowup(planId: number, taskId: number): Promise<{ success: boolean }> {
  return eoPost('clearTaskFollowup', { plan_id: planId, task_id: taskId });
}

export async function clearTaskCarryForward(planId: number, taskId: number): Promise<{ success: boolean }> {
  return eoPost('clearTaskCarryForward', { plan_id: planId, task_id: taskId });
}
