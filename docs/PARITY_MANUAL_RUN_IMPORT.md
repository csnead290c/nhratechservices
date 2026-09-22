# Importing a session that isn't in the NHRA feed

The parity portal loads timing data from the NHRA OData feed, keyed by a race
lookup (`YYYYMMDD`). Private test sessions, match races and any other session
NHRA never publishes return zero rows there, so those runs have to be loaded
from a CSV instead.

`scripts/parity/import-manual-runs.php` does that. It creates the track and
event when they don't exist, records a `parity_run_imports` row so the event has
the same provenance trail as a live ingest, and pushes each CSV row through the
same `parity_normalizeRow()` / `parity_computeRowHash()` / `parity_upsertRun()`
path the feed uses. Re-running the same file changes nothing, so it is safe to
correct a file and import again.

Weather is unchanged: once the runs and the event exist, the portal's weather
refresh fills in Tempest and Open-Meteo samples and rebuilds the canonical
series.

## 1. Build the CSV

One row per pass. Column names match the OData field names:

```
TimeStamp,Category,ClassIndex,Round,Lane,Name,CarNumber,RT,ft60,ft330,ft660,mph660,ft1000,mph1000,ft1320,mph1320,RunId,Notes,Flag
```

- `TimeStamp` is **track-local** wall clock (`YYYY-MM-DD HH:MM:SS`). The script
  converts it to UTC with the track's timezone, same as a feed ingest.
- `Round` is part of the dedupe key. For a test session use a per-rider pass
  counter (`T1`, `T2`, …) so each pass stays distinct.
- `Lane` may be blank when the timing sheet doesn't record it.
- `RunId` is an optional source reference; anything stable works.
- `Notes` is stored as a `note` run flag on the run (visible in the portal), and
  is the only home for crew notes and scale weights — `parity_runs` has no
  free-text column.
- `Flag` may be `bad` or `exclude` to also file that flag, using `Notes` as the
  reason. Use it for rows you don't trust.

Leave a cell empty when the value is unknown; empty never overwrites an existing
value on re-import.

## 2. Import

Dry run first — it does the full insert and rolls back:

```bash
php scripts/parity/import-manual-runs.php \
  --csv=data/parity-imports/20260908-indy-test-session-runs.csv \
  --race-lookup=20260908 \
  --event="Indy Test Session" \
  --track="Lucas Oil Indianapolis Raceway Park" \
  --timezone=America/Indiana/Indianapolis \
  --lat=39.7106 --lon=-86.3419 \
  --label=indy-test-2026 \
  --dry-run
```

Drop `--dry-run` to commit. Add `--force` when the race lookup already has a
successful import (an intentional re-import); without it the script refuses.

Track coordinates are only written when the track has none — Open-Meteo needs
them, so pass them for a track you are creating. Use the values in
`scripts/seed-nhra-member-tracks.mjs` to stay consistent with the member track
list.

## 3. Weather

In the parity portal, open the event and hit **Refresh Event Data**. Its
weather phase (`action=refreshWeather`) pulls Tempest, then Open-Meteo, then
rebuilds the canonical series — the same path a feed-loaded event takes.

The timing phase that runs first re-queries OData and finds nothing for a
session NHRA never published. That is harmless: the ingest only inserts, so the
imported runs are untouched and the step reports zero rows.

Open-Meteo needs the track's latitude and longitude; Tempest only contributes if
a station is configured near the track.

## 4. Verify

- The event appears in the event list with the expected run count.
- Weather coverage for the event is non-zero.
- The qualifying sheet / parity report for the class shows the passes.

## Undoing an import

`action=purgeEventRuns` removes every run for a race lookup. The event, track
and weather rows stay.
