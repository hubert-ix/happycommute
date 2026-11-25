<script>
	let { data } = $props();

	const mins = (sec) => (sec == null ? '—' : `${Math.round(sec / 60)}`);

	const signedMins = (sec) => {
		if (sec == null) return '—';
		const m = Math.round(sec / 60);
		return m > 0 ? `+${m}` : m < 0 ? `−${Math.abs(m)}` : '0';
	};

	const range = (min, max) =>
		min == null ? '—' : mins(min) === mins(max) ? mins(min) : `${mins(min)}–${mins(max)}`;

	const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

	const valid = (r) => r.duration_sec != null;

	// Colour a value against the others in its group: fastest green, slowest red, rest amber.
	function tone(value, group) {
		if (value == null) return 'none';
		const vals = group.filter((v) => v != null).map((v) => Math.round(v / 60));
		const v = Math.round(value / 60);
		const lo = Math.min(...vals);
		const hi = Math.max(...vals);
		if (vals.length < 2 || lo === hi) return 'mid';
		if (v === lo) return 'best';
		if (v === hi) return 'worst';
		return 'mid';
	}

	function weekStart(isoDate) {
		const d = new Date(`${isoDate}T12:00:00Z`);
		d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
		return d.toISOString().slice(0, 10);
	}

	const fmtDate = (iso, opts) =>
		new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', ...opts });

	// ---- Summary per house -------------------------------------------------
	const summary = $derived.by(() => {
		const rows = data.houses.map((h, i) => {
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
				order: i,
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
		// Rank by round trip once both directions exist; until then keep your sort order.
		return rows.sort(
			(a, b) => (a.roundTrip ?? Infinity) - (b.roundTrip ?? Infinity) || a.order - b.order
		);
	});

	const amGroup = $derived(summary.map((s) => s.amAvg));
	const pmGroup = $derived(summary.map((s) => s.pmAvg));
	const rtGroup = $derived(summary.map((s) => s.roundTrip));

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
			.map(([week, rs]) => {
				const cells = Object.fromEntries(
					data.houses.map((h) => {
						const pick = (slot) =>
							avg(rs.filter((r) => r.place_id === h.id && r.slot === slot).map((r) => r.duration_sec));
						return [h.id, { am: pick('am'), pm: pick('pm') }];
					})
				);
				const all = Object.values(cells);
				return { week, cells, am: all.map((c) => c.am), pm: all.map((c) => c.pm) };
			});
	});

	// Daily rows with per-slot groups for colouring.
	const days = $derived(
		dates.map((d) => {
			const cells = Object.fromEntries(
				data.houses.map((h) => [
					h.id,
					{ am: byKey.get(`${d}|${h.id}|am`), pm: byKey.get(`${d}|${h.id}|pm`) }
				])
			);
			const all = Object.values(cells);
			return {
				date: d,
				cells,
				am: all.map((c) => c.am?.duration_sec),
				pm: all.map((c) => c.pm?.duration_sec)
			};
		})
	);
</script>

<svelte:head>
	<title>Happy Commute</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Nunito:wght@400;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#snippet pill(sec, group, title = '')}
	<span class="pill {tone(sec, group)}" {title}>{mins(sec)}</span>
{/snippet}

<div class="page">
	<main>
		<header>
			<h1>Happy Commute</h1>
			<p class="sub">
				Live driving times · <strong>8:00</strong> house → {data.destination} ·
				<strong>16:30</strong> {data.destination} → house · all times in minutes
			</p>
			<nav>
				<span>Show last:</span>
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
				<div class="card">
					<table>
						<thead>
							<tr>
								<th>House</th>
								<th class="c">Morning<small>to work</small></th>
								<th class="c">Evening<small>home</small></th>
								<th class="c">Round trip</th>
								<th class="c">Morning range</th>
								<th class="c">Evening range</th>
								<th class="c">Avg traffic delay</th>
								<th class="r">Distance</th>
								<th class="r">Days</th>
							</tr>
						</thead>
						<tbody>
							{#each summary as s}
								<tr>
									<td class="label">{s.label}</td>
									<td class="c">{@render pill(s.amAvg, amGroup)}</td>
									<td class="c">{@render pill(s.pmAvg, pmGroup)}</td>
									<td class="c">{@render pill(s.roundTrip, rtGroup)}</td>
									<td class="c muted">{range(s.amMin, s.amMax)}</td>
									<td class="c muted">{range(s.pmMin, s.pmMax)}</td>
									<td class="c delay" class:up={s.delayAvg != null && Math.round(s.delayAvg / 60) > 0}>
										{signedMins(s.delayAvg)}
									</td>
									<td class="r muted">{s.km == null ? '—' : (s.km / 1000).toFixed(1) + ' km'}</td>
									<td class="r muted">{s.days}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<section>
				<h2>Weekly averages <small>morning / evening</small></h2>
				<div class="card">
					<table>
						<thead>
							<tr>
								<th>Week of</th>
								{#each data.houses as h}<th class="c">{h.label}</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each weeks as w}
								<tr>
									<td class="label">{fmtDate(w.week, { month: 'short', day: 'numeric' })}</td>
									{#each data.houses as h}
										<td class="c pair">
											{@render pill(w.cells[h.id].am, w.am)}
											<span class="slash">/</span>
											{@render pill(w.cells[h.id].pm, w.pm)}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<section>
				<h2>Daily readings <small>8:00 / 16:30</small></h2>
				<div class="card">
					<table>
						<thead>
							<tr>
								<th>Date</th>
								{#each data.houses as h}<th class="c">{h.label}</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each days as d}
								<tr>
									<td class="label">{fmtDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
									{#each data.houses as h}
										{@const am = d.cells[h.id].am}
										{@const pm = d.cells[h.id].pm}
										<td class="c pair">
											{#if am?.error}<span class="pill error" title={am.error}>!</span>{:else}{@render pill(am?.duration_sec, d.am)}{/if}
											<span class="slash">/</span>
											{#if pm?.error}<span class="pill error" title={pm.error}>!</span>{:else}{@render pill(pm?.duration_sec, d.pm)}{/if}
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
</div>

<style>
	.page {
		--bg: #faf8f4;
		--card: #ffffff;
		--border: #e8e4dc;
		--head: #f5f2ec;
		--text: #1f2a2e;
		--muted: #6f7a7e;
		--green-bg: #d9f2e3;
		--green: #1f7a4a;
		--amber-bg: #fbecc2;
		--amber: #8a5a0b;
		--red-bg: #fbdde0;
		--red: #b3263a;
		--none-bg: #f0ede7;
		--blue-bg: #d6e9fb;
		--blue: #1d4f7a;

		min-height: 100vh;
		background: var(--bg);
		color: var(--text);
		font-family: 'Nunito', system-ui, sans-serif;
	}

	main {
		max-width: 1280px;
		margin: 0 auto;
		padding: 2.5rem 1.25rem 4rem;
	}

	h1,
	h2 {
		font-family: 'Fraunces', Georgia, serif;
		font-weight: 700;
		letter-spacing: -0.01em;
		margin: 0;
	}
	h1 { font-size: 2.6rem; line-height: 1.1; }
	h2 { font-size: 1.5rem; margin: 2.75rem 0 0.9rem; }
	h2 small {
		font-family: 'Nunito', system-ui, sans-serif;
		font-size: 0.95rem;
		font-weight: 400;
		color: var(--muted);
		margin-left: 0.4rem;
	}

	.sub { color: var(--muted); font-size: 1.05rem; margin: 0.5rem 0 1.4rem; }
	.sub strong { color: var(--text); font-weight: 700; }

	nav { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
	nav span { color: var(--muted); margin-right: 0.25rem; }
	nav a {
		padding: 0.4rem 0.95rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--card);
		color: var(--text);
		text-decoration: none;
		transition: border-color 0.15s;
	}
	nav a:hover { border-color: #cfc8bb; }
	nav a.active { background: var(--blue-bg); border-color: var(--blue-bg); color: var(--blue); font-weight: 600; }

	.card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow-x: auto;
	}

	table { border-collapse: collapse; width: 100%; font-size: 0.98rem; }
	th,
	td { padding: 0.8rem 0.9rem; white-space: nowrap; }
	th {
		background: var(--head);
		border-bottom: 1px solid var(--border);
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: left;
		vertical-align: middle;
	}
	th small {
		display: block;
		font-size: 0.78rem;
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
	}
	tbody tr + tr td { border-top: 1px solid var(--border); }
	tbody tr:hover td { background: #fcfbf8; }

	.c { text-align: center; }
	.r { text-align: right; }
	.label { font-weight: 600; }
	.muted { color: var(--muted); font-variant-numeric: tabular-nums; }

	.delay { color: var(--green); font-weight: 600; font-variant-numeric: tabular-nums; }
	.delay.up { color: var(--red); }

	.pill {
		display: inline-block;
		min-width: 3rem;
		padding: 0.2rem 0.6rem;
		border-radius: 4px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}
	.pill.best { background: var(--green-bg); color: var(--green); }
	.pill.mid { background: var(--amber-bg); color: var(--amber); }
	.pill.worst { background: var(--red-bg); color: var(--red); }
	.pill.none { background: var(--none-bg); color: var(--muted); font-weight: 400; }
	.pill.error { background: var(--red-bg); color: var(--red); cursor: help; }

	.pair { white-space: nowrap; }
	.pair .pill { min-width: 2.4rem; padding: 0.2rem 0.45rem; }
	.slash { color: #c9c2b5; margin: 0 0.2rem; }

	.empty {
		margin-top: 2rem;
		padding: 1.25rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
</style>
