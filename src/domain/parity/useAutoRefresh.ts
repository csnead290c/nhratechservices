import { useEffect, useRef, useState, useCallback } from 'react';

/** How often to auto-refetch timing data from OData API (ms). */
export const AUTO_REFRESH_TIMING_INTERVAL_MS = 60_000; // 60 seconds

/** How often to auto-refetch weather data (ms). */
export const AUTO_REFRESH_WEATHER_INTERVAL_MS = 300_000; // 5 minutes

/**
 * Determines whether an event is "ongoing" based on its date range.
 * An event is ongoing if today (in the event's local timezone) falls
 * between start_date_local and end_date_local (inclusive, with +1 day buffer on end).
 */
export function isEventOngoing(
  startDateLocal: string | null | undefined,
  endDateLocal: string | null | undefined,
  timezoneIana: string | null | undefined,
): boolean {
  if (!startDateLocal || !endDateLocal) return false;
  try {
    // Get "today" in the event's timezone
    const tz = timezoneIana || 'America/New_York';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const todayLocal = formatter.format(now); // YYYY-MM-DD

    // Add 1-day buffer on end (events often run past listed end date)
    const endDate = new Date(endDateLocal + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 1);
    const endBuffered = endDate.toISOString().slice(0, 10);

    return todayLocal >= startDateLocal && todayLocal <= endBuffered;
  } catch {
    return false;
  }
}

/**
 * Hook that auto-refreshes timing and weather data on separate intervals.
 *
 * Timing refresh (default 60s): Fetches fresh run data from OData API.
 * Weather refresh (default 5min): Fetches weather from Tempest/Open-Meteo.
 *
 * Both are gated by:
 *   1. `enabled` flag (caller controls — typically isEventOngoing)
 *   2. Tab is visible (document.visibilityState === 'visible')
 *   3. User hasn't toggled it off
 *
 * Weather failures do NOT block timing refreshes—they run independently.
 */
export function useAutoRefresh(
  onRefreshTiming: () => void | Promise<void>,
  onRefreshWeather: () => void | Promise<void>,
  enabled: boolean,
  timingIntervalMs: number = AUTO_REFRESH_TIMING_INTERVAL_MS,
  weatherIntervalMs: number = AUTO_REFRESH_WEATHER_INTERVAL_MS,
): {
  autoRefreshOn: boolean;
  toggleAutoRefresh: () => void;
  lastTimingRefreshAt: number | null;
  lastWeatherRefreshAt: number | null;
  isTimingRefreshing: boolean;
  isWeatherRefreshing: boolean;
} {
  const [userEnabled, setUserEnabled] = useState(true);
  const [lastTimingRefreshAt, setLastTimingRefreshAt] = useState<number | null>(null);
  const [lastWeatherRefreshAt, setLastWeatherRefreshAt] = useState<number | null>(null);
  const [isTimingRefreshing, setIsTimingRefreshing] = useState(false);
  const [isWeatherRefreshing, setIsWeatherRefreshing] = useState(false);

  const onTimingRef = useRef(onRefreshTiming);
  const onWeatherRef = useRef(onRefreshWeather);
  onTimingRef.current = onRefreshTiming;
  onWeatherRef.current = onRefreshWeather;

  const active = enabled && userEnabled;

  // Timing refresh interval
  useEffect(() => {
    if (!active) return;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;

      setIsTimingRefreshing(true);
      const startTime = Date.now();
      console.log('[useAutoRefresh] Timing refresh starting at', new Date(startTime).toISOString());
      try {
        await onTimingRef.current();
        // Only update timestamp on success
        setLastTimingRefreshAt(Date.now());
        console.log('[useAutoRefresh] Timing refresh completed successfully');
      } catch (err) {
        // Log but don't stop the interval
        console.error('[useAutoRefresh] Timing refresh failed:', err);
      } finally {
        setIsTimingRefreshing(false);
      }
    };

    const timer = setInterval(tick, timingIntervalMs);

    return () => clearInterval(timer);
  }, [active, timingIntervalMs]);

  // Weather refresh interval
  useEffect(() => {
    if (!active) return;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;

      setIsWeatherRefreshing(true);
      console.log('[useAutoRefresh] Weather refresh starting at', new Date().toISOString());
      try {
        await onWeatherRef.current();
        // Only update timestamp on success
        setLastWeatherRefreshAt(Date.now());
        console.log('[useAutoRefresh] Weather refresh completed successfully');
      } catch (err) {
        // Log but don't stop the interval or affect timing
        console.error('[useAutoRefresh] Weather refresh failed:', err);
      } finally {
        setIsWeatherRefreshing(false);
      }
    };

    const timer = setInterval(tick, weatherIntervalMs);

    return () => clearInterval(timer);
  }, [active, weatherIntervalMs]);

  const toggleAutoRefresh = useCallback(() => setUserEnabled(prev => !prev), []);

  return {
    autoRefreshOn: active,
    toggleAutoRefresh,
    lastTimingRefreshAt,
    lastWeatherRefreshAt,
    isTimingRefreshing,
    isWeatherRefreshing,
  };
}
