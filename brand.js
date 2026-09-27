// Single source of brand truth, imported by the server and by the artefact generator instead of
// being repeated at each call site. During the rename to `agentshop` the old name survived in two
// machine-readable documents (the JSON Schema title and the cached bundle) precisely because it had
// been hard-coded in more than one place — a name that appears only once cannot go stale.

export const SERVICE_NAME = 'agentshop';

// Cached artefacts are regenerated rarely but re-served forever, and a deployment keeps whatever is
// already on the container volume. Baking a brand into such a file means a rename cannot take effect
// without invalidating every cached copy, so generators emit this token and the server substitutes
// the live name at delivery. See `stampBrand` in server.js.
export const BRAND_TOKEN = '__BRAND__';

// Stable machine-facing identifier derived from the display name (`agentshop` -> `agentshop`).
export function serviceSlug() {
  return SERVICE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'service';
}

// The public origin. This is the second time a value hard-coded in more than one file went stale —
// after the rename to `agentshop` it was the brand name; when the service moved off the
// `x402-report-store` host it was the hostname, which three generators kept advertising as the live
// origin long after that host stopped resolving. A host that appears only once cannot go stale, so
// it appears only here. PUBLIC_URL from the environment still wins: that is what the container
// actually receives, and it is what makes this file's default a fallback rather than a fact.
export const PUBLIC_HOST = 'https://reportbazaar.app.workbuddy.host';

export function publicBase() {
  return (process.env.PUBLIC_URL || PUBLIC_HOST).replace(/\/$/, '');
}
