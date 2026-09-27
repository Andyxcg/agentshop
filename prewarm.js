// prewarm.js — pre-generate every artefact the store can serve, so a deployment ships warm and can
// answer its first paid request immediately instead of spending it on upstream fetches.
//
// Per report: the HTML document, the JSON payload, the tidy long CSV, the derived-metrics CSV, the
// free preview (JSON + CSV) and the reduced HTML sample. Plus the bundle in all four formats.
//
// One data fetch feeds every format: the upstream API is the slow, rate-limited part, and rendering
// four projections of the same analysis is nearly free by comparison.
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { CATALOG, listCatalog, PRODUCTS, FORMATS, CATEGORIES, ALL_INDICATOR_CODES } from './catalog.js';
import {
  buildReportFromDef, buildSample, buildBundleHtml, buildBundleJson,
  buildPreview, previewToCsv, SCHEMA_VERSION,
} from './generate-report.js';
import {
  cacheArtifact, cacheReport, readArtifact, readCachedJson, getSales, setMeta, getMeta,
} from './store.js';
import { priceForReport, priceForBundle, SETTLEMENT_FEE_USD, FEE_COVER_MULTIPLE } from './pricing.js';
import { SERVICE_NAME, publicBase } from './brand.js';

const NETWORK = process.env.NETWORK || 'eip155:8453'; // Base mainnet
const PAYOUT_ADDRESS = process.env.PAYOUT_ADDRESS || '';
const base = publicBase();

const ids = Object.keys(CATALOG);
const which = process.argv[2] || '';           // '', 'reports', 'samples', 'bundle'
// 'bundle' rebuilds only the bundle from the per-report artefacts already on disk, with no upstream
// fetches. It exists because the bundle is the one artefact that embeds the brand token, so a rename
// needs the bundle refreshed and nothing else — refetching 61 reports to change a title would be a
// waste of the public API's patience.
const skipReports = which === 'samples' || which === 'bundle';
const skipSamples = which === 'reports' || which === 'bundle';
const skipPreviews = which === 'bundle';

const results = [];
const BATCH = 3; // Upstream is a public API; stay polite and keep the whole run inside a few minutes.

if (!skipReports) {
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const settled = await Promise.all(
      batch.map(async (id) => {
        const def = CATALOG[id];
        try {
          const built = await buildReportFromDef(def, { formats: ['html', 'json', 'csv', 'summary-csv'] });
          cacheArtifact(id, 'html', built.html);
          cacheArtifact(id, 'json', JSON.stringify(built.json));
          cacheArtifact(id, 'csv', built.csv);
          cacheArtifact(id, 'metrics.csv', built.summaryCsv);
          if (built.meta) {
            setMeta(id, {
              title: built.meta.title,
              latestYear: built.meta.latestYear,
              observations: built.meta.observations,
              coverage: built.meta.coverage,
              generatedAt: built.meta.generatedAt,
            });
          }
          const jsonKb = built.json ? JSON.stringify(built.json).length / 1024 : 0;
          console.log(
            `OK   ${id.padEnd(28)} latest=${built.meta.latestYear} obs=${String(built.meta.observations).padStart(5)} ` +
            `cov=${built.meta.coverage ?? '—'}% html=${(built.html.length / 1024).toFixed(0)}KB json=${jsonKb.toFixed(0)}KB`
          );
          return { id, ok: true, meta: built.meta, analysis: built.analysis };
        } catch (e) {
          console.error(`FAIL ${id}: ${e.message}`);
          return { id, ok: false, error: e.message };
        }
      })
    );
    results.push(...settled);
  }
}

// Free previews. Built from the analysis already in memory where available, so a preview costs
// nothing extra; reports skipped in this run fall back to their own fetch.
if (!skipPreviews) for (const id of ids) {
  try {
    let analysis = results.find((r) => r.id === id && r.ok)?.analysis;
    if (!analysis) {
      const built = await buildReportFromDef(CATALOG[id], { formats: [] });
      analysis = built.analysis;
    }
    const preview = buildPreview(analysis);
    cacheArtifact(id, 'preview.json', JSON.stringify(preview));
    cacheArtifact(id, 'preview.csv', previewToCsv(preview));
  } catch (e) {
    console.error(`preview FAIL ${id}: ${e.message}`);
  }
  console.log(`previews ${ids.indexOf(id) + 1}/${ids.length}`);
}

// Reduced HTML samples: the human-inspection half of the free conversion surface.
if (!skipSamples) {
  for (let i = 0; i < ids.length; i += BATCH) {
    await Promise.all(
      ids.slice(i, i + BATCH).map(async (id) => {
        try {
          const { html } = await buildSample(id, { fredKey: process.env.FRED_API_KEY });
          cacheReport(`sample-${id}`, html);
        } catch (e) {
          console.error(`sample FAIL ${id}: ${e.message}`);
        }
      })
    );
    console.log(`samples ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
  }
}

// ---------------------------------------------------------------- bundle
// Assembled from the per-report artefacts already on disk, so it is cheap in every format.
const storedMeta = getMeta();
const latestYearById = Object.fromEntries(
  Object.entries(storedMeta).map(([id, m]) => [id, m?.latestYear ?? null])
);
for (const r of results) if (r.ok) latestYearById[r.id] = r.meta.latestYear;

const individualPrices = ids.map((id) => priceForReport(CATALOG[id], getSales(id), latestYearById[id]));
const bundlePrice = priceForBundle(individualPrices);

const entries = ids
  .map((id) => ({
    id,
    title: CATALOG[id].title,
    category: CATALOG[id].category,
    html: readArtifact(id, 'html'),
    json: readCachedJson(id),
    csv: readArtifact(id, 'csv'),
    metricsCsv: readArtifact(id, 'metrics.csv'),
  }))
  .filter((e) => e.html || e.json || e.csv);

if (entries.length) {
  cacheArtifact('bundle', 'html', buildBundleHtml(entries.filter((e) => e.html), { price: bundlePrice }));
  cacheArtifact('bundle', 'json', JSON.stringify(buildBundleJson(entries.filter((e) => e.json).map((e) => e.json), { price: bundlePrice })));
  for (const [key, ext] of [['csv', 'csv'], ['metricsCsv', 'metrics.csv']]) {
    const parts = entries.map((e) => e[key]).filter(Boolean);
    if (!parts.length) continue;
    const header = parts[0].split('\n')[0];
    const rows = parts.map((p) => p.split('\n').slice(1).filter((l) => l.trim()).join('\n'));
    cacheArtifact('bundle', ext, [header, ...rows].join('\n') + '\n');
  }
  console.log(`OK   bundle (${entries.length} reports inlined, ${bundlePrice})`);
}

// ---------------------------------------------------------------- static snapshot
// Mirrors the live /catalog payload closely enough that the cloud-space static mirror is useful
// before the deployment is refreshed. The authoritative copy is fetched from the running server
// after each deploy.
const items = listCatalog().map((c) => {
  const r = results.find((x) => x.id === c.id);
  const cached = storedMeta[c.id] || {};
  const latestYear = r?.meta?.latestYear ?? latestYearById[c.id] ?? null;
  return {
    ...c,
    endpoint: `/report/${c.id}`,
    url: `${base}/report/${c.id}`,
    sampleUrl: `${base}/sample/${c.id}`,
    previewUrl: `${base}/preview/${c.id}`,
    schemaUrl: `${base}/schema/report.json`,
    price: priceForReport(CATALOG[c.id], getSales(c.id), latestYear),
    sales: getSales(c.id),
    latestYear,
    generatedAt: r?.meta?.generatedAt ?? cached.generatedAt ?? null,
    dataPoints: r?.meta?.observations ?? cached.observations ?? null,
    coveragePct: r?.meta?.coverage ?? cached.coverage ?? null,
    formats: FORMATS,
    delivery: {
      html: `${base}/report/${c.id}`,
      json: `${base}/report/${c.id}?format=json`,
      csv: `${base}/report/${c.id}?format=csv`,
      metricsCsv: `${base}/report/${c.id}?format=summary-csv`,
    },
    payment: { protocol: 'x402', scheme: 'exact', asset: 'USDC', network: NETWORK, payTo: PAYOUT_ADDRESS },
  };
});

writeFileSync(
  'public/catalog.json',
  JSON.stringify(
    {
      service: SERVICE_NAME,
      version: '2.1',
      schemaVersion: SCHEMA_VERSION,
      baseUrl: base,
      currency: 'USDC',
      network: NETWORK,
      payTo: PAYOUT_ADDRESS,
      categories: CATEGORIES,
      count: items.length,
      formats: FORMATS,
      schemaUrl: `${base}/schema/report.json`,
      preview: { endpoint: '/preview/:id', free: true, csvVariant: '/preview/:id?format=csv', schemaUrl: `${base}/schema/report.json` },
      economics: {
        settlementFeeUsd: SETTLEMENT_FEE_USD,
        feeCoverMultiple: FEE_COVER_MULTIPLE,
        indicatorsSupported: ALL_INDICATOR_CODES.length,
      },
      custom: { ...PRODUCTS.custom },
      bundle: { ...PRODUCTS.bundle, price: bundlePrice, includes: items.length },
      items,
    },
    null,
    2
  ),
  'utf8'
);

const okCount = results.length ? results.filter((r) => r.ok).length : ids.length;
console.log(
  `\nDone: ${okCount}/${ids.length} reports (all formats) · bundle ${bundlePrice} · ` +
  `public/catalog.json written (baseUrl=${base}, network=${NETWORK})`
);
if (results.length && okCount !== results.length) process.exit(1);
