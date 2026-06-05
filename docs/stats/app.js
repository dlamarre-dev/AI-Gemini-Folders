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

function renderBarChart(title, data, colorClass) {
  if (!data) return null;
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;

  const rows = entries.map(([label, pct]) =>
    el('div', { class: 'bar-row' },
      el('span', { class: 'bar-label', title: label }, label),
      el('div', { class: 'bar-track' },
        el('div', { class: `bar-fill${colorClass ? ' ' + colorClass : ''}`,
                    style: { width: `${(pct / max) * 100}%` } })
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

function renderTimeSeries(container, history) {
  if (!history.length) return;

  const timestamps = history.map(e => new Date(e.collected_at).getTime() / 1000);
  const installs   = history.map(e => e.installs);
  const uninstalls = history.map(e => e.uninstalls);
  const users      = history.map(e => e.weekly_users);

  const opts = {
    width: container.clientWidth || 600,
    height: 180,
    series: [
      {},
      { label: 'Installs',   stroke: '#1a73e8', width: 2 },
      { label: 'Uninstalls', stroke: '#d93025', width: 2 },
      { label: 'Weekly users', stroke: '#188038', width: 2 },
    ],
    axes: [
      { space: 60 },
      { size: 50 },
    ],
    legend: { show: true },
  };

  new uPlot(opts, [timestamps, installs, uninstalls, users], container);
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
        el('span', { class: 'kpi-lbl' }, 'Impressions')
      ) : null
    )
  );

  // Time-series chart
  const chartWrap = el('div', { class: 'chart-wrap' });
  section.appendChild(el('div', { class: 'section-title' }, 'Trend'));
  section.appendChild(chartWrap);
  setTimeout(() => renderTimeSeries(chartWrap, history), 0);

  // Breakdown bar charts
  const bdRow = el('div', { class: 'breakdowns' });
  const bds = [
    renderBarChart('Installs by country',  latest.installs_by_country,  ''),
    renderBarChart('Installs by OS',       latest.installs_by_os,       ''),
    renderBarChart('Installs by language', latest.installs_by_language, 'accent'),
    renderBarChart('Users by country',     latest.users_by_country,     ''),
    renderBarChart('Users by OS',          latest.users_by_os,          ''),
    renderBarChart('Users by language',    latest.users_by_language,    'accent'),
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

  return section;
}

// ── GA4 section ───────────────────────────────────────────────────────────────

function countsToPercents(obj) {
  if (!obj) return null;
  const entries = Object.entries(obj);
  if (!entries.length) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;
  const result = {};
  for (const [k, v] of entries) result[k] = Math.round((v / total) * 100);
  return result;
}

function renderGa4(ga4db) {
  if (!ga4db?.history?.length) return null;

  const history = ga4db.history.slice().sort((a, b) =>
    a.period_start < b.period_start ? -1 : 1);
  const latest = history[history.length - 1];
  const period = latest.period_start
    ? `${fmtDate(latest.period_start)} – ${fmtDate(latest.period_end)}`
    : `collected ${fmtDate(latest.collected_at)}`;

  const section = el('div', { class: 'item-section' },
    el('div', { class: 'item-header' },
      el('h2', { class: 'item-name' }, 'GA4 Analytics'),
      el('span', { class: 'item-period' }, period)
    ),
    el('div', { class: 'kpi-row' },
      el('div', { class: 'kpi' },
        el('span', { class: 'kpi-val green' }, fmt(latest.active_users)),
        el('span', { class: 'kpi-lbl' }, 'Active users')
      )
    )
  );

  if (history.length >= 1) {
    const chartWrap = el('div', { class: 'chart-wrap' });
    section.appendChild(el('div', { class: 'section-title' }, 'Trend'));
    section.appendChild(chartWrap);
    setTimeout(() => {
      const timestamps = history.map(e => new Date(e.period_end).getTime() / 1000);
      const users = history.map(e => e.active_users);
      const opts = {
        width: chartWrap.clientWidth || 600,
        height: 140,
        series: [
          {},
          { label: 'Active users', stroke: '#188038', width: 2 },
        ],
        axes: [{ space: 60 }, { size: 50 }],
        legend: { show: true },
      };
      new uPlot(opts, [timestamps, users], chartWrap);
    }, 0);
  }

  const bdRow = el('div', { class: 'breakdowns' });
  const bds = [
    renderBarChart('Users by country',        countsToPercents(latest.users_by_country),      ''),
    renderBarChart('Acquisition (src/medium)', countsToPercents(latest.users_by_source_medium), 'accent'),
  ].filter(Boolean);
  if (bds.length) {
    bds.forEach(b => bdRow.appendChild(b));
    section.appendChild(el('div', { class: 'section-title' }, 'Breakdowns'));
    section.appendChild(bdRow);
  }

  return section;
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  const loadEl = document.getElementById('loading');
  const appEl  = document.getElementById('app');
  const footer = document.getElementById('footer');

  try {
    const resp = await fetch('../data/cws.json');
    if (!resp.ok) throw new Error(`Failed to load data (${resp.status})`);
    const db = await resp.json();

    let ga4db = null;
    try {
      const g4r = await fetch('../data/ga4.json');
      if (g4r.ok) ga4db = await g4r.json();
    } catch (_) {}

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

    const ga4section = renderGa4(ga4db);
    if (ga4section) appEl.appendChild(ga4section);

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
