# Commute tracker

Records **live** driving times on weekdays:

- **08:00 Toronto**: each house → work
- **16:30 Toronto**: work → each house

The page at `/commute` shows the averages for each house (morning, evening, round trip, min–max range, average traffic delay), then weekly averages, then every daily reading.

```
supabase/
  migrations/20261125000000_commute_tracker.sql   tables + seed template
  functions/commute-check/index.ts                calls Google Routes API, saves readings
  cron.sql                                        pg_cron schedules (run once)
sveltekit/src/routes/commute/
  +page.server.ts                                 loads data (service role, server only)
  +page.svelte                                    the report page
```

## 1. Google API key
1. In Google Cloud Console, create a project (billing must be enabled) and enable the **Routes API**.
2. Create an API key and restrict it to **Routes API** only.
3. Optional safety net: under APIs & Services → Routes API → Quotas, cap requests per day (about 50 is plenty), and add a budget alert.

Usage: 5 houses × 2 checks × ~22 weekdays ≈ 220 elements a month. That's well under the 5,000 free monthly "Compute Route Matrix Pro" elements.

## 2. Database
Run the migration (`supabase db push`, or paste it into the SQL editor). Then add your places:

```sql
insert into public.commute_places (label, address, is_destination, sort_order) values
  ('Work',    'full work address',  true,  0),
  ('House A', 'full address',       false, 1),
  ('House B', 'full address',       false, 2);
```

To add or drop a house later, insert a row or set `active = false`. Its history is kept.

## 3. Edge function
```bash
supabase secrets set GOOGLE_MAPS_API_KEY=xxx COMMUTE_CRON_SECRET=$(openssl rand -hex 24)
supabase functions deploy commute-check --no-verify-jwt
```
The function checks the `x-cron-secret` header itself, which is why JWT verification is turned off.

Test it without saving anything:
```bash
curl -H "x-cron-secret: YOUR_SECRET" \
  "https://YOUR-REF.supabase.co/functions/v1/commute-check?slot=am&test=1"
```

## 4. Schedule
Edit the two placeholders in `supabase/cron.sql` (function URL and secret), then run it in the SQL editor.

pg_cron uses UTC, so each job fires at both the EST and the EDT hour. The function only records when the Toronto clock reads 08:00–08:19 or 16:30–16:49. This keeps the times correct across daylight-saving changes. If a slot gets triggered twice on the same day, only the first reading is kept.

## 5. Page
Copy `sveltekit/src/routes/commute` into your SvelteKit app. Add to its env:
```
SUPABASE_URL=https://YOUR-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```
The page shows house labels only, never addresses. Still, put it behind your auth or Vercel password protection. Use `?weeks=12` to change the time range.

## Notes
- "Live" here means `TRAFFIC_AWARE_OPTIMAL` with no departure time, i.e. "leave now". It's the same estimate the Google Maps app would show at that moment.
- Weekends are off. Change `1-5` to `*` in `cron.sql` to include them.
