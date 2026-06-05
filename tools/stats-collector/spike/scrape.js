// scrape.js — CWS stats spike v5 (throwaway)
//
// Focus: extract the time-series bar values and the aggregate totals.
// Approach: read <rect> geometry inside each chart SVG and derive values
// from the Y-axis scale. Also scan for numeric summary text near section titles.
// (fetch/wrappedJSObject hooks removed — they cause Permission Denied in FF MV3.)

(function spike() {
  const TAG = '[CWS-SPIKE]';
  const log = (...a) => console.log(TAG, ...a);

  log('v5 loaded; dump in 3 s...');

  function dump() {
    log('=== DUMP v5 === URL:', location.href);

    // --- 1. For each meaningful SVG (has text), read <rect> elements ---
    // Goal: recover per-bar values for time-series charts (SVG[16], SVG[26])
    // and horizontal bars for breakdowns.
    const svgs = Array.from(document.querySelectorAll('svg'));
    svgs.forEach((svg, si) => {
      const texts = Array.from(svg.querySelectorAll('text, title'))
        .map(el => el.textContent.trim()).filter(Boolean);
      if (texts.length < 5) return; // skip icon/decoration SVGs

      // Y-axis: find numbers in the text list, take the max as the axis max.
      const numericTexts = texts.filter(t => /^[\d,.]+$/.test(t.replace(/\s/,'')));
      const yMax = Math.max(...numericTexts.map(t => parseFloat(t.replace(',', '.')) || 0));

      // Rects — read all, then filter to the chart data bars (taller/wider group).
      const rects = Array.from(svg.querySelectorAll('rect'));
      const rectData = rects.map(r => ({
        x: parseFloat(r.getAttribute('x') || r.getAttribute('cx') || 0),
        y: parseFloat(r.getAttribute('y') || 0),
        w: parseFloat(r.getAttribute('width') || 0),
        h: parseFloat(r.getAttribute('height') || 0),
        fill: r.getAttribute('fill') || r.style.fill || '',
      })).filter(r => r.w > 1 && r.h > 1); // drop hairlines/borders

      // SVG viewBox or height to get the chart coordinate space.
      const vb = svg.getAttribute('viewBox');
      const svgH = vb ? parseFloat(vb.split(' ')[3]) : svg.getBoundingClientRect().height;

      log(`SVG[${si}] texts=${JSON.stringify(texts)} yMax=${yMax} svgH=${svgH}`);
      log(`SVG[${si}] rects (${rectData.length}): ${JSON.stringify(rectData)}`);
    });

    // --- 2. Find aggregate total numbers displayed on the page ---
    // The "total installs" summary is likely shown in a chip/hero element near
    // the chart titles. Scan all text nodes for large integers.
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      { acceptNode: n => n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
    );
    const numericNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      // Look for standalone large numbers (totals are typically >= 2 digits)
      if (/^\d[\d\s,. ]*$/.test(t) && parseFloat(t.replace(/[\s,.]/g,'')) >= 10) {
        const parent = node.parentElement;
        numericNodes.push({
          value: t,
          tag: parent ? parent.tagName : '?',
          class: parent ? parent.className.toString().slice(0, 60) : '',
          ariaLabel: parent ? (parent.getAttribute('aria-label') || '') : '',
        });
      }
    }
    log('Numeric text nodes (all):', JSON.stringify(numericNodes));

    // --- 3. Tables (full innerHTML for cells that show empty textContent) ---
    const tables = document.querySelectorAll('table');
    tables.forEach((tbl, ti) => {
      const rows = Array.from(tbl.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => ({
          text: td.textContent.trim(),
          html: td.innerHTML.slice(0, 200),
          aria: td.getAttribute('aria-label') || '',
        }))
      );
      log(`Table[${ti}] rows (html): ${JSON.stringify(rows)}`);
    });

    log('=== END DUMP v5 ===');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(dump, 3000));
  } else {
    setTimeout(dump, 3000);
  }

  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      log('SPA nav →', lastHref);
      setTimeout(dump, 3000);
    }
  }).observe(document.body, { childList: true, subtree: true });
  log('SPA nav observer ready.');
})();
