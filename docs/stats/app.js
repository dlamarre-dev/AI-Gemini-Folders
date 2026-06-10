// Stats dashboard — reads ../data/cws.json and renders KPI cards + charts.

const ITEM_NAMES = {
  'jffchdehoapigpmifkmleglfimjiilik': 'Gemini Folders',
  'kjmgfajofolnfeaahchpmkpecfimcppf': 'AI Folders',
};

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtDate(iso) {
  if (!iso) return '?';
  const [y, m, d] = iso.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else e[k] = v;
  }
  for (const c of children) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

// ── bar chart (plain HTML) ────────────────────────────────────────────────────

function renderBarChart(title, data) {
  if (!data) return null;
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);

  const rows = entries.map(([label, pct]) =>
    el('div', { class: 'bar-row' },
      el('span', { class: 'bar-label', title: label }, label),
      el('div', { class: 'bar-track' },
        el('div', { class: 'bar-fill', style: { width: `${pct}%` } })
      ),
      el('span', { class: 'bar-pct' }, pct + '%')
    )
  );

  return el('div', { class: 'breakdown' },
    el('div', { class: 'section-title' }, title),
    ...rows
  );
}

// ── time-series chart (uPlot) ─────────────────────────────────────────────────

// Renders one uPlot chart for the given series keys into container.
// seriesDef: [{key, label, stroke}]
function renderTimeSeries(container, data, seriesDef) {
  if (!data.length) return;

  // Works with both daily rows {date, …} and history entries {period_start, collected_at, …}
  const timestamps = data.map(e => new Date(e.date ?? e.period_start ?? e.collected_at).getTime() / 1000);

  const series     = [{}];
  const seriesData = [timestamps];
  for (const { key, label, stroke } of seriesDef) {
    const vals = data.map(e => e[key] ?? null);
    if (!vals.some(v => v !== null)) continue;
    series.push({ label, stroke, width: 2 });
    seriesData.push(vals);
  }
  if (series.length < 2) return; // nothing to plot

  new uPlot({
    width: container.clientWidth || 600,
    height: 160,
    series,
    axes: [{ space: 60 }, { size: 50 }],
    legend: { show: true },
  }, seriesData, container);
}

// ── item section ──────────────────────────────────────────────────────────────

function renderItem(itemId, itemData) {
  const history = (itemData.history ?? []).slice().sort((a, b) =>
    a.collected_at < b.collected_at ? -1 : 1);
  const latest = history[history.length - 1];
  if (!latest) return null;

  const name = ITEM_NAMES[itemId] ?? itemId;
  const period = latest.period_start
    ? `${fmtDate(latest.period_start)} – ${fmtDate(latest.period_end)}`
    : `collected ${fmtDate(latest.collected_at)}`;

  const section = el('div', { class: 'item-section' },
    el('div', { class: 'item-header' },
      el('h2', { class: 'item-name' }, name),
      el('span', { class: 'item-period' }, period)
    ),
    el('div', { class: 'kpi-row' },
      el('div', { class: 'kpi' },
        el('span', { class: 'kpi-val green' }, fmt(latest.weekly_users)),
        el('span', { class: 'kpi-lbl' }, 'Weekly users')
      ),
      el('div', { class: 'kpi' },
        el('span', { class: 'kpi-val blue' }, fmt(latest.installs)),
        el('span', { class: 'kpi-lbl' }, 'Installs')
      ),
      el('div', { class: 'kpi' },
        el('span', { class: 'kpi-val red' }, fmt(latest.uninstalls)),
        el('span', { class: 'kpi-lbl' }, 'Uninstalls')
      ),
      latest.impressions != null ? el('div', { class: 'kpi' },
        el('span', { class: 'kpi-val' }, fmt(latest.impressions)),
        el('span', { class: 'kpi-lbl' }, 'Page views')
      ) : null
    )
  );

  // Time-series charts — prefer daily CSV data when available, fall back to history
  const daily = (itemData.daily ?? []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const chartData = daily.length >= 2 ? daily : history;

  const charts = [
    { label: 'Weekly users',        series: [{ key: 'weekly_users', label: 'Weekly users', stroke: '#188038' }] },
    { label: 'Installs & Uninstalls', series: [
      { key: 'installs',   label: 'Installs',   stroke: '#1a73e8' },
      { key: 'uninstalls', label: 'Uninstalls', stroke: '#d93025' },
    ]},
    { label: 'Impressions',         series: [{ key: 'impressions', label: 'Impressions', stroke: '#e37400' }] },
  ];

  // Breakdown bar charts
  const bdRow = el('div', { class: 'breakdowns' });
  const bds = [
    renderBarChart('Installs by country',  latest.installs_by_country),
    renderBarChart('Installs by OS',       latest.installs_by_os),
    renderBarChart('Installs by language', latest.installs_by_language),
    renderBarChart('Users by country',     latest.users_by_country),
    renderBarChart('Users by OS',          latest.users_by_os),
    renderBarChart('Users by language',    latest.users_by_language),
  ].filter(Boolean);

  if (bds.length) {
    bds.forEach(b => bdRow.appendChild(b));
    section.appendChild(el('div', { class: 'section-title' }, 'Breakdowns'));
    section.appendChild(bdRow);
  }

  // Active versions
  if (latest.active_versions?.length) {
    section.appendChild(el('div', { class: 'section-title', style: { marginTop: '18px' } }, 'Active versions'));
    section.appendChild(el('p', { style: { margin: 0, fontSize: '12px', color: '#5f6368' } },
      latest.active_versions.join(' · ')));
  }

  // Time-series charts — after breakdowns
  section.appendChild(el('div', { class: 'section-title', style: { marginTop: '18px' } }, 'Trend'));
  for (const { label, series } of charts) {
    const wrap = el('div', { class: 'chart-wrap' });
    wrap.appendChild(el('div', { class: 'chart-note', style: { marginBottom: '4px', fontStyle: 'normal', color: '#5f6368' } }, label));
    section.appendChild(wrap);
    const s = series;
    setTimeout(() => renderTimeSeries(wrap, chartData, s), 0);
  }

  return section;
}


// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  const loadEl = document.getElementById('loading');
  const appEl  = document.getElementById('app');
  const footer = document.getElementById('footer');

  try {
    const resp = await fetch('../data/cws.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`Failed to load data (${resp.status})`);
    const db = await resp.json();

    loadEl.style.display = 'none';

    const items = Object.entries(db.items ?? {});
    if (items.length === 0) {
      appEl.appendChild(el('p', { class: 'chart-note', style: { textAlign: 'center', marginTop: '40px' } },
        'No data yet — run the stats collector to populate this dashboard.'));
      return;
    }

    for (const [itemId, itemData] of items) {
      const section = renderItem(itemId, itemData);
      if (section) appEl.appendChild(section);
    }

    // Footer: last collected date
    const allDates = items.flatMap(([, d]) => (d.history ?? []).map(e => e.collected_at));
    const lastDate = allDates.sort().pop();
    if (lastDate) {
      footer.style.display = 'block';
      footer.textContent = `Last updated: ${fmtDate(lastDate)}`;
    }
  } catch (e) {
    loadEl.style.display = 'none';
    appEl.appendChild(el('p', { class: 'err' }, e.message));
  }
})();
