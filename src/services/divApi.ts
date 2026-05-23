/**
 * Divisional Parity API Client
 *
 * Typed wrappers for the NHRA Tech Divisional Parity endpoints (api/parity_div.php).
 * All endpoints require nhra.parity capability.
 */

import { getAuthToken } from './api';

const API_BASE = '/api';

// ── Division codes ───────────────────────────────────────────────────────────

export const DIV_CODES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'W'] as const;
export type DivisionCode = typeof DIV_CODES[number];

export const DIV_LABELS: Record<string, string> = {
  D1: 'Division 1 (Mid-Atlantic)',
  D2: 'Division 2 (South Central)',
  D3: 'Division 3 (North Central)',
  D4: 'Division 4 (Central)',
  D5: 'Division 5 (Rocky Mountain)',
  D6: 'Division 6 (West Coast)',
  D7: 'Division 7 (Pacific)',
  W:  'World Motorsports',
};

// ── Response Types ───────────────────────────────────────────────────────────

export interface DivTrackRow {
  id: number;
  track_name: string;
  timezone_iana: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  nhra_division: string | null;
}

export interface DivEventRow {
  id: number;
  event_name: string;
  season_year: number | null;
  nhra_division: string;
  race_lookup: string | null;
  start_date_local: string;
  end_date_local: string;
  event_code: string | null;
  track_id: number;
  track_name: string;
  timezone_iana: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  run_count: number;
  last_imported_at: string | null;
}

export interface DivRunRow {
  id: number;
  uuid: string;
  race_lookup: string;
  nhra_division: string;
  run_timestamp_utc: string | null;
  run_time_local: string | null;
  category: string | null;
  class_index: string | null;
  round: string | null;
  lane: string | null;
  driver_name: string | null;
  car_number: string | null;
  dial_in: number | null;
  rt: number | null;
  ft60: number | null;
  ft330: number | null;
  ft660: number | null;
  mph660: number | null;
  ft1000: number | null;
  mph1000: number | null;
  ft1320: number | null;
  mph1320: number | null;
  win_flag: boolean | null;
  dq_flag: boolean | null;
  mov: number | null;
  place: string | null;
}

export interface DivCategoryRow {
  category: string | null;
  class_index: string;
  run_count: number;
}

export interface DivIngestResult {
  raceLookup: string;
  division: string;
  importId?: string;
  rowsFetched: number;
  rowsInserted: number;
  rowsUpdated?: number;
  rowsDeduped: number;
  skipped?: boolean;
  status?: string;
  error?: string;
  message?: string;
}

export interface DivIngestManyResponse {
  summary: {
    total: number;
    success: number;
    skipped: number;
    empty: number;
    error: number;
    totalRowsInserted: number;
  };
  results: DivIngestResult[];
}

export interface DivScrapeResult {
  yearsScraped: number[];
  eventsUpserted: number;
  tracksUpserted: number;
  errors: string[];
}

export interface DivDiscoveryItem {
  raceLookup: string;
  division: string;
  rowCount: number;
}

export interface DivSuggestResponse {
  division: string;
  found: DivDiscoveryItem[];
  probed: number;
  nextStartDate: string | null;
}

export interface DivWeatherBackfillResponse {
  ok: boolean;
  eventId: number;
  inserted: number;
  deduped: number;
  errors: string[];
}

export interface DivRefreshResponse {
  ok: boolean;
  event_id: number;
  event_name: string;
  timing: {
    fetched: number;
    inserted: number;
    updated: number;
    errors: string[];
  };
  weather: {
    inserted: number;
    deduped: number;
    errors: string[];
  };
  duration_ms: number;
}

// ── Request helper ───────────────────────────────────────────────────────────

async function divRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = options.method === 'POST'
    ? `${API_BASE}${endpoint}`
    : `${API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}_t=${Date.now()}`;

  const actionMatch = endpoint.match(/action=(\w+)/);
  const actionLabel = actionMatch ? actionMatch[1] : endpoint;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err: any) {
    throw new Error(`[${actionLabel}] Network error: ${err.message}`);
  }

  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html') || text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
    throw new Error(
      `[${actionLabel}] HTTP ${response.status} — received HTML instead of JSON. Body: ${text.slice(0, 200)}`
    );
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`[${actionLabel}] HTTP ${response.status} — invalid JSON. Body: ${text.slice(0, 200)}`);
  }

  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }

  return data as T;
}

// ── API object ───────────────────────────────────────────────────────────────

export const divApi = {

  // ── Read ──────────────────────────────────────────────────────────────────

  async listDivEvents(params: { year?: number; division?: string } = {}): Promise<{ events: DivEventRow[] }> {
    const qs = new URLSearchParams();
    qs.set('action', 'listDivEvents');
    if (params.year)     qs.set('year', String(params.year));
    if (params.division) qs.set('division', params.division);
    return divRequest<{ events: DivEventRow[] }>(`/parity_div.php?${qs.toString()}`);
  },

  async listDivTracks(): Promise<{ tracks: DivTrackRow[] }> {
    return divRequest<{ tracks: DivTrackRow[] }>('/parity_div.php?action=listDivTracks');
  },

  async divEventCategories(eventId: number): Promise<{ eventId: number; categories: DivCategoryRow[] }> {
    return divRequest<{ eventId: number; categories: DivCategoryRow[] }>(
      `/parity_div.php?action=divEventCategories&eventId=${eventId}`
    );
  },

  async divRuns(params: {
    eventId: number;
    classIndex?: string;
    round?: string;
    driverName?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ runs: DivRunRow[]; count: number }> {
    const qs = new URLSearchParams();
    qs.set('action', 'divRuns');
    qs.set('eventId', String(params.eventId));
    if (params.classIndex) qs.set('classIndex', params.classIndex);
    if (params.round)      qs.set('round', params.round);
    if (params.driverName) qs.set('driverName', params.driverName);
    if (params.limit)      qs.set('limit', String(params.limit));
    if (params.offset)     qs.set('offset', String(params.offset));
    return divRequest<{ runs: DivRunRow[]; count: number }>(`/parity_div.php?${qs.toString()}`);
  },

  // ── Admin write ───────────────────────────────────────────────────────────

  async createDivEvent(params: {
    eventName: string;
    trackId?: number;
    trackName?: string;
    startDateLocal: string;
    endDateLocal: string;
    division: string;
    seasonYear?: number;
    eventCode?: string;
    timezoneIana?: string;
    latitude?: number;
    longitude?: number;
    city?: string;
    state?: string;
  }): Promise<{ id: number; raceLookup: string; division: string }> {
    return divRequest<{ id: number; raceLookup: string; division: string }>('/parity_div.php?action=createDivEvent', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async updateDivEvent(params: {
    id: number;
    eventName?: string;
    startDateLocal?: string;
    endDateLocal?: string;
    division?: string;
    seasonYear?: number;
    eventCode?: string;
  }): Promise<{ ok: boolean; id: number }> {
    return divRequest<{ ok: boolean; id: number }>('/parity_div.php?action=updateDivEvent', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async ingestDivEventRuns(params: { eventId: number; force?: boolean }): Promise<DivIngestResult> {
    return divRequest<DivIngestResult>('/parity_div.php?action=ingestDivEventRuns', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async ingestDivMany(params: {
    items: { raceLookup: string; division: string }[];
    force?: boolean;
    throttleMs?: number;
  }): Promise<DivIngestManyResponse> {
    return divRequest<DivIngestManyResponse>('/parity_div.php?action=ingestDivMany', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async scrapeDivSchedule(params: {
    yearStart: number;
    yearEnd: number;
    throttleMs?: number;
    force?: boolean;
  }): Promise<DivScrapeResult> {
    return divRequest<DivScrapeResult>('/parity_div.php?action=scrapeDivSchedule', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async suggestDivRaceLookups(params: {
    division: string;
    startDate?: string;
    endDate?: string;
    maxProbes?: number;
    throttleMs?: number;
  }): Promise<DivSuggestResponse> {
    return divRequest<DivSuggestResponse>('/parity_div.php?action=suggestDivRaceLookups', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async backfillDivWeather(params: { eventId: number }): Promise<DivWeatherBackfillResponse> {
    return divRequest<DivWeatherBackfillResponse>('/parity_div.php?action=backfillDivWeather', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async refreshDivEventData(params: { eventId: number }): Promise<DivRefreshResponse> {
    return divRequest<DivRefreshResponse>('/parity_div.php?action=refreshDivEventData', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // ── Runs with weather (EventRuns / LiveTiming) ───────────────────────

  async runsWithWeather(params: {
    raceLookup?: string;
    eventId?: number;
    category?: string;
    classIndex?: string;
    driverName?: string;
    lane?: string;
    round?: string;
    limit?: number;
    offset?: number;
  }): Promise<import('./parityApi').RunsWithWeatherResponse> {
    const qs = new URLSearchParams();
    qs.set('action', 'divRunsWithWeather');
    if (params.raceLookup) qs.set('raceLookup', params.raceLookup);
    if (params.eventId)    qs.set('eventId', String(params.eventId));
    if (params.category)   qs.set('category', params.category);
    else if (params.classIndex) qs.set('classIndex', params.classIndex);
    if (params.driverName) qs.set('driverName', params.driverName);
    if (params.lane)       qs.set('lane', params.lane);
    if (params.round)      qs.set('round', params.round);
    if (params.limit)      qs.set('limit', String(params.limit));
    if (params.offset)     qs.set('offset', String(params.offset));
    return divRequest<import('./parityApi').RunsWithWeatherResponse>(`/parity_div.php?${qs.toString()}`);
  },

  // ── Analysis endpoints (divisional equivalents) ───────────────────────

  async anomalyAnalysis(params: {
    raceLookup: string;
    category?: string;
    classIndex?: string;
    limit?: number;
  }): Promise<import('./parityApi').AnomalyAnalysisResponse> {
    const qs = new URLSearchParams();
    qs.set('action', 'divAnomalyAnalysis');
    qs.set('raceLookup', params.raceLookup);
    if (params.category) qs.set('category', params.category);
    else if (params.classIndex) qs.set('classIndex', params.classIndex);
    if (params.limit) qs.set('limit', String(params.limit));
    return divRequest<import('./parityApi').AnomalyAnalysisResponse>(`/parity_div.php?${qs.toString()}`);
  },

  async qualSheet(params: {
    eventId: number;
    classIndex: string;
  }): Promise<import('./parityApi').QualSheetResponse> {
    const qs = new URLSearchParams();
    qs.set('action', 'divQualSheet');
    qs.set('eventId', String(params.eventId));
    qs.set('classIndex', params.classIndex);
    return divRequest<import('./parityApi').QualSheetResponse>(`/parity_div.php?${qs.toString()}`);
  },

  async rtAnalysis(params: {
    eventId: number;
    category: string;
  }): Promise<import('./parityApi').RtAnalysisResponse> {
    const qs = new URLSearchParams();
    qs.set('action', 'divRtAnalysis');
    qs.set('eventId', String(params.eventId));
    qs.set('category', params.category);
    return divRequest<import('./parityApi').RtAnalysisResponse>(`/parity_div.php?${qs.toString()}`);
  },

  async incrementalComparison(params: {
    eventId: number;
    category?: string;
    classIndex?: string;
    session?: string;
    mode?: string;
  }): Promise<import('./parityApi').IncrementalComparisonResponse> {
    const qs = new URLSearchParams();
    qs.set('action', 'divIncrementalComparison');
    qs.set('eventId', String(params.eventId));
    if (params.category) qs.set('category', params.category);
    if (params.classIndex) qs.set('classIndex', params.classIndex);
    if (params.session) qs.set('session', params.session);
    return divRequest<import('./parityApi').IncrementalComparisonResponse>(`/parity_div.php?${qs.toString()}`);
  },

  async weatherTimeseries(params: {
    eventId: number;
    startUtc?: string;
    endUtc?: string;
  }): Promise<import('./parityApi').WeatherTimeseriesResponse> {
    const qs = new URLSearchParams();
    qs.set('action', 'divWeatherTimeseries');
    qs.set('eventId', String(params.eventId));
    if (params.startUtc) qs.set('startUtc', params.startUtc);
    if (params.endUtc) qs.set('endUtc', params.endUtc);
    return divRequest<import('./parityApi').WeatherTimeseriesResponse>(`/parity_div.php?${qs.toString()}`);
  },
};
