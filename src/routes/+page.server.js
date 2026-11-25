import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SECRET_KEY } from '$app/env/private';

// Server-only: uses the Supabase secret key (sb_secret_...). The tables have RLS
// with no public policies, so the publishable key can't (and shouldn't) read them.
// Put this route behind your own auth or Vercel password protection.

export async function load({ url }) {
	const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const weeks = Math.min(Math.max(Number(url.searchParams.get('weeks')) || 8, 1), 52);
	const since = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString().slice(0, 10);

	const [placesRes, readingsRes] = await Promise.all([
		supabase
			.from('commute_places')
			.select('id, label, is_destination, sort_order')
			.eq('active', true)
			.order('sort_order'),
		supabase
			.from('commute_readings')
			.select('place_id, slot, local_date, duration_sec, static_duration_sec, distance_m, error')
			.gte('local_date', since)
			.order('local_date', { ascending: false })
	]);

	if (placesRes.error) throw placesRes.error;
	if (readingsRes.error) throw readingsRes.error;

	const places = placesRes.data ?? [];
	return {
		weeks,
		destination: places.find((p) => p.is_destination)?.label ?? 'Work',
		houses: places.filter((p) => !p.is_destination).map(({ id, label }) => ({ id, label })),
		readings: readingsRes.data ?? []
	};
}