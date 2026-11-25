<script>
	let { data } = $props();

	const mins = (sec) => (sec == null ? '–' : `${Math.round(sec / 60)}`);

	const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

	const valid = (r) => r.duration_sec != null;

	function weekStart(isoDate) {
		const d = new Date(`${isoDate}T12:00:00Z`);
		d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
		return d.toISOString().slice(0, 10);
	}

	const fmtDate = (iso, opts) =>
		new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', ...opts });

	// ---- Summary per house -------------------------------------------------
	const summary = $derived.by(() => {
		const rows = data.houses.map((h) => {
			const mine = data.readings.filter((r) => r.place_id === h.id && valid(r));
			const durations = (slot) => mine.filter((r) => r.slot === slot).map((r) => r.duration_sec);
			const am = durations('am');
			const pm = durations('pm');
			const delays = mine
				.filter((r) => r.static_duration_sec != null)
				.map((r) => r.duration_sec - r.static_duration_sec);
			const amAvg = avg(am);
			const pmAvg = avg(pm);
			return {
				...h,
				amAvg,
				pmAvg,
				amMin: am.length ? Math.min(...am) : null,
				amMax: am.length ? Math.max(...am) : null,
				pmMin: pm.length ? Math.min(...pm) : null,
				pmMax: pm.length ? Math.max(...pm) : null,
				roundTrip: amAvg != null && pmAvg != null ? amAvg + pmAvg : null,
				delayAvg: avg(delays),
				km: avg(mine.filter((r) => r.distance_m != null).map((r) => r.distance_m)),
				days: new Set(mine.map((r) => r.local_date)).size
			};
		});
		return rows.sort((a, b) => (a.roundTrip ?? Infinity) - (b.roundTrip ?? Infinity));
	});

	const bestId = $derived(summary.find((s) => s.roundTrip != null)?.id);

	// ---- Lookup: date|place|slot -> reading ------------------------------
	const byKey = $derived(
		new Map(data.readings.map((r) => [`${r.local_date}|${r.place_id}|${r.slot}`, r]))
	);
	const dates = $derived([...new Set(data.readings.map((r) => r.local_date))]); // already desc

	// ---- Weekly averages ---------------------------------------------------
	const weeks = $derived.by(() => {
		const map = new Map();
		for (const r of data.readings) {
			if (!valid(r)) continue;
			const w = weekStart(r.local_date);
			if (!map.has(w)) map.set(w, []);
			map.get(w).push(r);
		}
		return [...map.entries()]
			.sort(([a], [b]) => b.localeCompare(a))
			.map(([week, rs]) => ({
				week,
				cells: Object.fromEntries(
					data.houses.map((h) => {
						const pick = (slot) =>
							avg(rs.filter((r) => r.place_id === h.id && r.slot === slot).map((r) => r.duration_sec));
						return [h.id, { am: pick('am'), pm: pick('pm') }];
					})
				)
			}));
	});
</script>

<svelte:head><title>Happy Commute</title></svelte:head>

<main>
	<header>
		<h1>Happy Commute</h1>
		<p class="sub">
			Live driving times · 8:00 house → {data.destination} · 16:30 {data.destination} → house ·
			all times in minutes
		</p>
		<nav>
			Show last:
			{#each [2, 4, 8, 12, 26] as w}
				<a href="?weeks={w}" class:active={data.weeks === w}>{w} wks</a>
			{/each}
		</nav>
	</header>

	{#if data.readings.length === 0}
		<p class="empty">No readings yet. The first one will appear after the next 8:00 or 16:30 check.</p>
	{:else}
		<section>
			<h2>Averages</h2>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th>House</th>
							<th>Morning<br /><small>to work</small></th>
							<th>Evening<br /><small>home</small></th>
							<th>Round trip</th>
							<th>Morning range</th>
							<th>Evening range</th>
							<th>Avg traffic delay</th>
							<th>Distance</th>
							<th>Days</th>
						</tr>
					</thead>
					<tbody>
						{#each summary as s}
							<tr class:best={s.id === bestId}>
								<td class="label">{s.label}</td>
								<td class="num">{mins(s.amAvg)}</td>
								<td class="num">{mins(s.pmAvg)}</td>
								<td class="num strong">{mins(s.roundTrip)}</td>
								<td class="num muted">{mins(s.amMin)}–{mins(s.amMax)}</td>
								<td class="num muted">{mins(s.pmMin)}–{mins(s.pmMax)}</td>
								<td class="num">+{mins(s.delayAvg)}</td>
								<td class="num muted">{s.km == null ? '–' : (s.km / 1000).toFixed(1) + ' km'}</td>
								<td class="num muted">{s.days}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section>
			<h2>Weekly averages <small>(morning / evening)</small></h2>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th>Week of</th>
							{#each data.houses as h}<th>{h.label}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each weeks as w}
							<tr>
								<td class="label">{fmtDate(w.week, { month: 'short', day: 'numeric' })}</td>
								{#each data.houses as h}
									<td class="num">{mins(w.cells[h.id].am)} / {mins(w.cells[h.id].pm)}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section>
			<h2>Daily readings <small>(8:00 / 16:30)</small></h2>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th>Date</th>
							{#each data.houses as h}<th>{h.label}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each dates as d}
							<tr>
								<td class="label">{fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
								{#each data.houses as h}
									{@const am = byKey.get(`${d}|${h.id}|am`)}
									{@const pm = byKey.get(`${d}|${h.id}|pm`)}
									<td class="num">
										<span title={am?.error ?? ''} class:err={am?.error}>{mins(am?.duration_sec)}</span>
										/
										<span title={pm?.error ?? ''} class:err={pm?.error}>{mins(pm?.duration_sec)}</span>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
		font-family: system-ui, sans-serif;
		color: #1d2330;
	}
	h1 { margin: 0; font-size: 1.6rem; }
	h2 { font-size: 1.1rem; margin: 2.5rem 0 0.75rem; }
	h2 small, th small { font-weight: 400; color: #6b7280; }
	.sub { color: #6b7280; margin: 0.35rem 0 1rem; }
	nav { display: flex; gap: 0.5rem; align-items: center; font-size: 0.9rem; flex-wrap: wrap; }
	nav a {
		padding: 0.2rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 999px;
		text-decoration: none;
		color: inherit;
	}
	nav a.active { background: #1d2330; color: #fff; border-color: #1d2330; }
	.scroll { overflow-x: auto; }
	table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
	th, td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
	th { text-align: right; font-weight: 600; vertical-align: bottom; background: #f9fafb; }
	th:first-child, td.label { text-align: left; }
	td.num { text-align: right; font-variant-numeric: tabular-nums; }
	.strong { font-weight: 700; }
	.muted { color: #6b7280; }
	tr.best td { background: #ecfdf5; }
	tr.best td.label::after { content: ' ★'; color: #059669; }
	.err { color: #b91c1c; text-decoration: underline dotted; cursor: help; }
	.empty { margin-top: 2rem; padding: 1rem; background: #f9fafb; border-radius: 8px; }
</style>