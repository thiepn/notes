# B12 native Notes ecosystem dashboard

Parent B11 Notes draft #77 at 41795e5fd29d824a900341524a9370988e6fdacb.

The native Notes Account settings now display a real Notes status and source-confirmed last-sync timestamp, with carefully separate navigation to Library's Account dashboard and the Hub's read-only private metadata session. No cross-origin records or tokens are fetched, and Core synchronization is never represented as a live multi-app service.

Core request callbacks use an up-to-date app-owned identity/ref before starting and again on resolution; a mid-flight account switch, workspace loss or local revocation suppresses an apparent success. Notes' original Supabase syncNow() and timer stay authoritative; no independent Core raw notes engine is created. Per-session counters reset when the owner changes. The native Backup & import handoff is described rather than replacing the real Notes importer.

Only source changes in an isolated B11 child draft. Full native Notes CI and authenticated browser acceptance must be genuinely executed before release.
