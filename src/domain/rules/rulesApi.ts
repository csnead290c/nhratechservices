/**
 * Rules & Governance API Service (Phase 3A — Read-Only)
 *
 * Fetches rules data from api/rules.php.
 * All read endpoints require an authenticated user with 'rules.read'.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface Rule {
  id: number;
  uuid: string;
  rule_number: string;
  category: string;
  class_scope: string | null;
  title: string;
  body: string;
  status: 'active' | 'superseded' | 'proposed' | 'deleted';
  effective_from: string;
  effective_to: string | null;
  current_version_id: number | null;
  current_version?: RuleVersion | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface RuleVersion {
  id: number;
  rule_id: number;
  version_number: number;
  rule_number: string;
  title: string;
  body: string;
  change_summary: string | null;
  effective_from: string;
  effective_to: string | null;
  created_by: number | null;
  created_at: string;
}

export interface RulesListResponse {
  rules: Rule[];
  count: number;
}

export interface RuleResponse {
  rule: Rule;
}

export interface VersionsResponse {
  versions: RuleVersion[];
  count: number;
}

export interface CategoriesResponse {
  categories: string[];
}

function getToken(): string | null {
  return localStorage.getItem('rsa_token');
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`Rules API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchRules(params?: {
  category?: string;
  status?: string;
  class_scope?: string;
  search?: string;
}): Promise<RulesListResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('action', 'list');
  if (params?.category) searchParams.set('category', params.category);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.class_scope) searchParams.set('class_scope', params.class_scope);
  if (params?.search) searchParams.set('search', params.search);

  return apiFetch<RulesListResponse>(`/rules.php?${searchParams.toString()}`);
}

export async function fetchRule(idOrUuid: string): Promise<RuleResponse> {
  return apiFetch<RuleResponse>(`/rules.php?action=get&id=${encodeURIComponent(idOrUuid)}`);
}

export async function fetchRuleVersions(ruleId: number): Promise<VersionsResponse> {
  return apiFetch<VersionsResponse>(`/rules.php?action=versions&rule_id=${ruleId}`);
}

export async function fetchCategories(): Promise<CategoriesResponse> {
  return apiFetch<CategoriesResponse>('/rules.php?action=categories');
}
