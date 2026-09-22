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
export type LifecycleStage = 'draft' | 'pre_event' | 'live' | 'complete' | 'reviewed';
export type TaskType = 'inspection' | 'survey' | 'briefing' | 'logistics' | 'safety' | 'admin' | 'other';
export type TaskPriority = 'high' | 'normal' | 'low';
export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'deferred' | 'cancelled';
export type FileType = 'map' | 'schedule' | 'entry_list' | 'manual' | 'report' | 'photo' | 'other';

// ── v40 Structured Schedule types ────────────────────────────────────────

export type ScheduleStatus = 'upcoming' | 'called' | 'running' | 'complete' | 'delayed' | 'cancelled';
export type ActivityType =
  | 'racing' | 'meeting' | 'inspection' | 'contingency'
  | 'parade' | 'teardown' | 'secure' | 'break' | 'other';

export const SCHEDULE_STATUSES: { value: ScheduleStatus; label: string }[] = [
  { value: 'upcoming',  label: 'Upcoming' },
  { value: 'called',    label: 'Called' },
  { value: 'running',   label: 'Running' },
  { value: 'complete',  label: 'Complete' },
  { value: 'delayed',   label: 'Delayed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'racing',      label: 'Racing' },
  { value: 'meeting',     label: 'Meeting' },
  { value: 'inspection',  label: 'Inspection' },
  { value: 'contingency', label: 'Contingency' },
  { value: 'parade',      label: 'Parade' },
  { value: 'teardown',    label: 'Teardown' },
  { value: 'secure',      label: 'Secure' },
  { value: 'break',       label: 'Break' },
  { value: 'other',       label: 'Other' },
];

/** Suggested class/category codes for datalist autocomplete (not exhaustive). */
export const CATEGORY_SUGGESTIONS = [
  'TF', 'FC', 'PS', 'PSM', 'PM', 'TS', 'TD', 'TAD', 'TAFC', 'Comp', 'SG', 'SC', 'ST', 'SS',
];

/** Suggested staff duty labels (not exhaustive — free text allowed). */
export const DUTY_SUGGESTIONS = [
  'TF/FC', 'PS/PSM', 'FSS/TS', 'Fuel Check', 'Scales', 'Shutoffs', 'TV Antenna',
  'Water Station', 'Ice/Drinks', 'Clean Cabinets', 'Clean Counters/Floors',
  'Chassis Certifications', 'Lane Checks', 'Contingency', 'Winner Data',
];

/** Suggested per-session responsibilities for schedule assignments. */
export const RESPONSIBILITY_SUGGESTIONS = [
  'Lane Checks', 'Contingency', 'Winner Data', 'Winner Data + Contingency',
  'Fuel Check', 'Scales', 'Shutoffs', 'Inspection', 'Staging',
];

export interface EventScheduleAssignment {
  id: number;
  event_plan_id: number;
  schedule_item_id: number;
  staff_id: number | null;
  assignee_name: string | null;
  responsibility: string;
  notes: string | null;
  sort_order: number;
  staff_display_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventScheduleItem {
  id: number;
  uuid: string;
  event_plan_id: number;
  session_id: number | null;
  schedule_date: string | null;
  day_label: string | null;
  title: string;
  sort_order: number;
  scheduled_time: string | null;        // 'HH:MM:SS' when a real clock time
  scheduled_time_label: string | null;  // 'TBD', 'Following TF', etc.
  projected_time: string | null;
  projected_time_label: string | null;
  activity_type: string;
  category_code: string | null;
  round_label: string | null;
  expected_car_count: number | null;
  comments: string | null;
  scale_required: number;
  fuel_required: number;
  status: ScheduleStatus;
  actual_start_at: string | null;
  actual_end_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  assignments: EventScheduleAssignment[];
}

export interface EventStaffDuty {
  id: number;
  event_plan_id: number;
  staff_id: number;
  duty: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventPlan {
  id: number;
  uuid: string;
  event_instance_id: number | null;
  parity_event_id: number | null;
  year: number;
  event_code: string;
  event_date: string | null;
  track_name: string | null;
  title: string;
  class_scope: string | null;
  plan_type: PlanType;
  status: PlanStatus;
  lifecycle_stage: LifecycleStage;
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
  radio_number: string | null;
  vehicle: string | null;
  phone: string | null;
  arrive_at: string | null;
  depart_at: string | null;
  notes: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  duties?: EventStaffDuty[];
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
  event_date?: string;
  class_scope?: string;
  plan_type?: PlanType;
  status?: PlanStatus;
  lifecycle_stage?: LifecycleStage;
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
  radio_number?: string;
  vehicle?: string;
  phone?: string;
  arrive_at?: string;
  depart_at?: string;
  notes?: string;
  is_active?: number;
  sort_order?: number;
  duties?: string[];
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

// ── v39 Post-Event Report Types ───────────────────────────────────────────

export type ReportStatus = 'draft' | 'generated' | 'in_review' | 'finalized' | 'archived';
export type ReportItemSourceType = 'plan_task' | 'live_task_update' | 'incident' | 'manual' | 'file' | 'followup';

export interface EventPostReport {
  id: number;
  uuid: string;
  event_plan_id: number;
  title: string;
  status: ReportStatus;
  summary: string | null;
  generated_summary: string | null;
  completed_task_count: number;
  open_task_count: number;
  issue_task_count: number;
  followup_task_count: number;
  carry_forward_task_count: number;
  incident_count: number;
  generated_at: string | null;
  finalized_at: string | null;
  finalized_by: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface EventPostReportSection {
  id: number;
  report_id: number;
  section_key: string;
  title: string;
  body: string | null;
  generated_body: string | null;
  sort_order: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface EventPostReportItem {
  id: number;
  report_id: number;
  source_type: ReportItemSourceType;
  source_id: number | null;
  title: string;
  body: string | null;
  status: ReportStatus;
  priority: TaskPriority;
  assigned_user_id: number | null;
  assigned_person_id: number | null;
  due_at: string | null;
  completed_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface EventPostReportFile {
  id: number;
  report_id: number;
  file_type: FileType;
  title: string;
  url: string | null;
  box_file_id: string | null;
  box_folder_id: string | null;
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface EventPostReportIncident {
  id: number;
  report_id: number;
  incident_id: number | null;
  incident_analysis_id: number | null;
  title: string;
  summary: string | null;
  status: ReportStatus;
  followup_required: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ReportPreviewCounts {
  total_tasks: number;
  completed_tasks: number;
  open_tasks: number;
  issue_tasks: number;
  followup_tasks: number;
  carry_forward_tasks: number;
  file_count: number;
  staff_count: number;
}

export interface ReportPreview {
  plan: EventPlan;
  staff: EventPlanStaff[];
  sessions: Array<{
    session: EventPlanSession;
    live_status: EventLiveSessionStatus | null;
    task_count: number;
    complete_count: number;
  }>;
  files: EventPlanFile[];
  counts: ReportPreviewCounts;
  issue_items: Array<EventPlanTask & { live_update: EventLiveTaskUpdate }>;
  followup_items: Array<EventPlanTask & { live_update: EventLiveTaskUpdate }>;
  sections: Array<Pick<EventPostReportSection, 'section_key' | 'title' | 'generated_body'>>;
}

// ── v39 Read actions ──────────────────────────────────────────────────────

export async function listPostReports(planId: number): Promise<{ reports: EventPostReport[] }> {
  return eoGet('listPostReports', { plan_id: planId });
}

export async function getPostReport(reportId: number): Promise<{ report: EventPostReport }> {
  return eoGet('getPostReport', { report_id: reportId });
}

export async function getPostReportSections(reportId: number): Promise<{ sections: EventPostReportSection[] }> {
  return eoGet('getPostReportSections', { report_id: reportId });
}

export async function getPostReportItems(reportId: number): Promise<{ items: EventPostReportItem[] }> {
  return eoGet('getPostReportItems', { report_id: reportId });
}

export async function getPostReportFiles(reportId: number): Promise<{ files: EventPostReportFile[] }> {
  return eoGet('getPostReportFiles', { report_id: reportId });
}

export async function getPostReportIncidents(reportId: number): Promise<{ incidents: EventPostReportIncident[] }> {
  return eoGet('getPostReportIncidents', { report_id: reportId });
}

export async function getPostReportPreview(planId: number): Promise<{ preview: ReportPreview }> {
  return eoGet('getPostReportPreview', { plan_id: planId });
}

// ── v39 Admin actions ─────────────────────────────────────────────────────

export async function generatePostReport(planId: number): Promise<{ success: boolean; report_id: number }> {
  return eoPost('generatePostReport', { plan_id: planId });
}

export async function createPostReport(planId: number, title?: string): Promise<{ success: boolean; report_id: number }> {
  return eoPost('createPostReport', { plan_id: planId, title: title ?? '' });
}

export async function updatePostReport(reportId: number, payload: { title?: string; summary?: string; generated_summary?: string }): Promise<{ success: boolean }> {
  return eoPost('updatePostReport', { report_id: reportId, ...payload });
}

export async function finalizePostReport(reportId: number): Promise<{ success: boolean }> {
  return eoPost('finalizePostReport', { report_id: reportId });
}

export async function reopenPostReport(reportId: number): Promise<{ success: boolean }> {
  return eoPost('reopenPostReport', { report_id: reportId });
}

export async function deletePostReport(reportId: number): Promise<{ success: boolean }> {
  return eoPost('softDeletePostReport', { report_id: reportId });
}

export async function regeneratePostReportSummary(reportId: number): Promise<{ success: boolean }> {
  return eoPost('regeneratePostReportSummary', { report_id: reportId });
}

export async function updateReportSection(reportId: number, sectionId: number, payload: { title?: string; body?: string }): Promise<{ success: boolean }> {
  return eoPost('updateReportSection', { report_id: reportId, section_id: sectionId, ...payload });
}

export async function addReportItem(reportId: number, payload: { title: string; body?: string; priority?: TaskPriority }): Promise<{ success: boolean; item_id: number }> {
  return eoPost('addReportItem', { report_id: reportId, ...payload });
}

export async function updateReportItem(reportId: number, itemId: number, payload: Partial<Pick<EventPostReportItem, 'title' | 'body' | 'status' | 'priority'>>): Promise<{ success: boolean }> {
  return eoPost('updateReportItem', { report_id: reportId, item_id: itemId, ...payload });
}

export async function deleteReportItem(reportId: number, itemId: number): Promise<{ success: boolean }> {
  return eoPost('deleteReportItem', { report_id: reportId, item_id: itemId });
}

export async function addReportFile(reportId: number, payload: { title: string; file_type?: FileType; url?: string; box_file_id?: string; box_folder_id?: string; notes?: string }): Promise<{ success: boolean; file_id: number }> {
  return eoPost('addReportFile', { report_id: reportId, ...payload });
}

export async function deleteReportFile(reportId: number, fileId: number): Promise<{ success: boolean }> {
  return eoPost('deleteReportFile', { report_id: reportId, file_id: fileId });
}

export async function addReportIncident(reportId: number, payload: { title: string; summary?: string; incident_id?: number; followup_required?: boolean }): Promise<{ success: boolean; incident_ref_id: number }> {
  return eoPost('addReportIncident', { report_id: reportId, ...payload });
}

export async function deleteReportIncident(reportId: number, incidentRefId: number): Promise<{ success: boolean }> {
  return eoPost('deleteReportIncident', { report_id: reportId, incident_ref_id: incidentRefId });
}

// ── v40 Structured Schedule actions ─────────────────────────────────────────

export async function getSchedule(planId: number, date?: string): Promise<{ items: EventScheduleItem[]; days: string[] }> {
  return eoGet('getSchedule', { plan_id: planId, date });
}

/** Display helper: label phrasing wins; otherwise trim HH:MM:SS → HH:MM. */
export function fmtScheduleTime(time: string | null, label: string | null): string {
  if (label) return label;
  if (!time) return '—';
  return time.length >= 5 ? time.slice(0, 5) : time;
}

export interface ScheduleItemInput {
  session_id?: number | null;
  schedule_date?: string | null;
  day_label?: string | null;
  title?: string;
  sort_order?: number;
  /** Clock time ('13:30') or free phrasing ('TBD', 'Following TF') — the API
   *  splits it into the TIME column or the label column automatically. */
  scheduled_time?: string | null;
  scheduled_time_label?: string | null;
  projected_time?: string | null;
  projected_time_label?: string | null;
  activity_type?: ActivityType;
  category_code?: string | null;
  round_label?: string | null;
  expected_car_count?: number | null;
  comments?: string | null;
  scale_required?: number;
  fuel_required?: number;
  status?: ScheduleStatus;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
}

export async function addScheduleItem(planId: number, data: ScheduleItemInput & { title: string }): Promise<{ success: boolean; item_id: number }> {
  return eoPost('addScheduleItem', { plan_id: planId, ...data });
}

export async function updateScheduleItem(itemId: number, data: ScheduleItemInput): Promise<{ success: boolean }> {
  return eoPost('updateScheduleItem', { item_id: itemId, ...data });
}

export async function deleteScheduleItem(itemId: number): Promise<{ success: boolean }> {
  return eoPost('deleteScheduleItem', { item_id: itemId });
}

export async function duplicateScheduleItem(itemId: number): Promise<{ success: boolean; item_id: number }> {
  return eoPost('duplicateScheduleItem', { item_id: itemId });
}

export async function reorderScheduleItems(planId: number, itemIds: number[]): Promise<{ success: boolean }> {
  return eoPost('reorderScheduleItems', { plan_id: planId, item_ids: itemIds });
}

export async function setScheduleItemStatus(itemId: number, status: ScheduleStatus): Promise<{ success: boolean }> {
  return eoPost('setScheduleItemStatus', { item_id: itemId, status });
}

export async function addScheduleAssignment(itemId: number, data: {
  staff_id?: number | null;
  assignee_name?: string;
  responsibility: string;
  notes?: string;
  sort_order?: number;
}): Promise<{ success: boolean; assignment_id: number }> {
  return eoPost('addScheduleAssignment', { schedule_item_id: itemId, ...data });
}

export async function updateScheduleAssignment(assignmentId: number, data: {
  staff_id?: number | null;
  assignee_name?: string | null;
  responsibility?: string;
  notes?: string | null;
  sort_order?: number;
}): Promise<{ success: boolean }> {
  return eoPost('updateScheduleAssignment', { assignment_id: assignmentId, ...data });
}

export async function deleteScheduleAssignment(assignmentId: number): Promise<{ success: boolean }> {
  return eoPost('deleteScheduleAssignment', { assignment_id: assignmentId });
}

// ── v40 Staff duty actions ──────────────────────────────────────────────────

export async function addStaffDuty(planId: number, staffId: number, duty: string, sortOrder?: number): Promise<{ success: boolean; duty_id: number }> {
  return eoPost('addStaffDuty', { plan_id: planId, staff_id: staffId, duty, sort_order: sortOrder });
}

export async function updateStaffDuty(dutyId: number, data: { duty?: string; sort_order?: number }): Promise<{ success: boolean }> {
  return eoPost('updateStaffDuty', { duty_id: dutyId, ...data });
}

export async function deleteStaffDuty(dutyId: number): Promise<{ success: boolean }> {
  return eoPost('deleteStaffDuty', { duty_id: dutyId });
}
