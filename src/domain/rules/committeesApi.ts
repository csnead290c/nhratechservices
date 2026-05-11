/**
 * Rules Committees API Service (Phase 3C)
 *
 * Fetches committees data from api/rules-committees.php.
 * All endpoints require authenticated user with appropriate capability.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface Committee {
  id: number;
  uuid: string;
  name: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  class_scope: string | null;
  status: 'active' | 'inactive' | 'dissolved';
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface CommitteeMember {
  id: number;
  committee_id: number;
  user_id: number | null;
  person_id: number | null;
  role: 'chairman' | 'co_chairman' | 'member' | 'advisor' | 'secretary' | 'liaison' | 'guest' | 'observer';
  title: string | null;
  voting_member: number;
  start_date: string;
  end_date: string | null;
  user_name: string | null;
  user_email: string | null;
  created_at: string;
}

export interface CommitteeDetail extends Committee {
  members: CommitteeMember[];
  chair: CommitteeMember | null;
  co_chair: CommitteeMember | null;
}

export interface CommitteesListResponse {
  committees: Committee[];
  count: number;
}

export interface CommitteeResponse {
  committee: CommitteeDetail;
  members: CommitteeMember[];
  chair: CommitteeMember | null;
  co_chair: CommitteeMember | null;
}

export interface MembersResponse {
  members: CommitteeMember[];
  count: number;
  chair: CommitteeMember | null;
  co_chair: CommitteeMember | null;
}

export interface CategoriesResponse {
  categories: string[];
}

export interface EligibleUsersResponse {
  users: { id: number; name: string; email: string }[];
  count: number;
}

export interface CreateCommitteeData {
  name: string;
  slug?: string;
  description?: string;
  category?: string;
  class_scope?: string;
  status?: 'active' | 'inactive' | 'dissolved';
}

export interface UpdateCommitteeData {
  name?: string;
  slug?: string;
  description?: string;
  category?: string;
  class_scope?: string;
  status?: 'active' | 'inactive' | 'dissolved';
}

export interface AddMemberData {
  committee_id: number;
  user_id?: number;
  person_id?: number;
  role: CommitteeMember['role'];
  title?: string;
  voting_member?: number;
  start_date?: string;
  end_date?: string;
}

export interface UpdateMemberData {
  role?: CommitteeMember['role'];
  title?: string;
  voting_member?: number;
  start_date?: string;
  end_date?: string;
}

function getToken(): string | null {
  return localStorage.getItem('rsa_token');
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ─── Read Endpoints (committees.read) ───────────────────────────────────

export async function fetchCommittees(params?: {
  status?: string;
  category?: string;
}): Promise<CommitteesListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.category) searchParams.set('category', params.category);

  const query = searchParams.toString();
  return apiFetch<CommitteesListResponse>(`/rules-committees.php?action=list${query ? `&${query}` : ''}`);
}

export async function fetchCommittee(idOrSlug: string | number): Promise<CommitteeResponse> {
  return apiFetch<CommitteeResponse>(`/rules-committees.php?action=get&id=${encodeURIComponent(idOrSlug)}`);
}

export async function fetchCommitteeMembers(committeeId: number): Promise<MembersResponse> {
  return apiFetch<MembersResponse>(`/rules-committees.php?action=members&committee_id=${committeeId}`);
}

export async function fetchCommitteeCategories(): Promise<CategoriesResponse> {
  return apiFetch<CategoriesResponse>('/rules-committees.php?action=categories');
}

// ─── Admin Endpoints (committees.admin) ──────────────────────────────────

export async function createCommittee(data: CreateCommitteeData): Promise<{ success: boolean; id: number; uuid: string }> {
  return apiFetch('/rules-committees.php?action=create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCommittee(id: number, data: UpdateCommitteeData): Promise<{ success: boolean }> {
  return apiFetch(`/rules-committees.php?action=update&id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCommittee(id: number): Promise<{ success: boolean }> {
  return apiFetch(`/rules-committees.php?action=delete&id=${id}`, {
    method: 'DELETE',
  });
}

export async function addCommitteeMember(data: AddMemberData): Promise<{ success: boolean; id: number }> {
  return apiFetch('/rules-committees.php?action=addMember', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCommitteeMember(memberId: number, data: UpdateMemberData): Promise<{ success: boolean }> {
  return apiFetch(`/rules-committees.php?action=updateMember&id=${memberId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function removeCommitteeMember(memberId: number): Promise<{ success: boolean }> {
  return apiFetch(`/rules-committees.php?action=removeMember&id=${memberId}`, {
    method: 'DELETE',
  });
}

export async function fetchEligibleUsers(committeeId?: number): Promise<EligibleUsersResponse> {
  const query = committeeId ? `?committee_id=${committeeId}` : '';
  return apiFetch<EligibleUsersResponse>(`/rules-committees.php?action=eligibleUsers${query}`);
}
