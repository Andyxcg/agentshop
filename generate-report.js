// generate-report.js — free public data -> analytical report, in three delivery formats.
//
// One analysis layer, three renderers. analyzeReport() is the only place that computes anything;
// the HTML, the JSON payload and the CSV export are all projections of the same object, so a buyer
// reading the HTML and an agent parsing the JSON can never see different numbers.
//
// Sources: World Bank Open Data (CC BY 4.0, commercially usable, attribution required).
// CLI: node generate-report.js [reportId] [out.html]
import { writeFileSync } from 'node:fs';
import { CATALOG } from './catalog.js';
import { BRAND_TOKEN } from './brand.js';
import {
  fetchReportData, COUNTRY_NAMES, INDICATORS, INDICATOR_KIND, INDICATOR_POLARITY, INDICATOR_SPARSE,
  INDICATOR_IS_RATE,
} from './datasources.js';

export const SCHEMA_VERSION = '2026-09-21';

// ---------------------------------------------------------------- numeric discipline

// Every number that leaves this module passes through here. A non-finite value becomes null rather
// than NaN: JSON has no NaN, and a downstream agent parsing "NaN" would either crash or, worse,
// silently treat it as a number.
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function round(v, digits = 4) {
  const n = num(v);
  if (n == null) return null;
  return Number(n.toFixed(digits));
}

function mean(xs) {
  const clean = xs.filter((x) => num(x) != null);
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
}

function median(xs) {
  const clean = xs.filter((x) => num(x) != null).slice().sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function stdev(xs) {
  const clean = xs.filter((x) => num(x) != null);
  if (clean.length < 2) return null;
  const m = mean(clean);
  return Math.sqrt(clean.reduce((a, b) => a + (b - m) ** 2, 0) / (clean.length - 1));
}

function pearson(pairs) {
  const clean = pairs.filter(([a, b]) => num(a) != null && num(b) != null);
  if (clean.length < 4) return { r: null, n: clean.length };
  const xs = clean.map((p) => p[0]);
  const ys = clean.map((p) => p[1]);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < clean.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { r: null, n: clean.length };
  return { r: sxy / Math.sqrt(sxx * syy), n: clean.length };
}

// ---------------------------------------------------------------- per-series statistics

function yoySeries(series) {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].value;
    if (prev === 0) continue;
    out.push({ year: series[i].year, pct: ((series[i].value - prev) / Math.abs(prev)) * 100 });
  }
  return out;
}

// Ordinary least squares on year -> value. A fitted slope is far more honest than an endpoint CAGR:
// it uses every observation, and the R² says out loud how much of the movement the straight line
// actually explains. A CAGR over two noisy endpoints can be dominated by the choice of endpoints.
function linearFit(series) {
  const n = series.length;
  if (n < 3) return { slope: null, r2: null };
  const xs = series.map((d) => d.year);
  const ys = series.map((d) => d.value);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return { slope: null, r2: null };
  return { slope: sxy / sxx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

function seriesStats(series, { yearCount, newestYearInGroup } = {}) {
  if (!series || !series.length) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const span = last.year - first.year;
  const cagr =
    span > 0 && first.value > 0 && last.value > 0
      ? (Math.pow(last.value / first.value, 1 / span) - 1) * 100
      : null;
  const yoys = yoySeries(series);
  const yoyVals = yoys.map((y) => y.pct);
  const peak = series.reduce((a, b) => (b.value > a.value ? b : a));
  const trough = series.reduce((a, b) => (b.value < a.value ? b : a));

  const fit = linearFit(series);
  const levelMean = mean(series.map((d) => d.value));
  // Two representations of the same fitted slope. The percentage form is comparable across
  // economies of wildly different size; the raw form is the right unit for a rate indicator,
  // where the underlying unit already is a percentage, so the slope is percentage points per year.
  const trendSlopePct = fit.slope != null && levelMean ? (fit.slope / Math.abs(levelMean)) * 100 : null;
  const trendSlopePp = fit.slope;

  const yoyMean = mean(yoyVals);
  const yoySd = stdev(yoyVals);

  // Momentum: the most recent three years against the three before them. Answers "is the rate of
  // change itself accelerating?" — which a period-average growth figure hides completely.
  let momentum = null;
  if (yoyVals.length >= 6) {
    momentum = mean(yoyVals.slice(-3)) - mean(yoyVals.slice(-6, -3));
  }

  // Structural shift: first half of the window versus the second half of the YoY sequence.
  let halfShift = null;
  if (yoyVals.length >= 6) {
    const half = Math.floor(yoyVals.length / 2);
    halfShift = mean(yoyVals.slice(half)) - mean(yoyVals.slice(0, half));
  }

  // Outlier years: a change more than 2.5 standard deviations from this economy's own average
  // change. Flagged rather than smoothed — a single suppressed year is often the real story.
  const outliers = yoySd && yoySd > 0
    ? yoys
      .map((y) => ({ year: y.year, pct: round(y.pct, 2), z: round((y.pct - yoyMean) / yoySd, 2) }))
      .filter((y) => Math.abs(y.z) >= 2.5)
    : [];

  // Coverage against what was asked for: an explicit statement of what the buyer is not getting.
  const presentYears = series.map((d) => d.year);
  const missingYears = [];
  if (yearCount && first.year != null) {
    const lo = Math.min(first.year, newestYearInGroup ?? first.year);
    const hi = Math.max(last.year, newestYearInGroup ?? last.year);
    for (let y = lo; y <= hi; y++) if (!presentYears.includes(y)) missingYears.push(y);
  }

  return {
    points: series.length,
    firstYear: first.year,
    firstValue: round(first.value),
    lastYear: last.year,
    lastValue: round(last.value),
    meanLevel: round(levelMean),
    cagr: round(cagr, 2),
    latestYoy: yoys.length ? round(yoyVals[yoyVals.length - 1], 2) : null,
    avgYoy: round(yoyMean, 2),
    volatility: round(yoySd, 2),
    trendSlope: round(fit.slope),
    trendSlopePct: round(trendSlopePct, 2),
    trendSlopePp: round(trendSlopePp, 3),
    trendR2: round(fit.r2, 3),
    momentumPp: round(momentum, 2),
    halfPeriodShiftPp: round(halfShift, 2),
    outlierYears: outliers,
    peak: { year: peak.year, value: round(peak.value) },
    trough: { year: trough.year, value: round(trough.value) },
    min: round(trough.value),
    max: round(peak.value),
    range: round(peak.value - trough.value),
    dataQuality: {
      published: series.length,
      expected: yearCount ?? null,
      coveragePct: yearCount ? round((series.length / yearCount) * 100, 1) : null,
      missingYears,
      latestLagYears: newestYearInGroup != null ? newestYearInGroup - last.year : null,
    },
  };
}

// ---------------------------------------------------------------- per-indicator analysis

function analyzeIndicator(indicator, seriesMap, { years, yearCount } = {}) {
  const rows = [];
  for (const [code, series] of Object.entries(seriesMap || {})) {
    const newestYearInGroup = Math.max(
      0,
      ...Object.values(seriesMap || {}).map((s) => (s && s.length ? s[s.length - 1].year : 0)),
    );
    const s = seriesStats(series, { yearCount, newestYearInGroup });
    if (!s) continue;
    rows.push({ code, name: COUNTRY_NAMES[code] || code, ...s, series });
  }
  rows.sort((a, b) => b.lastValue - a.lastValue);

  const kind = INDICATOR_KIND[indicator] || 'pct';
  const groupTotal = rows.reduce((a, r) => a + r.lastValue, 0);
  // A share column needs two independent conditions: the indicator has to be an additive quantity
  // (money or headcount — a percentage of a percentage is meaningless), and the group total has to
  // be positive (a set of net-debtor balances sums to a negative number). Both are stated in the
  // report rather than silently producing a column of nonsense.
  const groupTotalPositive = rows.length > 0 && groupTotal > 0 && rows.every((r) => r.lastValue >= 0);
  const showShare = (kind === 'usd' || kind === 'count') && groupTotalPositive;

  const latestValues = rows.map((r) => r.lastValue);
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.share = showShare ? round((r.lastValue / groupTotal) * 100, 2) : null;
    // Percentile within the covered group: 100 means the highest value in this report.
    r.percentile = rows.length > 1
      ? round((rows.filter((o) => o.lastValue <= r.lastValue).length / rows.length) * 100, 0)
      : 100;
  });

  const hhi = showShare ? rows.reduce((a, r) => a + (r.lastValue / groupTotal) ** 2, 0) : null;
  const cagrs = rows.map((r) => r.cagr);
  const signed = rows.some((r) => r.firstValue <= 0 || r.lastValue <= 0);
  const isRate = Boolean(INDICATOR_IS_RATE[indicator]);

  for (const r of rows) {
    // A growth index, like a CAGR, needs a positive level and a level to grow from. For a rate
    // indicator it is suppressed outright rather than computed and caveated: the number would look
    // authoritative and mean nothing.
    if (isRate) r.cagr = null;
    r.growthIndex = isRate || signed || !r.firstValue ? null : round((r.lastValue / r.firstValue) * 100, 1);
  }

  const groupMean = mean(latestValues);
  const groupMedian = median(latestValues);
  const positive = latestValues.filter((v) => v > 0);

  return {
    code: indicator,
    label: INDICATORS[indicator] || indicator,
    kind,
    isRate,
    polarity: INDICATOR_POLARITY[indicator] || 'neutral',
    inverse: INDICATOR_POLARITY[indicator] === 'inverse',
    sparseNote: INDICATOR_SPARSE[indicator] || null,
    economies: rows.length,
    latestYear: rows.length ? Math.max(...rows.map((r) => r.lastYear)) : null,
    signed: signed || isRate,
    shareMeaningful: showShare,
    groupTotalPositive,
    rows,
    group: {
      total: round(groupTotal),
      mean: round(groupMean),
      median: round(groupMedian),
      // For rate indicators the mean *level* is the headline number (average inflation over the
      // period); for level indicators the mean growth rate is. Both are reported.
      meanLevel: round(mean(rows.map((r) => r.meanLevel))),
      cagr: isRate ? null : round(mean(cagrs), 2),
      // Dispersion of the cross-section, in percentage points of the group mean.
      dispersionPct: groupMean ? round((stdev(latestValues) / Math.abs(groupMean)) * 100, 1) : null,
      // Ratio of the largest to the smallest positive value: a plain "how unequal is this" measure
      // that survives being read by someone who does not know what a standard deviation is.
      spreadRatio: positive.length > 1 ? round(Math.max(...positive) / Math.min(...positive), 1) : null,
      hhi: round(hhi, 4),
      effectiveCount: hhi ? round(1 / hhi, 2) : null,
      concentration: hhi == null ? null : hhi > 0.25 ? 'high' : hhi > 0.15 ? 'moderate' : 'low',
      leader: rows.length ? { code: rows[0].code, name: rows[0].name, value: rows[0].lastValue } : null,
      laggard: rows.length ? { code: rows[rows.length - 1].code, name: rows[rows.length - 1].name, value: rows[rows.length - 1].lastValue } : null,
      fastestGrowth: isRate ? null : (() => {
        const withCagr = rows.filter((r) => r.cagr != null).sort((a, b) => b.cagr - a.cagr);
        return withCagr.length ? { code: withCagr[0].code, name: withCagr[0].name, cagr: withCagr[0].cagr } : null;
      })(),
      slowestGrowth: isRate ? null : (() => {
        const withCagr = rows.filter((r) => r.cagr != null).sort((a, b) => a.cagr - b.cagr);
        return withCagr.length ? { code: withCagr[0].code, name: withCagr[0].name, cagr: withCagr[0].cagr } : null;
      })(),
      // For rate indicators, the level rise or fall in percentage points is the meaningful spread.
      levelSpreadPp: isRate && rows.length > 1
        ? round(Math.max(...latestValues) - Math.min(...latestValues), 2)
        : null,
    },
  };
}

// Pooled correlation between two indicators over their year-over-year changes.
//
// Levels of two growing series correlate at close to 1 for entirely uninteresting reasons, so the
// correlation is computed on changes, pooled across every (economy, year) pair where both series
// have an observation. The result answers questions a buyer actually asks — "do growth and
// unemployment move against each other here?" — and the sample size is reported with it so nobody
// reads a 6-observation coefficient as if it were a law.
function crossCorrelations(analyses) {
  const yoy = {};
  for (const a of analyses) {
    const m = new Map();
    for (const r of a.rows) {
      for (const y of yoySeries(r.series)) m.set(`${r.code}:${y.year}`, y.pct);
    }
    yoy[a.code] = m;
  }
  const out = [];
  for (let i = 0; i < analyses.length; i++) {
    for (let j = i + 1; j < analyses.length; j++) {
      const A = analyses[i];
      const B = analyses[j];
      const pairs = [];
      for (const [key, va] of yoy[A.code]) {
        const vb = yoy[B.code].get(key);
        if (vb != null) pairs.push([va, vb]);
      }
      const { r, n } = pearson(pairs);
      out.push({
        indicatorA: A.code,
        indicatorB: B.code,
        labelA: A.label,
        labelB: B.label,
        r: round(r, 3),
        n,
        direction: r == null ? 'undetermined' : r > 0.3 ? 'positive' : r < -0.3 ? 'negative' : 'weak',
        note: 'Pearson correlation of year-over-year changes, pooled across economies and years. Not a causal claim.',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- report-level analysis

export function analyzeReport(def, data) {
  const yearCount = Number(String(def.years).split(':')[1]) - Number(String(def.years).split(':')[0]) + 1;
  const analyses = def.indicators.map((ind) => analyzeIndicator(ind, data[ind], { years: def.years, yearCount }));

  let observations = 0;
  let cells = 0;
  let latestYear = null;
  for (const a of analyses) {
    cells += a.rows.length * yearCount;
    for (const r of a.rows) {
      observations += r.points;
      latestYear = Math.max(latestYear || 0, r.lastYear);
    }
  }
  const requestedCells = def.indicators.length * def.countries.length * yearCount;
  const coverage = requestedCells ? (observations / requestedCells) * 100 : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    report: {
      id: def.id,
      title: def.title,
      category: def.category,
      tier: def.tier,
      description: def.description,
      keywords: def.keywords || [],
      indicators: def.indicators.map((i) => ({
        code: i,
        label: INDICATORS[i] || i,
        kind: INDICATOR_KIND[i] || 'pct',
        polarity: INDICATOR_POLARITY[i] || 'neutral',
        sparseNote: INDICATOR_SPARSE[i] || null,
      })),
      economies: def.countries.map((c) => ({ code: c, name: COUNTRY_NAMES[c] || c })),
      years: def.years || null,
      yearCount,
    },
    totals: {
      requestedCells,
      publishedObservations: observations,
      coveragePct: round(coverage, 1),
      indicators: def.indicators.length,
      economies: def.countries.length,
      latestYear,
    },
    indicators: analyses,
    crossCorrelations: analyses.length > 1 ? crossCorrelations(analyses) : [],
    attribution: def.sources.map((s) => `${s.name} (${s.license})`).join('; '),
  };
}

export async function buildAnalysis(def, { fredKey } = {}) {
  if (!def || !def.id) throw new Error('buildAnalysis requires a report definition');
  const data = await fetchReportData(def, { fredKey });
  return { analysis: analyzeReport(def, data), raw: data };
}

// ---------------------------------------------------------------- rendering helpers

function fmt(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function pct(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function sparkline(series) {
  if (!series || series.length < 2) return '';
  const w = 90;
  const h = 22;
  const pad = 2;
  const ys = series.map((d) => d.value);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const step = (w - pad * 2) / (series.length - 1);
  const pts = series
    .map((d, i) => `${(pad + i * step).toFixed(1)},${(h - pad - ((d.value - min) / span) * (h - pad * 2)).toFixed(1)}`)
    .join(' ');
  const rising = ys[ys.length - 1] >= ys[0];
  const col = rising ? '#2f7d4f' : '#c0392b';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6"/></svg>`;
}

function growthChartSVG(rows, invert = false) {
  const w = 680;
  const rowH = 34;
  const padL = 132;
  const padR = 130;
  const padT = 14;
  const barMax = w - padL - padR;
  const usable = rows.filter((r) => r.growthIndex != null);
  if (!usable.length) return '';
  const maxIdx = Math.max(...usable.map((r) => r.growthIndex), 100);
  const h = padT * 2 + usable.length * rowH;
  const bars = usable
    .map((r, i) => {
      const y = padT + i * rowH;
      const bw = Math.max(2, (r.growthIndex / maxIdx) * barMax);
      const positive = r.growthIndex >= 100;
      const col = positive === !invert ? '#2f7d4f' : '#c0392b';
      return `
        <text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="13" fill="#333">${esc(r.name)}</text>
        <rect x="${padL}" y="${y + 6}" width="${bw}" height="${rowH - 14}" rx="3" fill="${col}"/>
        <text x="${padL + bw + 6}" y="${y + rowH / 2 + 4}" font-size="12" fill="#555">${r.growthIndex.toFixed(0)} (${r.firstYear}=100)</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function shareChartSVG(rows) {
  const w = 680;
  const barH = 26;
  const gap = 8;
  const padL = 132;
  const padR = 70;
  const barMax = w - padL - padR;
  const h = rows.length * (barH + gap);
  const maxShare = Math.max(...rows.map((r) => r.share || 0), 1);
  const bars = rows
    .map((r, i) => {
      const y = i * (barH + gap);
      const bw = Math.max(2, ((r.share || 0) / maxShare) * barMax);
      return `
        <text x="${padL - 8}" y="${y + barH / 2 + 5}" text-anchor="end" font-size="13" fill="#333">${esc(r.name)}</text>
        <rect x="${padL}" y="${y + 2}" width="${bw}" height="${barH - 6}" rx="3" fill="#1f4e79" opacity="0.85"/>
        <text x="${padL + bw + 6}" y="${y + barH / 2 + 5}" font-size="12" fill="#555">${(r.share || 0).toFixed(1)}%</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function levelChartSVG(rows) {
  const w = 680;
  const rowH = 30;
  const padL = 132;
  const padR = 110;
  const padT = 14;
  const barMax = (w - padL - padR) / 2;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.lastValue)), 1);
  const h = padT * 2 + rows.length * rowH;
  const zero = padL + barMax;
  const bars = rows
    .map((r, i) => {
      const y = padT + i * rowH;
      const len = (Math.abs(r.lastValue) / maxAbs) * barMax;
      const neg = r.lastValue < 0;
      const col = neg ? '#c0392b' : '#2f7d4f';
      const x = neg ? zero - len : zero;
      const tx = neg ? zero - len - 6 : zero + len + 6;
      const anchor = neg ? 'end' : 'start';
      return `
        <text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="13" fill="#333">${esc(r.name)}</text>
        <rect x="${x}" y="${y + 5}" width="${Math.max(1, len)}" height="${rowH - 12}" rx="2" fill="${col}" opacity="0.9"/>
        <text x="${tx}" y="${y + rowH / 2 + 4}" text-anchor="${anchor}" font-size="12" fill="#555">${fmt(r.lastValue)}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg">
    <line x1="${zero}" y1="${padT}" x2="${zero}" y2="${h - padT}" stroke="#bbb" stroke-width="1"/>${bars}</svg>`;
}

function matrixTable(rows) {
  const yearList = [];
  for (const r of rows) for (const d of r.series) if (!yearList.includes(d.year)) yearList.push(d.year);
  yearList.sort((a, b) => a - b);
  const head = `<tr><th>Economy</th>${yearList.map((y) => `<th class="num">${y}</th>`).join('')}</tr>`;
  const body = rows
    .map((r) => {
      const byYear = Object.fromEntries(r.series.map((d) => [d.year, d.value]));
      return `<tr><td>${esc(r.name)}</td>${yearList
        .map((y) => `<td class="num">${byYear[y] != null ? fmt(byYear[y]) : '—'}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  return `<table class="matrix"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ---------------------------------------------------------------- indicator section

function renderIndicatorSection(a) {
  if (!a.rows.length) {
    return `<h2>${esc(a.label)}</h2>
      <div class="summary">No sufficient data was returned for this indicator in the requested range.
      The source publishes it sparsely or with a lag for these economies.
      ${a.sparseNote ? `<br><strong>Coverage note:</strong> ${esc(a.sparseNote)}` : ''}
      The indicator remains requestable through <code>GET /report/custom</code> with other economies or years.</div>`;
  }

  const g = a.group;
  const bits = [];
  if (a.isRate) {
    // A rate indicator is described in the units it is already measured in: percentage points.
    bits.push(`Latest reading is highest in ${g.leader.name} at ${g.leader.value.toFixed(2)}% and lowest in ${g.laggard.name} at ${g.laggard.value.toFixed(2)}%.`);
    bits.push(`Period average is ${g.meanLevel != null ? g.meanLevel.toFixed(2) + '%' : '—'}, with a cross-economy spread of ${g.levelSpreadPp != null ? g.levelSpreadPp.toFixed(2) + ' percentage points' : '—'}.`);
    bits.push('This is a rate of change rather than a level, so compound growth and a growth index are not defined for it; the trend is reported in percentage points per year.');
  } else {
    bits.push(`${g.leader.name} ranks first at ${fmt(g.leader.value)}${a.shareMeaningful ? `, ${a.rows[0].share.toFixed(1)}% of the group total` : ''}.`);
    if (g.fastestGrowth) bits.push(`Fastest compound growth over the period is ${g.fastestGrowth.name} at ${pct(g.fastestGrowth.cagr)} per year; the slowest is ${g.slowestGrowth.name} at ${pct(g.slowestGrowth.cagr)}.`);
  }
  if (a.rows.length > 2) {
    const slopeField = a.isRate ? 'trendSlopePp' : 'trendSlopePct';
    const trendLeaders = a.rows.filter((r) => r[slopeField] != null).sort((x, y) => y[slopeField] - x[slopeField]);
    if (trendLeaders.length) {
      const best = trendLeaders[0];
      const worst = trendLeaders[trendLeaders.length - 1];
      const unit = a.isRate ? 'percentage points per year' : 'per year of its own mean level';
      const asText = (r) => (a.isRate ? `${r.trendSlopePp >= 0 ? '+' : ''}${r.trendSlopePp.toFixed(2)} pp/yr` : pct(r.trendSlopePct));
      bits.push(`Fitted trend is steepest upward in ${best.name} (${asText(best)}, ${unit}, R² ${best.trendR2}) and weakest in ${worst.name} (${asText(worst)}, R² ${worst.trendR2}).`);
    }
    const accelerating = a.rows.filter((r) => r.momentumPp != null).sort((x, y) => y.momentumPp - x.momentumPp)[0];
    if (accelerating) bits.push(`Largest acceleration — last three years against the three before — is ${accelerating.name} at ${pct(accelerating.momentumPp)} percentage points.`);
  }
  if (g.hhi != null && a.rows.length > 2) bits.push(`Concentration is ${g.concentration} (HHI ${g.hhi.toFixed(3)}, equivalent to ${g.effectiveCount.toFixed(1)} evenly sized economies).`);
  if (g.spreadRatio != null) bits.push(`The largest covered value is ${g.spreadRatio}× the smallest.`);
  bits.push(`${a.rows.length} economies covered; latest observation year ${a.latestYear}.`);
  if (!a.groupTotalPositive && (a.kind === 'usd' || a.kind === 'count') && a.rows.length) bits.push('Shares of the group total are omitted because the group total is not positive.');
  if (a.inverse) bits.push('Note: for this indicator a <em>higher</em> value is adverse, so a rising series is not a positive signal.');
  if (a.sparseNote) bits.push(`<strong>Coverage note:</strong> ${esc(a.sparseNote)}`);

  const showShare = a.shareMeaningful;
  const detailRows = a.rows
    .map(
      (r) => `<tr>
        <td class="num">${r.rank}</td>
        <td>${esc(r.name)}</td>
        <td class="num">${fmt(r.lastValue)}</td>
        ${showShare ? `<td class="num">${r.share.toFixed(1)}%</td>` : ''}
        ${a.isRate
          ? `<td class="num">${fmt(r.meanLevel)}</td><td class="num">${r.trendSlopePp != null ? (r.trendSlopePp >= 0 ? '+' : '') + r.trendSlopePp.toFixed(2) : '—'}</td>`
          : `<td class="num">${r.growthIndex != null ? r.growthIndex.toFixed(0) : '—'}</td><td class="num">${r.cagr != null ? pct(r.cagr) : '—'}</td>`}
        <td class="num">${r.percentile}</td>
        <td>${sparkline(r.series)}</td>
      </tr>`,
    )
    .join('');

  const dynamicsRows = a.rows
    .map(
      (r) => `<tr>
        <td>${esc(r.name)}</td>
        <td class="num">${a.isRate ? (r.trendSlopePp != null ? (r.trendSlopePp >= 0 ? '+' : '') + r.trendSlopePp.toFixed(2) : '—') : (r.trendSlopePct != null ? pct(r.trendSlopePct) : '—')}</td>
        <td class="num">${r.trendR2 != null ? r.trendR2.toFixed(2) : '—'}</td>
        <td class="num">${r.momentumPp != null ? pct(r.momentumPp) : '—'}</td>
        <td class="num">${r.halfPeriodShiftPp != null ? pct(r.halfPeriodShiftPp) : '—'}</td>
        <td class="num">${r.volatility != null ? r.volatility.toFixed(1) : '—'}</td>
        <td class="num">${r.latestYoy != null ? pct(r.latestYoy) : '—'}</td>
        <td class="num">${r.peak.year} / ${r.trough.year}</td>
        <td>${r.outlierYears.length ? r.outlierYears.map((o) => `${o.year} (${pct(o.pct, 0)})`).join(', ') : '—'}</td>
      </tr>`,
    )
    .join('');

  const qualityRows = a.rows
    .map(
      (r) => `<tr>
        <td>${esc(r.name)}</td>
        <td class="num">${r.dataQuality.published}</td>
        <td class="num">${r.dataQuality.expected ?? '—'}</td>
        <td class="num">${r.dataQuality.coveragePct != null ? r.dataQuality.coveragePct.toFixed(0) + '%' : '—'}</td>
        <td class="num">${r.firstYear}–${r.lastYear}</td>
        <td class="num">${r.dataQuality.latestLagYears != null ? r.dataQuality.latestLagYears : '—'}</td>
        <td>${r.dataQuality.missingYears.length ? r.dataQuality.missingYears.join(', ') : '—'}</td>
      </tr>`,
    )
    .join('');

  return `
  <h2>${esc(a.label)}</h2>
  <div class="summary">${bits.join(' ')}</div>

  <h3>${a.isRate ? 'Latest reading, by economy' : a.signed ? 'Latest level (zero baseline)' : `Trend index (${a.rows[0].firstYear} = 100)`}</h3>
  <div class="chart">${a.signed ? levelChartSVG(a.rows) : growthChartSVG(a.rows, a.inverse)}</div>

  ${showShare ? `<h3>Share of group total, latest year</h3><div class="chart">${shareChartSVG(a.rows)}</div>` : ''}

  <h3>Ranked detail</h3>
  ${a.isRate
    ? `<div class="muted note">Group average over the period: <strong>${g.meanLevel != null ? g.meanLevel.toFixed(2) + '%' : '—'}</strong>.
       Cross-economy spread of the latest reading: <strong>${g.levelSpreadPp != null ? g.levelSpreadPp.toFixed(2) + ' percentage points' : '—'}</strong>.
       A rate of change has no compound growth rate, so none is reported.</div>`
    : showShare && g.total > 0
      ? `<div class="muted note">Group total (latest year): <strong>${fmt(g.total)}</strong> across ${a.rows.length} economies.
     Group median: <strong>${fmt(g.median)}</strong>. Average period CAGR of the group: <strong>${g.cagr != null ? pct(g.cagr) : '—'}</strong>.
     Cross-sectional dispersion: <strong>${g.dispersionPct != null ? g.dispersionPct.toFixed(1) + '%' : '—'}</strong> of the group mean.</div>`
      : `<div class="muted note">Group mean of the latest reading: <strong>${fmt(g.mean)}</strong>; median: <strong>${fmt(g.median)}</strong>.
       Cross-sectional dispersion: <strong>${g.dispersionPct != null ? g.dispersionPct.toFixed(1) + '%' : '—'}</strong> of the group mean.</div>`}
  <table>
    <thead><tr>
      <th class="num">#</th><th>Economy</th><th class="num">Latest</th>
      ${showShare ? '<th class="num">Share</th>' : ''}
      ${a.isRate
        ? '<th class="num">Period avg</th><th class="num">Trend pp/yr</th>'
        : '<th class="num">Index</th><th class="num">CAGR</th>'}
      <th class="num">Pctile</th><th>Trend</th>
    </tr></thead>
    <tbody>${detailRows}</tbody>
  </table>
  <div class="muted note">${a.isRate
    ? 'Period average is the mean of the annual readings across the covered years. Trend pp/yr is the ordinary-least-squares slope in percentage points per year — the unit this indicator is already measured in. Percentile ranks this economy within the covered group.'
    : `Index = latest value as a percentage of the first year (100 = unchanged; blank for series that cross zero).
    CAGR is compound annual growth. Percentile ranks this economy within the covered group.`}</div>

  <h3>Trend and dynamics</h3>
  <table>
    <thead><tr>
      <th>Economy</th><th class="num">${a.isRate ? 'Trend pp/yr' : 'Trend %/yr'}</th><th class="num">Trend R²</th>
      <th class="num">Momentum</th><th class="num">Half-period shift</th><th class="num">Volatility</th>
      <th class="num">Latest YoY</th><th class="num">Peak / trough yr</th><th>Outlier years</th>
    </tr></thead>
    <tbody>${dynamicsRows}</tbody>
  </table>
  <div class="muted note">Trend is the ordinary-least-squares fit of value on year, reported with its R² — how much of the movement
    the straight line explains${a.isRate ? ', in percentage points per year because this series is already a rate' : ', as a percentage of the period mean level so economies of different size are comparable'}.
    Momentum is the mean change of the last three years minus the mean of the three before it, in percentage points. Half-period shift
    compares the second half of the window against the first. Volatility is the standard deviation of year-over-year change.
    Outlier years exceed 2.5 standard deviations from that economy's own average change.</div>

  <h3>Data quality</h3>
  <table>
    <thead><tr>
      <th>Economy</th><th class="num">Published</th><th class="num">Expected</th><th class="num">Coverage</th>
      <th class="num">Span</th><th class="num">Years behind newest</th><th>Missing years</th>
    </tr></thead>
    <tbody>${qualityRows}</tbody>
  </table>

  <h3>Full year-by-year data</h3>
  ${matrixTable(a.rows)}`;
}

// ---------------------------------------------------------------- HTML report

// ---------------------------------------------------------------- key findings synthesis

// Turns the same numbers the rest of the report shows into a short, specific executive summary.
// No hand-written prose, so it can never drift from the tables. The scope line (methodology) is
// rendered separately by renderHtml. Every branch degrades gracefully when a field is null.
function buildKeyFindings(analysis) {
  const t = analysis.totals || {};
  const inds = analysis.indicators || [];
  const out = [];
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  // 1. Coverage — the single most important caveat for a buyer.
  if (t.coveragePct != null) {
    let s = `Coverage is ${t.coveragePct.toFixed(0)}% of the requested grid (${t.publishedObservations.toLocaleString()} of ${t.requestedCells.toLocaleString()} economy-year cells across ${t.indicators} indicator${t.indicators > 1 ? 's' : ''} × ${t.economies} economies).`;
    if (t.coveragePct < 100) {
      let weakest = null;
      for (const a of inds) {
        if (!a.rows || !a.rows.length) continue;
        const c = avg(a.rows.map((r) => (r.dataQuality && r.dataQuality.coveragePct != null ? r.dataQuality.coveragePct : 100)));
        if (weakest == null || c < weakest.c) weakest = { label: a.label, c };
      }
      if (weakest) s += ` The thinnest indicator is ${weakest.label} at ${weakest.c.toFixed(0)}% published — treat its tail years as estimates.`;
    }
    out.push(s);
  }

  // 2. Most unequal cross-section (largest high-to-low ratio among level/USD/count indicators).
  const spreadable = inds.filter((a) => a.group && a.group.spreadRatio != null && !a.isRate && a.rows.length > 1);
  if (spreadable.length) {
    const top = spreadable.slice().sort((x, y) => y.group.spreadRatio - x.group.spreadRatio)[0];
    out.push(`Widest cross-economy gap: ${top.label} spans ${top.group.spreadRatio}× from ${top.group.leader.name} (${fmt(top.group.leader.value)}) down to ${top.group.laggard.name} (${fmt(top.group.laggard.value)}).`);
  }

  // 3. Strongest growth divergence (fastest vs slowest compounding economy).
  const withGrowth = inds.filter((a) => a.group && a.group.fastestGrowth && a.group.slowestGrowth);
  if (withGrowth.length) {
    const top = withGrowth.slice().sort((x, y) =>
      (y.group.fastestGrowth.cagr - y.group.slowestGrowth.cagr) -
      (x.group.fastestGrowth.cagr - x.group.slowestGrowth.cagr))[0];
    out.push(`Sharpest growth split: in ${top.label}, ${top.group.fastestGrowth.name} compounds ${pct(top.group.fastestGrowth.cagr)}/yr while ${top.group.slowestGrowth.name} grows ${pct(top.group.slowestGrowth.cagr)}/yr.`);
  }

  // 4. Most concentrated indicator (HHI).
  const concentrated = inds.filter((a) => a.group && (a.group.concentration === 'high' || a.group.concentration === 'moderate') && a.rows.length > 2);
  if (concentrated.length) {
    const top = concentrated.slice().sort((x, y) => (y.group.hhi || 0) - (x.group.hhi || 0))[0];
    out.push(`Most concentrated: ${top.label} (HHI ${top.group.hhi.toFixed(3)} — equivalent to roughly ${top.group.effectiveCount.toFixed(1)} evenly sized economies carrying the weight).`);
  }

  // 5. Strongest cross-indicator co-movement (pooled Pearson r, with a real sample).
  const corrs = (analysis.crossCorrelations || []).filter((c) => c.r != null && c.n >= 20 && Math.abs(c.r) >= 0.3);
  if (corrs.length) {
    corrs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const c = corrs[0];
    out.push(`Strongest co-movement: ${c.labelA} and ${c.labelB} move ${c.direction} together (r=${c.r.toFixed(2)}, n=${c.n}).`);
  }

  // 6. Widest rate spread (e.g. inflation dispersion).
  const rates = inds.filter((a) => a.isRate && a.group && a.group.levelSpreadPp != null && a.rows.length > 1);
  if (rates.length) {
    const top = rates.slice().sort((x, y) => y.group.levelSpreadPp - x.group.levelSpreadPp)[0];
    out.push(`Widest rate spread: ${top.label} differs by ${top.group.levelSpreadPp.toFixed(1)} pp across economies (${top.group.leader.name} vs ${top.group.laggard.name}).`);
  }

  return out.length ? out.map((s) => `<li>${esc(s)}</li>`).join('\n') : `<li>No cross-economy divergence detected beyond the scope above.</li>`;
}

export function renderHtml(analysis, { banner = '', price = null } = {}) {
  const r = analysis.report;
  const t = analysis.totals;
  const [y0, y1] = String(r.years || '::').split(':');

  const sections = analysis.indicators.map(renderIndicatorSection).join('\n');

  const glance = analysis.indicators
    .map((a) => {
      if (!a.rows.length) return null;
      const top = a.rows[0];
      const growthCell = a.isRate
        ? `<td class="num">${top.meanLevel != null ? top.meanLevel.toFixed(2) + '%' : '—'}</td>`
        : `<td class="num">${top.cagr != null ? pct(top.cagr) : '—'}</td>`;
      const trendCell = a.isRate
        ? `<td class="num">${top.trendSlopePp != null ? (top.trendSlopePp >= 0 ? '+' : '') + top.trendSlopePp.toFixed(2) + ' pp' : '—'}</td>`
        : `<td class="num">${top.trendSlopePct != null ? pct(top.trendSlopePct) : '—'}</td>`;
      return `<tr><td>${esc(a.label)}</td><td>${esc(top.name)}</td><td class="num">${fmt(top.lastValue)}</td>
        ${growthCell}${trendCell}<td class="num">${a.rows.length}</td><td class="num">${a.latestYear ?? '—'}</td></tr>`;
    })
    .filter(Boolean)
    .join('');

  const corrBlock = analysis.crossCorrelations.length
    ? `<h2>Cross-indicator correlation</h2>
      <table>
        <thead><tr><th>Indicator A</th><th>Indicator B</th><th class="num">r</th><th class="num">n</th><th>Direction</th></tr></thead>
        <tbody>${analysis.crossCorrelations
          .map((c) => `<tr><td>${esc(c.labelA)}</td><td>${esc(c.labelB)}</td>
            <td class="num">${c.r != null ? c.r.toFixed(3) : '—'}</td><td class="num">${c.n}</td><td>${esc(c.direction)}</td></tr>`)
          .join('')}</tbody>
      </table>
      <div class="muted note">Pearson correlation computed on year-over-year changes, pooled across every economy–year pair where both
        series have an observation. Levels would correlate near 1 for any two growing series and would say nothing; changes do not.
        n is the number of pooled pairs, so a coefficient resting on a handful of observations is visibly weak. Correlation is not causation.</div>`
    : '';

  const overview = `This report covers ${t.economies} economies and ${t.indicators} indicator${t.indicators > 1 ? 's' : ''} over ${y0}–${y1},
    containing ${t.publishedObservations} published observations${t.coveragePct != null ? ` (${t.coveragePct.toFixed(0)}% of the ${t.requestedCells} requested year × economy cells)` : ''}.
    Every figure is reproduced from World Bank Open Data and recomputed into growth, share, trend-fit, momentum, volatility,
    concentration and data-quality views. Values are also available as JSON and CSV from the same endpoint.`;

  const attribution = esc(analysis.attribution);
  const keywords = esc((r.keywords || []).join(', '));

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.title)}</title>
<meta name="description" content="${esc(r.description)}">
<meta name="keywords" content="${keywords}">
<style>
  :root{--ink:#1a1a1a;--muted:#666;--line:#e5e5e5;--accent:#1f4e79;}
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);margin:0;background:#fafafa}
  .page{max-width:940px;margin:0 auto;background:#fff;padding:40px 44px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  h1{font-size:24px;margin:0 0 4px;color:var(--accent)}
  .sub{color:var(--muted);font-size:13px;margin-bottom:20px}
  h2{font-size:16px;margin:32px 0 10px;border-left:4px solid var(--accent);padding-left:10px}
  h3{font-size:12.5px;margin:20px 0 6px;color:#444;text-transform:uppercase;letter-spacing:.06em}
  .summary{background:#f4f8fc;border:1px solid #dbe7f3;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.7}
  .summary p{margin:0 0 8px}
  ul.findings{margin:6px 0 0;padding-left:18px}
  ul.findings li{margin:4px 0;line-height:1.55}
  .muted{color:var(--muted);font-size:11.5px}
  .note{margin-top:6px;line-height:1.6}
  table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}
  th,td{border-bottom:1px solid var(--line);padding:7px 6px;text-align:left;vertical-align:middle}
  th{background:#f7f7f7;font-weight:600;color:#444}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  table.matrix{font-size:11.5px}
  table.matrix th,table.matrix td{padding:5px 4px}
  .chart{border:1px solid var(--line);border-radius:8px;padding:14px;margin-top:6px;background:#fff}
  .foot{margin-top:34px;border-top:1px solid var(--line);padding-top:14px;font-size:11px;color:var(--muted);line-height:1.7}
  .tag{display:inline-block;background:#eef3f8;color:#1f4e79;border-radius:4px;padding:2px 8px;font-size:11px;margin-right:6px}
</style></head>
<body><div class="page">
  ${banner}
  <h1>${esc(r.title)}</h1>
  <div class="sub">Generated: ${analysis.generatedAt} &nbsp;|&nbsp; Range: ${y0}–${y1} &nbsp;|&nbsp; Source: ${attribution}${price ? ` &nbsp;|&nbsp; Licence: purchased at ${esc(price)}` : ''}</div>

  <h2>Key findings</h2>
  <div class="summary">
    <p>${overview}</p>
    <ul class="findings">${buildKeyFindings(analysis)}</ul>
  </div>
  <table>
    <thead><tr><th>Indicator</th><th>Rank 1</th><th class="num">Latest value</th><th class="num">CAGR / period avg</th>
      <th class="num">Trend</th><th class="num">Economies</th><th class="num">Latest yr</th></tr></thead>
    <tbody>${glance || '<tr><td colspan="7">No data available.</td></tr>'}</tbody>
  </table>

  ${corrBlock}

  ${sections}

  <div class="foot">
    <span class="tag">Methodology</span>Series are pulled from the official source API and null observations dropped.
    CAGR = (end/start)^(1/years) − 1. Index uses the first year of the range as 100. Trend is an OLS fit of value on year,
    reported as a percentage of the period mean alongside its R². Volatility = standard deviation of year-over-year percentage
    change (percentage points). Momentum compares the last three years against the three before. Share = economy value ÷ sum of
    the covered economies. HHI = sum of squared shares; its reciprocal estimates the number of evenly sized economies.
    Cross-indicator correlation is Pearson's r on pooled year-over-year changes.<br>
    <span class="tag">Coverage</span>Requested: ${t.indicators} indicator(s) × ${t.economies} economies × ${r.yearCount} years =
    ${t.requestedCells} cells; published: ${t.publishedObservations} (${t.coveragePct != null ? t.coveragePct.toFixed(1) : '—'}%).
    Sparse indicators are declared in the Data quality section of each indicator.<br>
    <span class="tag">Formats</span>This document is the HTML delivery. Append <code>?format=json</code> for the full structured
    payload (series plus every derived metric) or <code>?format=csv</code> for the tidy long-format panel.
    The JSON schema is published at <code>/schema/report.json</code>.<br>
    <span class="tag">Licence</span>Data © ${attribution}, attribution required. Generated by an automated pipeline;
    research reference only, not investment advice.<br>
    <span class="tag">Disclaimer</span>Values are reproduced as published by the source; some years may be estimates,
    nowcasts or subsequently revised figures. Correlations are descriptive statistics, not causal claims.
  </div>
</div></body></html>`;
}

// ---------------------------------------------------------------- machine-readable projections

// The paid JSON payload: report metadata, the full analysis, and the raw panel. Field names are
// stable and documented in /schema/report.json — an agent should be able to parse this blind.
export function toJsonPayload(analysis, { includeSeries = true, price = null } = {}) {
  return {
    schemaVersion: analysis.schemaVersion,
    kind: 'report',
    generatedAt: analysis.generatedAt,
    report: analysis.report,
    licence: { attribution: analysis.attribution, terms: 'CC BY 4.0 — attribution required; commercial use permitted.' },
    purchase: price ? { price, protocol: 'x402', asset: 'USDC' } : null,
    totals: analysis.totals,
    indicators: analysis.indicators.map((a) => ({
      code: a.code,
      label: a.label,
      kind: a.kind,
      polarity: a.polarity,
      sparseNote: a.sparseNote,
      economies: a.economies,
      latestYear: a.latestYear,
      group: a.group,
      rows: a.rows.map((r) => {
        const { series, ...rest } = r;
        return includeSeries ? { ...rest, series: series.map((d) => ({ year: d.year, value: d.value })) } : rest;
      }),
    })),
    crossCorrelations: analysis.crossCorrelations,
    notes: {
      derivedFields: 'cagr, growthIndex, trendSlopePct, trendR2, momentumPp, halfPeriodShiftPp, volatility, percentile, share, outlierYears, dataQuality',
      recommendation: 'Cite the source attribution; quote the coverage figures when the indicator is marked sparse.',
    },
  };
}

// Tidy long format: one row per observation. This is the shape every dataframe-loading library
// wants, and it is the format an agent will actually feed into a model without reshaping first.
export function toCsv(analysis, def) {
  const header = [
    'report_id', 'indicator_code', 'indicator_label', 'economy_code', 'economy_name',
    'year', 'value', 'measurement_kind', 'source',
  ].join(',');
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const source = analysis.attribution;
  const lines = [header];
  for (const a of analysis.indicators) {
    for (const r of a.rows) {
      for (const d of r.series) {
        lines.push([
          cell(def.id), cell(a.code), cell(a.label), cell(r.code), cell(r.name),
          d.year, d.value, cell(a.kind), cell(source),
        ].join(','));
      }
    }
  }
  return lines.join('\n') + '\n';
}

// Derived-metrics CSV: one row per economy per indicator, wide on the derived fields. Complements
// the tidy panel for buyers who want the analysis rather than the raw observations.
export function toSummaryCsv(analysis, def) {
  const header = [
    'report_id', 'indicator_code', 'is_rate', 'economy_code', 'economy_name', 'latest_year', 'latest_value',
    'period_mean_level', 'rank', 'percentile', 'share_pct', 'cagr_pct', 'growth_index', 'latest_yoy_pct', 'avg_yoy_pct',
    'volatility_pp', 'trend_slope_pct_per_year', 'trend_slope_pp_per_year', 'trend_r2', 'momentum_pp', 'half_period_shift_pp',
    'peak_year', 'peak_value', 'trough_year', 'trough_value', 'published_points', 'coverage_pct',
    'latest_lag_years', 'outlier_years',
  ].join(',');
  const lines = [header];
  for (const a of analysis.indicators) {
    for (const r of a.rows) {
      lines.push([
        def.id, a.code, a.isRate ? 'true' : 'false', r.code, `"${r.name}"`, r.lastYear, r.lastValue,
        r.meanLevel ?? '', r.rank, r.percentile, r.share ?? '', r.cagr ?? '', r.growthIndex ?? '', r.latestYoy ?? '',
        r.avgYoy ?? '', r.volatility ?? '', r.trendSlopePct ?? '', r.trendSlopePp ?? '', r.trendR2 ?? '',
        r.momentumPp ?? '', r.halfPeriodShiftPp ?? '', r.peak.year, r.peak.value, r.trough.year, r.trough.value,
        r.dataQuality.published, r.dataQuality.coveragePct ?? '', r.dataQuality.latestLagYears ?? '',
        `"${r.outlierYears.map((o) => o.year).join(' ')}"`,
      ].join(','));
    }
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- free preview (conversion surface)

// The preview is deliberately built to answer one question: "is this data any good?" It shows the
// newest year's cross-section for every economy and every indicator, the exact field names and
// types the paid payload uses, and an explicit list of what a purchase adds. It is a working
// sample of the schema, not a subset of the analysis — which is what makes it convert.
export function buildPreview(analysis, base = '') {
  return {
    schemaVersion: analysis.schemaVersion,
    kind: 'preview',
    generatedAt: analysis.generatedAt,
    report: {
      id: analysis.report.id,
      title: analysis.report.title,
      category: analysis.report.category,
      tier: analysis.report.tier,
      years: analysis.report.years,
      indicators: analysis.report.indicators,
      economies: analysis.report.economies,
    },
    latestYear: analysis.totals.latestYear,
    coveragePct: analysis.totals.coveragePct,
    crossSection: analysis.indicators.map((a) => ({
      indicator: a.code,
      indicatorLabel: a.label,
      kind: a.kind,
      polarity: a.polarity,
      sparseNote: a.sparseNote,
      latestYear: a.latestYear,
      group: { mean: a.group.mean ?? null, median: a.group.median ?? null, leader: a.group.leader ?? null, laggard: a.group.laggard ?? null },
      rows: a.rows.map((r) => ({
        economy: r.code,
        economyName: r.name,
        year: r.lastYear,
        value: r.lastValue,
        rank: r.rank,
        percentile: r.percentile,
      })),
    })),
    schema: {
      note: 'The paid payload uses exactly these field names and types, plus the fields listed under paidAdds.',
      crossSectionRow: { economy: 'string', economyName: 'string', year: 'integer', value: 'number', rank: 'integer', percentile: 'number' },
      paidRowFields: {
        series: 'array of {year: integer, value: number} — the full year-by-year panel',
        meanLevel: 'number — mean of the annual readings over the covered years',
        cagr: 'number — compound annual growth over the range, % (null for rate indicators)',
        growthIndex: 'number — last year as a % of the first year (null for rate indicators)',
        latestYoy: 'number — latest year-over-year change, %',
        avgYoy: 'number — mean year-over-year change, %',
        volatility: 'number — standard deviation of year-over-year change, pp',
        trendSlopePct: 'number — OLS slope as a % of the period mean level, per year',
        trendSlopePp: 'number — OLS slope in the series\' own units per year (percentage points for rate indicators)',
        trendR2: 'number — goodness of fit of that trend line',
        momentumPp: 'number — last three years vs the three before, pp',
        halfPeriodShiftPp: 'number — second half vs first half of the window, pp',
        outlierYears: 'array of {year, pct, z} — changes beyond 2.5 standard deviations',
        share: 'number — % of the covered group total (only where the total is positive)',
        dataQuality: '{published, expected, coveragePct, missingYears[], latestLagYears}',
      },
      paidReportFields: {
        crossCorrelations: 'array of {indicatorA, indicatorB, r, n, direction} — pooled Pearson r on year-over-year changes',
        'indicators[].group': 'total, mean, median, cagr, dispersionPct, spreadRatio, hhi, effectiveCount, concentration, leader, laggard, fastestGrowth, slowestGrowth',
      },
    },
    paidAdds: [
      `Full ${analysis.report.years} year-by-year panel for all ${analysis.report.economies.length} economies (the preview shows only the latest year).`,
      'Derived analytics per economy: CAGR, growth index, trend fit with R², momentum, half-period shift, volatility, percentile, outlier years.',
      'Data-quality block per economy: published vs expected observations, coverage %, missing years, publication lag.',
      'Group statistics: total, mean, median, dispersion, largest-to-smallest ratio, HHI concentration.',
      analysis.crossCorrelations.length ? 'Cross-indicator correlation matrix with sample sizes.' : 'Ranked detail tables and charts.',
      'Delivery as JSON (?format=json) or CSV (?format=csv) as well as the HTML report.',
    ],
    purchase: {
      endpoint: `/report/${analysis.report.id}`,
      html: `${base}/report/${analysis.report.id}`,
      json: `${base}/report/${analysis.report.id}?format=json`,
      csv: `${base}/report/${analysis.report.id}?format=csv`,
      protocol: 'x402',
      asset: 'USDC',
      network: 'eip155:8453',
      priceNote: 'A GET without payment returns HTTP 402 with the exact USDC amount and payout address.',
      schemaUrl: `${base}/schema/report.json`,
    },
  };
}

// CSV projection of the free preview: the same latest-year cross-section, in the shape a dataframe
// reader expects. Free, and the fastest way for an agent to check coverage before paying.
export function previewToCsv(preview) {
  const header = 'report_id,indicator_code,indicator_label,economy_code,economy_name,year,value,rank,percentile';
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header];
  for (const block of preview.crossSection) {
    for (const r of block.rows) {
      lines.push([
        preview.report.id, block.indicator, cell(block.indicatorLabel), r.economy, cell(r.economyName),
        r.year, r.value, r.rank, r.percentile,
      ].join(','));
    }
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- bundle assembly

export function buildBundleHtml(entries, { generatedAt = new Date().toISOString(), price = null } = {}) {
  const toc = entries
    .map((e) => `<li><a href="#${esc(e.id)}">${esc(e.title)}</a> <span class="muted">— ${esc(e.category)}</span></li>`)
    .join('');
  const bodies = entries
    .map((e) => {
      const start = e.html.indexOf('<div class="page">');
      const end = e.html.lastIndexOf('</div></body>');
      const inner = start >= 0 && end > start ? e.html.slice(start + '<div class="page">'.length, end) : '';
      return `<section id="${esc(e.id)}" class="bundle-item">${inner}</section>`;
    })
    .join('\n<hr>\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Full Catalog Bundle — ${BRAND_TOKEN}</title>
<meta name="description" content="Every catalog report in a single document: ${entries.length} machine-generated macroeconomic, structural and thematic reports from World Bank Open Data.">
<meta name="keywords" content="macroeconomic dataset, world bank, bundle, cross-country, full catalog, research data">
<style>
  :root{--ink:#1a1a1a;--muted:#666;--line:#e5e5e5;--accent:#1f4e79}
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);margin:0;background:#fafafa}
  .page{max-width:940px;margin:0 auto;background:#fff;padding:40px 44px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  h1{font-size:26px;color:var(--accent);margin:0 0 6px}
  .sub{color:var(--muted);font-size:11.5px;margin-bottom:14px}
  h2{font-size:16px;margin:32px 0 10px;border-left:4px solid var(--accent);padding-left:10px}
  h3{font-size:12.5px;margin:20px 0 6px;color:#444;text-transform:uppercase;letter-spacing:.06em}
  .summary{background:#f4f8fc;border:1px solid #dbe7f3;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.7}
  .summary p{margin:0 0 8px}
  ul.findings{margin:6px 0 0;padding-left:18px}
  ul.findings li{margin:4px 0;line-height:1.55}
  .muted{color:var(--muted);font-size:11.5px}
  .note{margin-top:6px;line-height:1.6}
  table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}
  th,td{border-bottom:1px solid var(--line);padding:7px 6px;text-align:left;vertical-align:middle}
  th{background:#f7f7f7;font-weight:600;color:#444}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  table.matrix{font-size:11.5px}table.matrix th,table.matrix td{padding:5px 4px}
  .chart{border:1px solid var(--line);border-radius:8px;padding:14px;margin-top:6px;background:#fff}
  .tag{display:inline-block;background:#eef3f8;color:#1f4e79;border-radius:4px;padding:2px 8px;font-size:11px;margin-right:6px}
  ul.toc{columns:2;font-size:13px;line-height:1.9;padding-left:18px}
  hr{border:0;border-top:1px solid var(--line);margin:34px 0}
  .bundle-item .page{box-shadow:none;padding:0}
  .bundle-item h1{font-size:20px;border-top:0}
</style></head>
<body><div class="page">
  <h1>Full Catalog Bundle</h1>
  <div class="sub">${BRAND_TOKEN} &middot; Generated: ${generatedAt} &nbsp;|&nbsp; ${entries.length} reports &nbsp;|&nbsp; Source: World Bank Open Data (CC BY 4.0)</div>
  <div class="summary">This document contains every catalog report, inlined in full${price ? ` (purchased at ${esc(price)} as a bundle)` : ''}.
    Each section is a self-contained analysis with ranking, share, trend fit, momentum, volatility, data quality and a complete
    year-by-year data matrix. The same content is available as one JSON document with <code>?format=json</code>.</div>
  <h2>Contents</h2>
  <ul class="toc">${toc}</ul>
  <hr>
  ${bodies}
</div></body></html>`;
}

// JSON bundle: every report's structured payload in one document, keyed by report id.
export function buildBundleJson(payloads, { generatedAt = new Date().toISOString(), price = null } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'bundle',
    generatedAt,
    purchase: price ? { price, protocol: 'x402', asset: 'USDC' } : null,
    reportCount: payloads.length,
    licence: { attribution: 'World Bank Open Data (CC BY 4.0)', terms: 'Attribution required; commercial use permitted.' },
    reports: payloads,
  };
}

// ---------------------------------------------------------------- public builders

export async function buildReportFromDef(def, { fredKey, banner = '', price = null, formats = ['html'] } = {}) {
  const { analysis } = await buildAnalysis(def, { fredKey });
  return {
    analysis,
    html: formats.includes('html') ? renderHtml(analysis, { banner, price }) : null,
    json: formats.includes('json') ? toJsonPayload(analysis, { price }) : null,
    csv: formats.includes('csv') ? toCsv(analysis, def) : null,
    summaryCsv: formats.includes('csv') ? toSummaryCsv(analysis, def) : null,
    preview: formats.includes('preview') ? buildPreview(analysis) : null,
    rows: analysis.indicators[0] ? analysis.indicators[0].rows : [],
    meta: {
      id: def.id,
      title: analysis.report.title,
      category: analysis.report.category,
      tier: def.tier,
      keywords: analysis.report.keywords,
      indicators: def.indicators,
      countries: def.countries,
      years: def.years,
      generatedAt: analysis.generatedAt,
      latestYear: analysis.totals.latestYear,
      observations: analysis.totals.publishedObservations,
      coverage: analysis.totals.coveragePct,
      attribution: analysis.attribution,
    },
  };
}

export async function buildReport(reportId = 'macro-gdp', opts = {}) {
  const def = CATALOG[reportId];
  if (!def) throw new Error(`Unknown report id: ${reportId}`);
  return buildReportFromDef(def, opts);
}

// Free trial document: one indicator, three economies, with a banner explaining what the paid
// version adds. The machine-readable preview at /preview/{id} is the other half of this surface.
export async function buildSample(reportId, { fredKey, countries = 3 } = {}) {
  const def = CATALOG[reportId];
  if (!def) throw new Error(`Unknown report id: ${reportId}`);
  const sampleDef = {
    ...def,
    id: `sample-${def.id}`,
    title: `${def.title} — free sample`,
    indicators: def.indicators.slice(0, 1),
    countries: def.countries.slice(0, countries),
  };
  const banner = `<div class="summary" style="background:#fff8e6;border-color:#f0dfae;margin-bottom:18px">
    <strong>Free sample.</strong> This preview shows ${sampleDef.indicators.length} of ${def.indicators.length} indicator(s)
    and ${sampleDef.countries.length} of ${def.countries.length} economies, and omits the share, trend, momentum and full
    year-by-year sections. The complete report is at <code>GET /report/${def.id}</code> for a small USDC payment over x402,
    as HTML, JSON or CSV. A free machine-readable cross-section is at <code>GET /preview/${def.id}</code>.
  </div>`;
  return buildReportFromDef(sampleDef, { fredKey, banner });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2] || 'macro-gdp';
  const out = process.argv[3] || `${id}.html`;
  buildReport(id, { formats: ['html', 'json', 'csv'] })
    .then(({ html, meta, json, csv }) => {
      writeFileSync(out, html, 'utf8');
      console.log(`OK report: ${out} (${meta.title}, latest year ${meta.latestYear}, ${meta.observations} observations, ${csv.split('\n').length - 2} CSV rows, ${JSON.stringify(json).length}B JSON)`);
    })
    .catch((e) => {
      console.error('generation failed:', e);
      process.exit(1);
    });
}
