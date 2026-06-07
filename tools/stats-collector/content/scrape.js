// Injected into CWS dev-console tabs via scripting.executeScript (files array).
// lib/selectors.js and lib/normalize.js are injected first in the same call,
// so SEL and all normalize* functions are available as globals here.
//
// The IIFE at the bottom is the return value of executeScript.

(function scrapeCurrentPage() {
  const path = location.pathname;
  const doc = document;

  // Listing page: /devconsole/{publisherId}  (no item segment)
  if (/\/devconsole\/[^/]+\/?$/.test(path)) {
    return { page: 'listing', items: parseListingRows(doc) };
  }

  // analytics/installs — totals + all 6 breakdowns (installs×3, uninstalls×3)
  if (path.endsWith('/analytics/installs')) {
    const totals = parsePeriodTotals(doc);
    const bd     = parseAllBreakdowns(doc);
    const dr     = parseDateRange(doc);
    const inst   = pickSection(bd, 0);
    const uninst = pickSection(bd, 1);
    return {
      page: 'installs',
      period_start:           dr?.period_start   ?? null,
      period_end:             dr?.period_end     ?? null,
      installs:               totals[0]          ?? null,
      uninstalls:             totals[1]          ?? null,
      installs_by_country:    inst.country,
      installs_by_language:   inst.language,
      installs_by_os:         inst.os,
      uninstalls_by_country:  uninst.country,
      uninstalls_by_language: uninst.language,
      uninstalls_by_os:       uninst.os,
    };
  }

  // analytics/users — user breakdowns + active version list
  if (path.endsWith('/analytics/users')) {
    const bd    = parseAllBreakdowns(doc);
    const users = pickSection(bd, 0);
    return {
      page: 'users',
      users_by_country:  users.country,
      users_by_language: users.language,
      users_by_os:       users.os,
      active_versions:   parseActiveVersions(doc),
    };
  }

  // analytics/impressions — single total
  if (path.endsWith('/analytics/impressions')) {
    const totals = parsePeriodTotals(doc);
    const dr = parseDateRange(doc);
    return {
      page: 'impressions',
      period_start: dr?.period_start ?? null,
      period_end:   dr?.period_end   ?? null,
      impressions:  totals[0]        ?? null,
    };
  }

  return { page: 'unknown', path };
})();
