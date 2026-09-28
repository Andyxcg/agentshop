// catalog.js — report product catalog.
// Each entry is a purchasable report product that a buyer agent can fetch by paying via x402.
// Every report also carries `keywords` so agent directories and search endpoints can match
// natural-language requests ("inflation", "energy mix", "sovereign debt") to a product id.
import {
  INDICATORS, INDICATOR_KIND, INDICATOR_THEME, INDICATOR_POLARITY, INDICATOR_SPARSE,
} from './datasources.js';

// Default economies (World Bank iso2 codes)
const TOP = ['US', 'CN', 'JP', 'DE', 'IN', 'GB', 'FR', 'BR', 'RU', 'KR'];
const G20 = ['US', 'CN', 'JP', 'DE', 'IN', 'GB', 'FR', 'BR', 'RU', 'KR', 'CA', 'IT', 'MX', 'ID', 'TR', 'SA', 'AU', 'ZA', 'AR'];

// The standard coverage for a report: the G20 plus Spain — twenty economies spanning every income
// band, all four BRICS members, both North American free-trade partners and the large ASEAN and
// Gulf markets. Concentration measures (HHI, dispersion, spread ratio) only mean something over a
// group this broad; over ten economies they mostly restate the fact that America is large.
const WORLD = [...G20, 'ES'];

// Regional subsets for region-scoped reports (see the `region` field handling below).
const APAC = ['CN', 'JP', 'IN', 'KR', 'ID'];
const EUR = ['DE', 'FR', 'GB', 'IT', 'ES', 'RU'];
const LATAM = ['BR', 'MX', 'AR'];
const EM = ['BR', 'IN', 'ID', 'TR', 'ZA', 'MX', 'AR', 'KR'];
const NA = ['US', 'CA', 'MX'];

// Indicators published too sparsely to survive a twenty-economy ranking. Measured, not guessed:
// each of these was probed against the thirty-economy candidate list and has fewer than twenty
// economies with five or more published years in 2015-2025. Reports that sell one of these keep the
// narrower ten-economy set, where every row still has a usable series.
const THIN_INDICATORS = new Set([
  'FX.OWN.TOTL.ZS',    // account ownership: 0 economies at full density
  'GC.DOD.TOTL.GD.ZS', // central government debt: 13
  'DT.DOD.DECT.CD',    // external debt stocks: 16
  'SI.POV.GINI',       // Gini index: 19
  'SI.POV.DDAY',       // extreme poverty headcount: 19
]);
const WB = { name: 'World Bank Open Data', license: 'CC BY 4.0', url: 'https://data.worldbank.org' };

// ---------------------------------------------------------------- annual editions
// The catalog's default window is 2015-2025 for every theme report. A buyer that wants "the
// economy in 2024" rather than "the economy 2015-2025" had no product to buy: the theme reports
// answer a trend question, not a year question, and a single-year slice has no CAGR, no volatility
// and no momentum — the analytics collapse. The yearbook family fills that gap with a rolling
// five-year window ending in the edition year, which is short enough to read as "the state of
// play in YYYY" and long enough that every derived metric still means something.
//
// Editions start at 2019 because the earliest window they may use is 2015: a 2019 edition covers
// 2015-2019, and an earlier edition would have to reach outside the catalog's data window.
const YEARBOOK_START = 2019;
const YEARBOOK_END = 2025;
export const ANNUAL_EDITION_YEARS = Array.from(
  { length: YEARBOOK_END - YEARBOOK_START + 1 },
  (_, i) => YEARBOOK_START + i,
);

// Five headline indicators, all of them dense enough for the twenty-economy set, chosen so the
// document answers the four questions a year-in-review is actually asked: how big, how fast,
// how expensive, how many. Unemployment is the fifth because growth without it is half a story.
const YEARBOOK_INDICATORS = [
  'NY.GDP.MKTP.CD',     // output, current US$
  'NY.GDP.MKTP.KD.ZG',  // real growth, annual %
  'FP.CPI.TOTL.ZG',     // consumer inflation, annual %
  'SL.UEM.TOTL.ZS',     // unemployment, % of labour force
  'SP.POP.TOTL',        // population
];

function yearbook(window) {
  const y = window[window.length - 1];
  const from = window[0];
  return {
    id: `yearbook-${y}`,
    title: `${y} Yearbook — World Economy, ${from}-${y}`,
    category: 'annual',
    indicators: YEARBOOK_INDICATORS,
    countries: WORLD,
    years: `${from}:${y}`,
    tier: 'premium',
    description:
      `Year-in-review for ${y}: output, real growth, consumer inflation, unemployment and population for twenty economies over the five years ${from}-${y}. `
      + `Carries the full cross-indicator correlation matrix, per-economy trend and momentum, outlier-year flags and the year-by-year matrix, so it answers both "where does ${y} sit" and "how did it get there".`,
    keywords: [
      `${y}`, `year in review`, `yearbook`, `annual review`, `world economy`,
      `economic outlook ${y}`, `macro snapshot`, `country comparison ${y}`,
    ],
    sources: [WB],
  };
}

// The year index: which years the catalog can answer for, and which reports answer for each. This
// is the browsing axis a retrieval agent uses when the question names a year rather than a topic.
export const CATALOG_YEAR_START = 2015;
export const CATALOG_YEAR_END = 2025;

// Shared keyword vocabulary. These strings are what an agent's retrieval step matches against.
const COMMON = ['macroeconomic', 'cross-country', 'time series', 'world bank', 'annual', 'comparison', 'research', 'dataset', 'statistics'];

export const CATALOG = {
  // ---------------------------------------------------------------- output & growth
  'macro-gdp': {
    id: 'macro-gdp',
    title: 'GDP Comparison Report — Major Economies',
    category: 'output',
    indicators: ['NY.GDP.MKTP.CD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'GDP at current US dollars for ten major economies, with period CAGR, share of group total, latest-year growth, volatility and a full year-by-year matrix.',
    keywords: ['gdp', 'gross domestic product', 'economy size', 'output', 'nominal gdp'],
    sources: [WB],
  },
  'macro-gdp-per-capita': {
    id: 'macro-gdp-per-capita',
    title: 'GDP per Capita Comparison Report',
    category: 'output',
    indicators: ['NY.GDP.PCAP.CD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'GDP per capita at current US dollars — a productivity and living-standard proxy with CAGR, ranking and dispersion metrics.',
    keywords: ['gdp per capita', 'income per person', 'living standard', 'productivity', 'wealth'],
    sources: [WB],
  },
  'macro-gdp-ppp': {
    id: 'macro-gdp-ppp',
    title: 'GDP at Purchasing Power Parity Report',
    category: 'output',
    indicators: ['NY.GDP.MKTP.PP.CD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'GDP at PPP in current international dollars — real economic weight adjusted for price levels, a common basis for cross-country ranking.',
    keywords: ['ppp', 'purchasing power parity', 'real economy size', 'international dollars'],
    sources: [WB],
  },
  'macro-gdp-growth': {
    id: 'macro-gdp-growth',
    title: 'GDP Growth Rate Report',
    category: 'output',
    indicators: ['NY.GDP.MKTP.KD.ZG'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Real GDP growth (annual %) — expansion or contraction momentum, average growth, volatility and recession-year detection.',
    keywords: ['gdp growth', 'economic growth', 'recession', 'momentum', 'expansion'],
    sources: [WB],
  },

  // ---------------------------------------------------------------- prices & money
  'macro-inflation': {
    id: 'macro-inflation',
    title: 'Inflation Rate Comparison Report',
    category: 'prices',
    indicators: ['FP.CPI.TOTL.ZG'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Consumer-price inflation across ten economies — monetary-policy stance, peak-inflation year and average inflation over the period.',
    keywords: ['inflation', 'cpi', 'consumer prices', 'cost of living', 'monetary policy'],
    sources: [WB],
  },
  'macro-gdp-deflator': {
    id: 'macro-gdp-deflator',
    title: 'GDP Deflator Inflation Report',
    category: 'prices',
    indicators: ['NY.GDP.DEFL.KD.ZG'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Inflation measured by the GDP deflator — the broadest domestic price gauge, useful as a cross-check against consumer-price inflation.',
    keywords: ['gdp deflator', 'broad inflation', 'price level', 'deflator'],
    sources: [WB],
  },
  'macro-fx': {
    id: 'macro-fx',
    title: 'Official Exchange Rate Report',
    category: 'prices',
    indicators: ['PA.NUS.FCRF'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Official exchange rate, local currency units per US dollar (period average) — a currency-valuation baseline with cumulative depreciation.',
    keywords: ['exchange rate', 'currency', 'forex', 'depreciation', 'devaluation', 'fx'],
    sources: [WB],
  },

  // ---------------------------------------------------------------- external sector
  'macro-trade': {
    id: 'macro-trade',
    title: 'Merchandise and Services Exports Report',
    category: 'trade',
    indicators: ['NE.EXP.GNFS.CD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Total exports of goods and services at current US dollars — global trade positioning, export share of the group and growth.',
    keywords: ['exports', 'trade', 'goods and services', 'export competitiveness'],
    sources: [WB],
  },
  'macro-imports': {
    id: 'macro-imports',
    title: 'Merchandise and Services Imports Report',
    category: 'trade',
    indicators: ['NE.IMP.GNFS.CD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Total imports of goods and services at current US dollars — domestic demand strength and external dependence.',
    keywords: ['imports', 'trade', 'domestic demand', 'import dependence'],
    sources: [WB],
  },
  'macro-trade-openness': {
    id: 'macro-trade-openness',
    title: 'Trade Openness Report',
    category: 'trade',
    indicators: ['NE.TRD.GNFS.ZS', 'TG.VAL.TOTL.GD.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Trade as a share of GDP and merchandise trade as a share of GDP — how open each economy is to cross-border flows.',
    keywords: ['trade openness', 'trade to gdp', 'globalisation', 'tariff exposure'],
    sources: [WB],
  },
  'macro-current-account': {
    id: 'macro-current-account',
    title: 'Current Account Balance Report',
    category: 'trade',
    indicators: ['BN.CAB.XOKA.CD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Current account balance at current US dollars — external surplus or deficit position, with a surplus/deficit classification per economy.',
    keywords: ['current account', 'trade balance', 'external balance', 'surplus', 'deficit'],
    sources: [WB],
  },
  'macro-remittances': {
    id: 'macro-remittances',
    title: 'Personal Remittances Report',
    category: 'trade',
    indicators: ['BX.TRF.PWKR.CD.DT'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Personal remittances received at current US dollars — a hard-currency inflow that often dwarfs FDI in emerging economies.',
    keywords: ['remittances', 'migrant transfers', 'diaspora flows', 'household income'],
    sources: [WB],
  },

  // ---------------------------------------------------------------- investment & finance
  'macro-fdi': {
    id: 'macro-fdi',
    title: 'Foreign Direct Investment Net Inflows Report',
    category: 'investment',
    indicators: ['BX.KLT.DINV.CD.WD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'FDI net inflows on a balance-of-payments basis, current US dollars — cross-border capital confidence, share of group inflow and stability.',
    keywords: ['fdi', 'foreign direct investment', 'capital flows', 'investment climate'],
    sources: [WB],
  },
  'macro-debt': {
    id: 'macro-debt',
    title: 'External Debt Stock Report',
    category: 'finance',
    indicators: ['DT.DOD.DECT.CD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Public and publicly guaranteed external debt stocks at current US dollars — sovereign repayment-risk reference with debt accumulation trend.',
    keywords: ['external debt', 'sovereign debt', 'debt burden', 'default risk', 'debt stock'],
    sources: [WB],
  },
  'macro-credit': {
    id: 'macro-credit',
    title: 'Domestic Credit to Private Sector Report',
    category: 'finance',
    indicators: ['FS.AST.PRVT.GD.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Domestic credit to the private sector as a percentage of GDP — banking-system depth and leverage build-up.',
    keywords: ['private credit', 'leverage', 'banking depth', 'credit to gdp', 'financial deepening'],
    sources: [WB],
  },
  'macro-market-cap': {
    id: 'macro-market-cap',
    title: 'Equity Market Capitalization Report',
    category: 'finance',
    indicators: ['CM.MKT.LCAP.CD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Market capitalization of listed domestic companies at current US dollars — listed-equity depth and capital-market development.',
    keywords: ['market cap', 'stock market', 'equity market', 'capitalisation', 'listed companies'],
    sources: [WB],
  },

  // ---------------------------------------------------------------- labor & society
  'macro-population': {
    id: 'macro-population',
    title: 'Population Comparison Report',
    category: 'demographics',
    indicators: ['SP.POP.TOTL'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description: 'Total population for ten economies with compound growth and share of the group.',
    keywords: ['population', 'demographics', 'headcount', 'population size'],
    sources: [WB],
  },
  'macro-population-growth': {
    id: 'macro-population-growth',
    title: 'Population Growth Report',
    category: 'demographics',
    indicators: ['SP.POP.GROW', 'SP.URB.TOTL.IN.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Annual population growth and urbanisation share — the demographic trajectory behind long-run demand.',
    keywords: ['population growth', 'urbanisation', 'demographic decline', 'urban population'],
    sources: [WB],
  },
  'macro-life-expectancy': {
    id: 'macro-life-expectancy',
    title: 'Life Expectancy and Child Mortality Report',
    category: 'health',
    indicators: ['SP.DYN.LE00.IN', 'SH.DYN.MORT'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Life expectancy at birth and under-5 mortality per 1,000 live births — two complementary population-health measures.',
    keywords: ['life expectancy', 'mortality', 'public health', 'human development', 'longevity'],
    sources: [WB],
  },
  'macro-unemployment': {
    id: 'macro-unemployment',
    title: 'Unemployment Rate Report',
    category: 'labor',
    indicators: ['SL.UEM.TOTL.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Total unemployment as a share of the labor force — labor-market slack, best/worst year and period average.',
    keywords: ['unemployment', 'joblessness', 'labour market', 'employment', 'labour slack'],
    sources: [WB],
  },
  'macro-labor-force': {
    id: 'macro-labor-force',
    title: 'Labor Force Participation Report',
    category: 'labor',
    indicators: ['SL.TLF.CACT.ZS', 'SP.DYN.TFRT.IN'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Labor force participation rate alongside the fertility rate — the two drivers of future labor supply.',
    keywords: ['labour force participation', 'fertility rate', 'workforce', 'labour supply', 'birth rate'],
    sources: [WB],
  },
  'macro-gini': {
    id: 'macro-gini',
    title: 'Income Inequality Report',
    category: 'labor',
    indicators: ['SI.POV.GINI'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Gini index (0 = perfect equality, 100 = perfect inequality) — the standard distributional snapshot. Coverage is sparser than other indicators and is reported as such.',
    keywords: ['gini', 'inequality', 'income distribution', 'poverty', 'wealth gap'],
    sources: [WB],
  },

  // ---------------------------------------------------------------- structure & fiscal
  'macro-economic-structure': {
    id: 'macro-economic-structure',
    title: 'Economic Structure Report — Agriculture, Industry, Services',
    category: 'structure',
    indicators: ['NV.AGR.TOTL.ZS', 'NV.IND.TOTL.ZS', 'NV.SRV.TOTL.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Value added by agriculture, industry and services as a share of GDP — three indicators rendered together to show each economy\'s structural composition.',
    keywords: ['economic structure', 'sector composition', 'services share', 'industrialisation', 'agriculture share'],
    sources: [WB],
  },
  'macro-fiscal': {
    id: 'macro-fiscal',
    title: 'Fiscal Position Report — Tax, Debt and Education Spending',
    category: 'fiscal',
    indicators: ['GC.TAX.TOTL.GD.ZS', 'GC.DOD.TOTL.GD.ZS', 'SE.XPD.TOTL.GD.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Tax revenue, central government debt and education expenditure, all as a share of GDP — a three-indicator view of fiscal capacity.',
    keywords: ['fiscal policy', 'tax revenue', 'government debt', 'budget', 'public spending', 'sovereign'],
    sources: [WB],
  },

  // ---------------------------------------------------------------- innovation, energy, environment
  'macro-rnd': {
    id: 'macro-rnd',
    title: 'Research and Development Expenditure Report',
    category: 'innovation',
    indicators: ['GB.XPD.RSDV.GD.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Gross domestic expenditure on R&D as a percentage of GDP — national innovation intensity.',
    keywords: ['r&d', 'research and development', 'innovation', 'science spending', 'technology investment'],
    sources: [WB],
  },
  'macro-patents': {
    id: 'macro-patents',
    title: 'Resident Patent Applications Report',
    category: 'innovation',
    indicators: ['IP.PAT.RESD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Patent applications filed by residents — a direct measure of domestic inventive output. Coverage is limited to the most recent available years.',
    keywords: ['patents', 'intellectual property', 'innovation output', 'ip filings'],
    sources: [WB],
  },
  'macro-energy': {
    id: 'macro-energy',
    title: 'Energy Use and Renewables Report',
    category: 'energy',
    indicators: ['EG.USE.PCAP.KG.OE', 'EG.FEC.RNEW.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Energy use per capita (kg of oil equivalent) paired with the renewable share of final energy consumption — the energy-transition scoreboard.',
    keywords: ['energy', 'energy consumption', 'renewables', 'energy transition', 'oil equivalent', 'power'],
    sources: [WB],
  },
  'macro-co2': {
    id: 'macro-co2',
    title: 'CO2 Emissions per Capita Report',
    category: 'environment',
    indicators: ['EN.GHG.CO2.PC.CE.AR5'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Territorial CO2 emissions per capita in tonnes of CO2 equivalent — the standard climate-accounting intensity measure.',
    keywords: ['co2', 'emissions', 'carbon', 'climate', 'decarbonisation', 'greenhouse gas', 'esg'],
    sources: [WB],
  },
  'macro-air-quality': {
    id: 'macro-air-quality',
    title: 'Air Quality and Water Stress Report',
    category: 'environment',
    indicators: ['EN.ATM.PM25.MC.M3', 'ER.H2O.FWTL.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Mean PM2.5 concentration and freshwater withdrawal as a share of internal resources — environmental stress indicators relevant to operational and sovereign risk.',
    keywords: ['air quality', 'pm2.5', 'pollution', 'water stress', 'water withdrawal', 'esg risk'],
    sources: [WB],
  },
  'macro-food': {
    id: 'macro-food',
    title: 'Food Production Index Report',
    category: 'environment',
    indicators: ['AG.PRD.FOOD.XD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Food production index (2014-2016 = 100) — agricultural output trajectory and food-security supply side.',
    keywords: ['food production', 'agriculture', 'food security', 'crop output'],
    sources: [WB],
  },

  // ---------------------------------------------------------------- health & defense
  'macro-health': {
    id: 'macro-health',
    title: 'Health Expenditure Report',
    category: 'health',
    indicators: ['SH.XPD.CHEX.GD.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Current health expenditure as a percentage of GDP — the fiscal weight of each health system.',
    keywords: ['health expenditure', 'healthcare spending', 'health system', 'medical cost'],
    sources: [WB],
  },
  'macro-military': {
    id: 'macro-military',
    title: 'Military Expenditure Report',
    category: 'defense',
    indicators: ['MS.MIL.XPND.GD.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Military expenditure as a percentage of GDP — defence burden and its trend since 2015, when several budgets inflected upward.',
    keywords: ['military spending', 'defence budget', 'defence burden', 'arms', 'geopolitics'],
    sources: [WB],
  },

  // ---------------------------------------------------------------- digital
  'macro-digital': {
    id: 'macro-digital',
    title: 'Digital Adoption Report — Internet and Mobile',
    category: 'digital',
    indicators: ['IT.NET.USER.ZS', 'IT.CEL.SETS.P2'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Individuals using the Internet (% of population) and mobile cellular subscriptions per 100 people — digital-adoption depth for market sizing.',
    keywords: ['internet penetration', 'digital adoption', 'mobile subscriptions', 'connectivity', 'technology adoption'],
    sources: [WB],
  },

  // ================================================================ added: real-terms output
  'macro-real-gdp': {
    id: 'macro-real-gdp',
    title: 'Real GDP Report (Constant Prices)',
    category: 'output',
    indicators: ['NY.GDP.MKTP.KD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'GDP at constant 2015 US dollars — volume growth stripped of price effects, the like-for-like basis for comparing economies over time.',
    keywords: ['real gdp', 'constant prices', 'volume growth', 'inflation adjusted output', 'real economy'],
    sources: [WB],
  },
  'macro-gni-per-capita': {
    id: 'macro-gni-per-capita',
    title: 'GNI per Capita Report (Atlas Method)',
    category: 'output',
    indicators: ['NY.GNP.PCAP.CD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Gross national income per capita on the World Bank Atlas method (current US$) — the income yardstick behind development classifications and lending tiers.',
    keywords: ['gni per capita', 'atlas method', 'national income', 'income level', 'development tier'],
    sources: [WB],
  },

  // ================================================================ added: technology & innovation
  'macro-tech-exports': {
    id: 'macro-tech-exports',
    title: 'High-Technology Exports Share Report',
    category: 'innovation',
    indicators: ['TX.VAL.TECH.MF.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'High-technology exports as a share of manufactured exports — the clearest single proxy for where advanced manufacturing and semiconductor-grade capability sits.',
    keywords: ['high technology exports', 'semiconductors', 'advanced manufacturing', 'tech exports', 'export sophistication', 'ai hardware'],
    sources: [WB],
  },
  'macro-scientific-output': {
    id: 'macro-scientific-output',
    title: 'Scientific Research Output Report',
    category: 'innovation',
    indicators: ['IP.JRN.ARTC.SC'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Scientific and technical journal articles published — the volume measure of national research output. Publication lags the reporting period by two to three years.',
    keywords: ['research output', 'scientific papers', 'journal articles', 'r&d capacity', 'science', 'publications'],
    sources: [WB],
  },
  'macro-tertiary-education': {
    id: 'macro-tertiary-education',
    title: 'Tertiary Education Enrolment Report',
    category: 'education',
    indicators: ['SE.TER.ENRR'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Gross tertiary enrolment ratio — the share of the school-age cohort entering university, a leading indicator of future skilled-labour supply.',
    keywords: ['tertiary education', 'university enrolment', 'higher education', 'skilled labour', 'graduate supply'],
    sources: [WB],
  },
  'macro-broadband': {
    id: 'macro-broadband',
    title: 'Fixed Broadband Penetration Report',
    category: 'digital',
    indicators: ['IT.NET.BBND.P2'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Fixed broadband subscriptions per 100 people — fixed-line connectivity depth, the infrastructure base for cloud and data-centre demand.',
    keywords: ['broadband', 'fixed internet', 'connectivity', 'telecom infrastructure', 'cloud readiness'],
    sources: [WB],
  },
  'macro-internet-security': {
    id: 'macro-internet-security',
    title: 'Secure Internet Servers Report',
    category: 'digital',
    indicators: ['IT.NET.SECR.P6'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Secure Internet servers (TLS) per 1 million people — the density of encrypted online infrastructure, which tracks where digital business is actually hosted.',
    keywords: ['secure servers', 'tls', 'encryption', 'cybersecurity', 'internet infrastructure', 'hosting'],
    sources: [WB],
  },

  // ================================================================ added: energy transition
  'macro-renewable-power': {
    id: 'macro-renewable-power',
    title: 'Renewable Electricity Output Report',
    category: 'energy',
    indicators: ['EG.ELC.RNEW.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Renewable electricity as a share of total electricity output — the power-mix transition measured at the generation stage.',
    keywords: ['renewable electricity', 'solar', 'wind', 'power mix', 'energy transition', 'clean power'],
    sources: [WB],
  },
  'macro-fossil-share': {
    id: 'macro-fossil-share',
    title: 'Fossil Fuel Dependence Report',
    category: 'energy',
    indicators: ['EG.USE.COMM.FO.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Fossil fuel consumption as a share of total energy use — the inverse of the transition, and a direct read on exposure to fuel-price shocks.',
    keywords: ['fossil fuels', 'oil dependence', 'coal', 'gas', 'energy security', 'carbon intensity'],
    sources: [WB],
  },
  'macro-electricity-access': {
    id: 'macro-electricity-access',
    title: 'Electricity Access Report',
    category: 'energy',
    indicators: ['EG.ELC.ACCS.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Share of the population with access to electricity — the electrification baseline that conditions every downstream demand estimate.',
    keywords: ['electricity access', 'electrification', 'energy poverty', 'grid coverage', 'power access'],
    sources: [WB],
  },

  // ================================================================ added: trade policy
  'macro-tariffs': {
    id: 'macro-tariffs',
    title: 'Applied Tariff Rate Report',
    category: 'trade',
    indicators: ['TM.TAX.MRCH.WM.AR.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Trade-weighted mean applied tariff across all products — the measured restrictiveness of each economy\'s border, relevant to supply-chain and sourcing exposure. Published intermittently.',
    keywords: ['tariffs', 'trade barriers', 'protectionism', 'import duty', 'trade war', 'customs'],
    sources: [WB],
  },
  'macro-tourism': {
    id: 'macro-tourism',
    title: 'International Tourism Receipts Report',
    category: 'trade',
    indicators: ['BX.GSR.TRVL.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'International tourism receipts as a share of total exports — the service-export concentration of each economy, and its pandemic-era rupture.',
    keywords: ['tourism', 'travel receipts', 'service exports', 'visitor economy', 'travel and tourism'],
    sources: [WB],
  },

  // ================================================================ added: fiscal strain
  'macro-debt-interest': {
    id: 'macro-debt-interest',
    title: 'Government Interest Burden Report',
    category: 'fiscal',
    indicators: ['GC.XPN.INTP.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Interest payments as a share of central government expense — how much of each budget is consumed servicing debt rather than funding policy. Only IMF-format reporters are covered.',
    keywords: ['interest payments', 'debt service', 'fiscal burden', 'sovereign risk', 'budget rigidity'],
    sources: [WB],
  },

  // ================================================================ added: demographics & society
  'macro-population-aging': {
    id: 'macro-population-aging',
    title: 'Population Ageing Report',
    category: 'demographics',
    indicators: ['SP.POP.65UP.TO.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Population aged 65 and above as a share of the total — the ageing ratio that drives pension, healthcare and labour-supply projections.',
    keywords: ['ageing', 'aging population', 'pension', 'elderly share', 'dependency ratio', 'demographic cliff'],
    sources: [WB],
  },
  'macro-poverty': {
    id: 'macro-poverty',
    title: 'Extreme Poverty Report',
    category: 'society',
    indicators: ['SI.POV.DDAY'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Poverty headcount at $2.15 a day (2017 PPP) — the headline development measure. Survey-based, so observations arrive in irregular waves rather than every year.',
    keywords: ['poverty', 'extreme poverty', 'development', 'living standards', 'sdg', 'income floor'],
    sources: [WB],
  },
  'macro-gender-parliament': {
    id: 'macro-gender-parliament',
    title: 'Women in Parliament Report',
    category: 'society',
    indicators: ['SG.GEN.PARL.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Proportion of national parliamentary seats held by women — a governance and institutional-quality measure used in ESG screening.',
    keywords: ['gender equality', 'women in parliament', 'governance', 'esg', 'representation', 'diversity'],
    sources: [WB],
  },

  // ================================================================ added: environment, food, health, defense
  'macro-forest': {
    id: 'macro-forest',
    title: 'Forest Area Report',
    category: 'environment',
    indicators: ['AG.LND.FRST.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Forest area as a share of land area — land-use change and carbon-sink capacity, reported at multi-year intervals.',
    keywords: ['forest', 'deforestation', 'land use', 'carbon sink', 'biodiversity', 'esg'],
    sources: [WB],
  },
  'macro-undernourishment': {
    id: 'macro-undernourishment',
    title: 'Undernourishment Report',
    category: 'agriculture',
    indicators: ['SN.ITK.DEFC.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Prevalence of undernourishment — the food-security stress measure, published as a model-based estimate in three-year windows.',
    keywords: ['food security', 'undernourishment', 'hunger', 'nutrition', 'crop failure', 'supply risk'],
    sources: [WB],
  },
  'macro-hospital-beds': {
    id: 'macro-hospital-beds',
    title: 'Hospital Beds and Physicians Report',
    category: 'health',
    indicators: ['SH.MED.BEDS.ZS', 'SH.MED.PHYS.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Hospital beds and physicians per 1,000 people — the physical capacity of each health system, a key pandemic-preparedness input.',
    keywords: ['hospital beds', 'physicians', 'health capacity', 'healthcare infrastructure', 'pandemic preparedness'],
    sources: [WB],
  },
  'macro-military-spend': {
    id: 'macro-military-spend',
    title: 'Military Expenditure in Dollars Report',
    category: 'defense',
    indicators: ['MS.MIL.XPND.CD', 'MS.MIL.TOTL.P1'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Military expenditure in current US dollars alongside armed-forces personnel — defence spending measured in absolute terms rather than as a GDP share.',
    keywords: ['military spending', 'defence budget dollars', 'armed forces', 'troop strength', 'arms race', 'geopolitics'],
    sources: [WB],
  },

  // ================================================================ added: cross-indicator themes
  // These combine several indicators in one document. Each one carries a pooled correlation
  // matrix between its indicators, which is the part a buyer cannot get from the source directly.
  'theme-growth-quality': {
    id: 'theme-growth-quality',
    title: 'Growth, Inflation and Unemployment — Macro Stress Report',
    category: 'macro',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Real growth, consumer-price inflation and unemployment side by side, with the pooled correlation between them — the three variables that define a stagflation or overheating call.',
    keywords: ['stagflation', 'macro stress', 'growth inflation unemployment', 'phillips curve', 'misery index', 'business cycle', 'overheating'],
    sources: [WB],
  },
  'theme-energy-transition': {
    id: 'theme-energy-transition',
    title: 'Energy Transition Scoreboard',
    category: 'energy',
    indicators: ['EG.ELC.RNEW.ZS', 'EG.USE.COMM.FO.ZS', 'EG.ELC.ACCS.ZS', 'EN.GHG.CO2.PC.CE.AR5'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Renewable generation share, fossil dependence, electricity access and CO2 intensity in one document, with the cross-indicator correlation matrix — the transition measured from four directions at once.',
    keywords: ['energy transition', 'decarbonisation', 'net zero', 'renewables', 'fossil dependence', 'co2 intensity', 'esg scoreboard', 'climate policy'],
    sources: [WB],
  },
  'theme-tech-capability': {
    id: 'theme-tech-capability',
    title: 'Technology Capability Report — Exports, Research and Infrastructure',
    category: 'innovation',
    indicators: ['TX.VAL.TECH.MF.ZS', 'IT.NET.SECR.P6', 'IP.JRN.ARTC.SC', 'IT.NET.BBND.P2'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'High-technology export share, secure-server density, scientific publication volume and broadband penetration, correlated against each other — a four-axis view of where advanced capability actually accumulates.',
    keywords: ['technology capability', 'ai capacity', 'semiconductors', 'research output', 'digital infrastructure', 'innovation index', 'tech stack'],
    sources: [WB],
  },
  'theme-fiscal-space': {
    id: 'theme-fiscal-space',
    title: 'Fiscal Space Report — Debt, Interest and Revenue',
    category: 'fiscal',
    indicators: ['GC.DOD.TOTL.GD.ZS', 'GC.XPN.INTP.ZS', 'GC.TAX.TOTL.GD.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Central government debt, the interest share of spending and tax revenue together — whether a sovereign still has room to borrow, and how much of the budget is already spoken for.',
    keywords: ['fiscal space', 'sovereign debt', 'debt service', 'tax revenue', 'austerity', 'bond risk', 'fiscal sustainability'],
    sources: [WB],
  },
  'theme-demographic-shift': {
    id: 'theme-demographic-shift',
    title: 'Demographic Shift Report — Age Structure and Growth',
    category: 'demographics',
    indicators: ['SP.POP.0014.TO.ZS', 'SP.POP.1564.TO.ZS', 'SP.POP.65UP.TO.ZS', 'SP.POP.GROW'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'The full age structure — children, working age and retired shares — plus population growth, in one document. This is the demographic dividend or drag behind every long-horizon demand forecast.',
    keywords: ['demographics', 'age structure', 'working age population', 'demographic dividend', 'dependency ratio', 'population decline', 'labour supply'],
    sources: [WB],
  },
  'theme-trade-exposure': {
    id: 'theme-trade-exposure',
    title: 'Trade Exposure Report — Flows, Intensity and Tariffs',
    category: 'trade',
    indicators: ['NE.EXP.GNFS.ZS', 'NE.IMP.GNFS.ZS', 'TM.TAX.MRCH.WM.AR.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Export and import intensity as a share of GDP alongside applied tariff rates — how exposed each economy is to cross-border trade, and how open its own border is.',
    keywords: ['trade exposure', 'tariffs', 'export intensity', 'import dependence', 'supply chain', 'protectionism', 'trade war', 'reshoring'],
    sources: [WB],
  },
  'theme-human-capital': {
    id: 'theme-human-capital',
    title: 'Human Capital Report — Education and Research Capacity',
    category: 'education',
    indicators: ['SE.TER.ENRR', 'SE.SEC.ENRR', 'GB.XPD.RSDV.GD.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Tertiary and secondary enrolment alongside research spending as a share of GDP — the pipeline that determines an economy\'s skilled-labour supply a decade out.',
    keywords: ['human capital', 'education', 'enrolment', 'research spending', 'skill supply', 'talent pipeline', 'r&d intensity'],
    sources: [WB],
  },
  'theme-inclusion-poverty': {
    id: 'theme-inclusion-poverty',
    title: 'Inclusion and Poverty Report — Income, Access and Services',
    category: 'society',
    indicators: ['SI.POV.DDAY', 'SI.POV.GINI', 'FX.OWN.TOTL.ZS', 'SH.H2O.BASW.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'premium',
    description:
      'Extreme-poverty headcount, income inequality, financial-account ownership and basic drinking-water access together — the distributional and service-access picture behind social-risk assessments.',
    keywords: ['inclusion', 'poverty', 'inequality', 'financial inclusion', 'water access', 'social risk', 'development', 'esg social'],
    sources: [WB],
  },

  // ================================================================ added: dimension completion
  // Indicators already defined and labelled in datasources.js but not yet exposed as their own
  // catalog report. Each fills a gap left by the headline report of its theme — real vs nominal
  // per-capita GDP, male/female life expectancy, agricultural land and cereal yield, basic
  // sanitation, net lending, literacy, inbound patents, digital-trade and urbanisation depth.
  'macro-real-gdp-per-capita': {
    id: 'macro-real-gdp-per-capita',
    title: 'Real GDP per Capita Report (Constant Prices)',
    category: 'output',
    indicators: ['NY.GDP.PCAP.KD'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'GDP per capita at constant 2015 US dollars — inflation-adjusted living-standard trajectory, the like-for-like complement to the nominal per-capita series.',
    keywords: ['real gdp per capita', 'constant prices', 'living standard', 'inflation adjusted income', 'real income'],
    sources: [WB],
  },
  'macro-ict-exports': {
    id: 'macro-ict-exports',
    title: 'ICT Service Exports Report',
    category: 'digital',
    indicators: ['BX.GSR.CMCP.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'ICT service exports as a share of total service exports — the weight of high-margin digital trade in each economy\'s services balance.',
    keywords: ['ict exports', 'digital trade', 'service exports', 'software exports', 'telecom exports'],
    sources: [WB],
  },
  'macro-urban-growth': {
    id: 'macro-urban-growth',
    title: 'Urban Population Growth Report',
    category: 'demographics',
    indicators: ['SP.URB.GROW'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Annual urban population growth — the pace of city expansion behind infrastructure, housing and congestion demand.',
    keywords: ['urban growth', 'urbanisation', 'city growth', 'megacity', 'urban demand'],
    sources: [WB],
  },
  'macro-life-expectancy-sex': {
    id: 'macro-life-expectancy-sex',
    title: 'Life Expectancy by Sex Report',
    category: 'health',
    indicators: ['SP.DYN.LE00.FE.IN', 'SP.DYN.LE00.MA.IN'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Life expectancy at birth for females and males separately — the gender gap in longevity that the all-sex average hides.',
    keywords: ['life expectancy female', 'life expectancy male', 'gender life gap', 'longevity', 'public health'],
    sources: [WB],
  },
  'macro-net-lending': {
    id: 'macro-net-lending',
    title: 'Government Net Lending Report',
    category: 'fiscal',
    indicators: ['GC.NLD.TOTL.GD.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'standard',
    description:
      'Net lending (+) or net borrowing (-) of general government as a percentage of GDP — the bottom-line fiscal stance after all revenue and spending.',
    keywords: ['net lending', 'fiscal balance', 'budget surplus', 'budget deficit', 'government balance'],
    sources: [WB],
  },
  'macro-literacy': {
    id: 'macro-literacy',
    title: 'Adult Literacy Report',
    category: 'education',
    indicators: ['SE.ADT.LITR.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Adult literacy rate for people aged 15 and above — the foundational human-capital gate that precedes every higher-education measure.',
    keywords: ['literacy', 'adult literacy', 'education', 'human capital', 'basic skills'],
    sources: [WB],
  },
  'macro-patents-nonresident': {
    id: 'macro-patents-nonresident',
    title: 'Nonresident Patent Applications Report',
    category: 'innovation',
    indicators: ['IP.PAT.NRES'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Patent applications filed by nonresidents — the inbound side of inventive activity, complementing the resident-applicant series as a foreign-confidence signal.',
    keywords: ['nonresident patents', 'foreign patents', 'ip filings', 'invention inflow', 'technology transfer'],
    sources: [WB],
  },
  'macro-energy-imports': {
    id: 'macro-energy-imports',
    title: 'Net Energy Import Dependence Report',
    category: 'energy',
    indicators: ['EG.IMP.CONS.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Net energy imports as a share of energy use — how much of each economy\'s energy it must source from abroad, the flip side of the fossil-dependence measure.',
    keywords: ['energy imports', 'energy dependence', 'energy security', 'imported energy'],
    sources: [WB],
  },
  'macro-agri-land': {
    id: 'macro-agri-land',
    title: 'Agricultural Land Report',
    category: 'agriculture',
    indicators: ['AG.LND.AGRI.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Agricultural land as a share of total land area — the land base available for food and fibre production, the complement to forest-area cover.',
    keywords: ['agricultural land', 'farmland', 'land use', 'arable land', 'food production base'],
    sources: [WB],
  },
  'macro-cereal-yield': {
    id: 'macro-cereal-yield',
    title: 'Cereal Yield Report',
    category: 'agriculture',
    indicators: ['AG.YLD.CREL.KG'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Cereal yield in kilograms per hectare — the productivity of the grain base that feeds most calorie supply, distinct from the food-production index.',
    keywords: ['cereal yield', 'crop yield', 'agricultural productivity', 'grain', 'food security'],
    sources: [WB],
  },
  'macro-measles-immunization': {
    id: 'macro-measles-immunization',
    title: 'Measles Immunization Report',
    category: 'health',
    indicators: ['SH.IMM.MEAS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'Measles immunization coverage among children aged 12-23 months — a frontline indicator of primary-health-system reach.',
    keywords: ['immunization', 'measles', 'vaccination', 'child health', 'preventive care'],
    sources: [WB],
  },
  'macro-sanitation': {
    id: 'macro-sanitation',
    title: 'Basic Sanitation Access Report',
    category: 'health',
    indicators: ['SH.STA.BASS.ZS'],
    countries: TOP,
    years: '2015:2025',
    tier: 'basic',
    description:
      'People using at least basic sanitation services as a share of the population — the sanitation-policy counterpart to basic drinking-water access.',
    keywords: ['sanitation', 'basic sanitation', 'water and sanitation', 'public health', 'hygiene'],
    sources: [WB],
  },

  // ================================================================ added: regional snapshots
  // Region-scoped macro panels. Each carries a `region` field so the coverage loop above leaves
  // its explicit country subset intact; an agent comparing Asian or Latin American economies gets
  // exactly that panel rather than the full twenty-economy set. Indicators are the same five
  // headline series already validated in the global theme reports, so every panel renders cleanly.
  'region-apac': {
    id: 'region-apac',
    title: 'Asia-Pacific Macro Snapshot — CN, JP, IN, KR, ID',
    category: 'regional',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: APAC,
    region: 'apac',
    years: '2015:2025',
    tier: 'premium',
    description:
      'Five-variable macro panel for the core Asia-Pacific economies — real growth, consumer inflation, unemployment, central-government debt and trade openness — the regional read behind Asia allocation and supply-chain calls.',
    keywords: ['asia pacific', 'asia macro', 'china japan india korea indonesia', 'regional snapshot', 'asian economies', 'asia allocation', 'apac'],
    sources: [WB],
  },
  'region-europe': {
    id: 'region-europe',
    title: 'Europe Macro Snapshot — DE, FR, GB, IT, ES, RU',
    category: 'regional',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: EUR,
    region: 'europe',
    years: '2015:2025',
    tier: 'premium',
    description:
      'Five-variable macro panel for the major European economies — real growth, inflation, unemployment, government debt and trade openness — the regional read behind European allocation and policy calls.',
    keywords: ['europe macro', 'eurozone', 'germany france uk italy spain russia', 'regional snapshot', 'european economies', 'europe allocation'],
    sources: [WB],
  },
  'region-latam': {
    id: 'region-latam',
    title: 'Latin America Macro Snapshot — BR, MX, AR',
    category: 'regional',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: LATAM,
    region: 'latam',
    years: '2015:2025',
    tier: 'premium',
    description:
      'Five-variable macro panel for the largest Latin American economies — real growth, inflation, unemployment, government debt and trade openness — the regional read behind LatAm allocation and commodity calls.',
    keywords: ['latin america macro', 'brazil mexico argentina', 'latam', 'regional snapshot', 'emerging markets latin', 'south america'],
    sources: [WB],
  },
  'region-em': {
    id: 'region-em',
    title: 'Emerging Markets Macro Snapshot — BR, IN, ID, TR, ZA, MX, AR, KR',
    category: 'regional',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: EM,
    region: 'em',
    years: '2015:2025',
    tier: 'premium',
    description:
      'Five-variable macro panel for the major emerging markets — real growth, inflation, unemployment, government debt and trade openness — the cross-emerging read behind EM allocation and external-vulnerability calls.',
    keywords: ['emerging markets macro', 'em snapshot', 'bric', 'frontier', 'regional snapshot', 'em allocation', 'emerging markets'],
    sources: [WB],
  },
  'region-na': {
    id: 'region-na',
    title: 'North America Macro Snapshot — US, CA, MX',
    category: 'regional',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: NA,
    region: 'na',
    years: '2015:2025',
    tier: 'premium',
    description:
      'Five-variable macro panel for North America — real growth, inflation, unemployment, government debt and trade openness across the US, Canada and Mexico, the regional read behind North American allocation and nearshoring calls.',
    keywords: ['north america macro', 'us canada mexico', 'nafta', 'usmca', 'nearshoring', 'regional snapshot', 'north america'],
    sources: [WB],
  },

  // ================================================================ added: annual editions
  // One yearbook per year, generated from a single definition so the series cannot drift apart.
  ...Object.fromEntries(
    ANNUAL_EDITION_YEARS.map((y) => {
      const from = Math.max(CATALOG_YEAR_START, y - 4);
      const def = yearbook([from, y]);
      return [def.id, def];
    }),
  ),

  // ================================================================ added: country-pair comparisons
  // Head-to-head panels for the economy pairs an agent actually screens when it allocates or
  // hedges. Each carries a `pair` marker so the coverage loop leaves its two-or-three economy
  // subset intact — the buyer sees exactly the matchup it asked about, not the full world.
  'pair-us-cn': {
    id: 'pair-us-cn',
    title: 'US vs China Macro Comparison — Growth, Inflation, Debt, Trade',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['US', 'CN'],
    pair: ['US', 'CN'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'Side-by-side macro read on the two largest economies — real growth, consumer inflation, unemployment, central-government debt and trade openness — the direct comparison behind US-China allocation, decoupling and tariff calls.',
    keywords: ['us china', 'us vs china', 'china us', 'sinomic', 'decoupling', 'tariffs', 'country comparison', 'great power competition'],
    sources: [WB],
  },
  'pair-us-jp': {
    id: 'pair-us-jp',
    title: 'US vs Japan Macro Comparison — Yield, FX and Debt',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['US', 'JP'],
    pair: ['US', 'JP'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'US-Japan in five variables — the rate-differential, yen and JGB-debt read behind FX hedging, carry trades and the world’s largest holder of US Treasuries.',
    keywords: ['us japan', 'usd jpy', 'jgb', 'japan macro', 'carry trade', 'treasuries', 'country comparison'],
    sources: [WB],
  },
  'pair-de-jp': {
    id: 'pair-de-jp',
    title: 'Germany vs Japan Macro Comparison — Two Export Powerhouses',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['DE', 'JP'],
    pair: ['DE', 'JP'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'The two surplus-export manufacturing giants side by side — growth, deflation vs inflation, labour markets and trade exposure, the comparison behind industrial and autos-sector calls.',
    keywords: ['germany japan', 'de jp', 'export model', 'manufacturing', 'deflation', 'country comparison'],
    sources: [WB],
  },
  'pair-cn-in': {
    id: 'pair-cn-in',
    title: 'China vs India Macro Comparison — Asia’s Two Giants',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['CN', 'IN'],
    pair: ['CN', 'IN'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'China and India head to head — growth trajectories, inflation regimes, jobs and trade orientation, the supply-chain and allocation read behind the "which Asia" decision.',
    keywords: ['china india', 'cn in', 'asia giants', 'supply chain', 'demographics', 'country comparison'],
    sources: [WB],
  },
  'pair-gb-eu': {
    id: 'pair-gb-eu',
    title: 'UK vs EU Core Macro Comparison — Post-Brexit',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['GB', 'DE', 'FR'],
    pair: ['GB', 'DE', 'FR'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'Britain against the Franco-German core across growth, inflation, jobs, debt and trade — the post-Brexit divergence read behind UK-vs-EU allocation and policy calls.',
    keywords: ['uk eu', 'brexit', 'uk germany france', 'europe macro', 'country comparison'],
    sources: [WB],
  },
  'pair-kr-jp': {
    id: 'pair-kr-jp',
    title: 'South Korea vs Japan Macro Comparison — East Asian Industry',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['KR', 'JP'],
    pair: ['KR', 'JP'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'Korea and Japan in five variables — the semiconductor, shipbuilding and industrial-rivalry read behind East-Asian tech and manufacturing allocation.',
    keywords: ['korea japan', 'kr jp', 'semiconductor', 'east asia', 'tech rivalry', 'country comparison'],
    sources: [WB],
  },
  'pair-br-ru': {
    id: 'pair-br-ru',
    title: 'Brazil vs Russia Macro Comparison — Commodities & Sanctions',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['BR', 'RU'],
    pair: ['BR', 'RU'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'The two sanctioned/commodity-heavy BRICS side by side — growth, inflation, jobs, debt and trade, the read behind commodity, FX and sanction-risk calls.',
    keywords: ['brazil russia', 'br ru', 'brics', 'commodities', 'sanctions', 'country comparison'],
    sources: [WB],
  },
  'pair-in-id': {
    id: 'pair-in-id',
    title: 'India vs Indonesia Macro Comparison — Emerging Asia Demographics',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['IN', 'ID'],
    pair: ['IN', 'ID'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'India and Indonesia head to head — young-population growth, inflation control, jobs and trade openness, the read behind emerging-Asia consumer and infra allocation.',
    keywords: ['india indonesia', 'in id', 'emerging asia', 'demographics', 'consumer', 'country comparison'],
    sources: [WB],
  },
  'pair-ca-au': {
    id: 'pair-ca-au',
    title: 'Canada vs Australia Macro Comparison — Resource Economies',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['CA', 'AU'],
    pair: ['CA', 'AU'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'The two resource-rich anglophone economies in five variables — commodity-cycle growth, inflation, jobs, debt and trade, the read behind mining, energy and housing calls.',
    keywords: ['canada australia', 'ca au', 'commodities', 'mining', 'housing', 'resource economy', 'country comparison'],
    sources: [WB],
  },
  'pair-us-de': {
    id: 'pair-us-de',
    title: 'US vs Germany Macro Comparison — Transatlantic Core',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['US', 'DE'],
    pair: ['US', 'DE'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'The transatlantic core — US and German growth, inflation, labour, debt and trade, the comparison behind Atlantic allocation and the EUR-USD policy spread.',
    keywords: ['us germany', 'us de', 'transatlantic', 'eur usd', 'eurozone', 'country comparison'],
    sources: [WB],
  },

  // ================================================================ added: crisis-window snapshots
  // Narrow-year panels centred on the macro shocks agents must price. Each carries a `shock`
  // marker and an explicit window inside 2015:2025, so the coverage loop leaves both the world
  // scope and the crisis years intact.
  'shock-covid': {
    id: 'shock-covid',
    title: 'COVID-19 Shock Snapshot — 2020-2021, 20 Economies',
    category: 'crisis',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: WORLD,
    shock: 'covid',
    years: '2020:2021',
    tier: 'premium',
    description:
      'The pandemic shock in five variables across twenty economies — the 2020 contraction, the 2021 rebound and the policy-debt residue — the crisis read behind pandemic-risk and recovery-trading calls.',
    keywords: ['covid', 'pandemic', '2020 recession', 'covid recovery', 'crisis', 'economic shock', 'recession'],
    sources: [WB],
  },
  'shock-inflation': {
    id: 'shock-inflation',
    title: 'Global Inflation Shock Snapshot — 2021-2023, 20 Economies',
    category: 'crisis',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: WORLD,
    shock: 'inflation',
    years: '2021:2023',
    tier: 'premium',
    description:
      'The 2021-2023 inflation surge in five variables across twenty economies — the spike, the labour-market squeeze and the policy-debt build, the crisis read behind rate-path and real-asset calls.',
    keywords: ['inflation shock', '2022 inflation', 'cost of living', 'rate hikes', 'crisis', 'economic shock'],
    sources: [WB],
  },
  'shock-commodity': {
    id: 'shock-commodity',
    title: 'Commodity & Energy Shock Snapshot — 2022, 20 Economies',
    category: 'crisis',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: WORLD,
    shock: 'commodity',
    years: '2022:2022',
    tier: 'premium',
    description:
      'The 2022 energy-and-food shock in five variables across twenty economies — the growth hit, the inflation overshoot and the trade-balance swing, the crisis read behind energy, grain and EM-current-account calls.',
    keywords: ['commodity shock', 'energy crisis', '2022', 'food prices', 'oil', 'crisis', 'economic shock'],
    sources: [WB],
  },

  // ================================================================ added: more country-pairs (batch 2)
  'pair-uk-us': {
    id: 'pair-uk-us',
    title: 'UK vs US Macro Comparison — Services, FX and Rates',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['GB', 'US'],
    pair: ['GB', 'US'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'The UK and US side by side — services weight, sterling-dollar and rate divergence, the comparison behind London-New York capital flows and GBP-USD calls.',
    keywords: ['uk us', 'britain america', 'gbp usd', 'london new york', 'country comparison'],
    sources: [WB],
  },
  'pair-fr-de': {
    id: 'pair-fr-de',
    title: 'France vs Germany Macro Comparison — Eurozone Core Split',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['FR', 'DE'],
    pair: ['FR', 'DE'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'The two eurozone core economies side by side — growth, inflation and fiscal stance, the comparison behind ECB policy and core-periphery spread calls.',
    keywords: ['france germany', 'fr de', 'eurozone', 'ecb', 'country comparison'],
    sources: [WB],
  },
  'pair-in-us': {
    id: 'pair-in-us',
    title: 'India vs US Macro Comparison — Growth vs Yield',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['IN', 'US'],
    pair: ['IN', 'US'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'India and the US side by side — the high-growth EM versus the reserve-currency anchor, the comparison behind offshore-IT, demographic and allocation calls.',
    keywords: ['india us', 'in us', 'emerging vs developed', 'demographics', 'country comparison'],
    sources: [WB],
  },
  'pair-br-in': {
    id: 'pair-br-in',
    title: 'Brazil vs India Macro Comparison — Two Giants',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['BR', 'IN'],
    pair: ['BR', 'IN'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'The two large emerging consumers side by side — commodity exporter versus services outsourcer, the comparison behind BRICS, FX and growth-rotation calls.',
    keywords: ['brazil india', 'br in', 'brics', 'emerging markets', 'country comparison'],
    sources: [WB],
  },
  'pair-mx-us': {
    id: 'pair-mx-us',
    title: 'Mexico vs US Macro Comparison — Nearshoring',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['MX', 'US'],
    pair: ['MX', 'US'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'Mexico and the US side by side — nearshoring, USMCA trade and remittance flows, the comparison behind near-shoring and peso-carry calls.',
    keywords: ['mexico us', 'mx us', 'nearshoring', 'usmca', 'country comparison'],
    sources: [WB],
  },
  'pair-au-cn': {
    id: 'pair-au-cn',
    title: 'Australia vs China Macro Comparison — Resource Dependence',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['AU', 'CN'],
    pair: ['AU', 'CN'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'Australia and China side by side — the resource-supplying neighbour versus its largest customer, the comparison behind iron-ore, commodity and AUD-USD calls.',
    keywords: ['australia china', 'au cn', 'iron ore', 'commodity trade', 'country comparison'],
    sources: [WB],
  },
  'pair-za-cn': {
    id: 'pair-za-cn',
    title: 'South Africa vs China Macro Comparison — BRICS Trade',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['ZA', 'CN'],
    pair: ['ZA', 'CN'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'South Africa and China side by side — commodity supplier versus BRICS anchor, the comparison behind EM-current-account and resource-flow calls.',
    keywords: ['south africa china', 'za cn', 'brics', 'commodity', 'country comparison'],
    sources: [WB],
  },
  'pair-ca-us': {
    id: 'pair-ca-us',
    title: 'Canada vs US Macro Comparison — Integrated North America',
    category: 'comparison',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: ['CA', 'US'],
    pair: ['CA', 'US'],
    years: '2015:2025',
    tier: 'premium',
    description:
      'Canada and the US side by side — integrated trade, energy exports and rate co-movement, the comparison behind USMCA, CAD-USD and cross-border calls.',
    keywords: ['canada us', 'ca us', 'usmca', 'energy trade', 'country comparison'],
    sources: [WB],
  },

  // ================================================================ added: more crisis windows (batch 2)
  'shock-banking-2023': {
    id: 'shock-banking-2023',
    title: 'Banking Stress Snapshot — 2023, 20 Economies',
    category: 'crisis',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: WORLD,
    shock: 'banking-2023',
    years: '2023:2023',
    tier: 'premium',
    description:
      'The 2023 banking stress — SVB, Credit Suisse and the rate-driven deposit run — in five variables across twenty economies, the crisis read behind financial-stability and rate-path calls.',
    keywords: ['banking crisis', 'svb', 'credit suisse', '2023', 'regional banks', 'crisis'],
    sources: [WB],
  },
  'shock-rate-2022': {
    id: 'shock-rate-2022',
    title: 'Rate-Hike Shock Snapshot — 2022-2023, 20 Economies',
    category: 'crisis',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: WORLD,
    shock: 'rate-2022',
    years: '2022:2023',
    tier: 'premium',
    description:
      'The 2022-2023 global tightening in five variables across twenty economies — the fastest hike cycle in decades, the bond drawdown and the growth squeeze, the read behind duration and FX calls.',
    keywords: ['rate hikes', '2022 rates', 'fed', 'ecb', 'tightening', 'crisis'],
    sources: [WB],
  },
  'shock-brexit': {
    id: 'shock-brexit',
    title: 'Brexit Transition Snapshot — 2016-2020, 20 Economies',
    category: 'crisis',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: WORLD,
    shock: 'brexit',
    years: '2016:2020',
    tier: 'premium',
    description:
      'The Brexit vote through transition in five variables across twenty economies — sterling, trade reorientation and the UK-EU divergence, the read behind UK-asset and trade-policy calls.',
    keywords: ['brexit', 'uk eu', 'trade divergence', '2016', 'sovereignty'],
    sources: [WB],
  },
  'shock-tradewar-2018': {
    id: 'shock-tradewar-2018',
    title: 'US-China Trade War Snapshot — 2018-2019, 20 Economies',
    category: 'crisis',
    indicators: ['NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'NE.TRD.GNFS.ZS'],
    countries: WORLD,
    shock: 'tradewar-2018',
    years: '2018:2019',
    tier: 'premium',
    description:
      'The 2018-2019 US-China tariff escalation in five variables across twenty economies — the supply-chain reroute, the export hit and the trade-balance swing, the read behind tariff and friend-shoring calls.',
    keywords: ['trade war', 'tariffs', 'us china', '2018', 'supply chain'],
    sources: [WB],
  },

  // ================================================================ added: single-indicator panels (basic tier, low-price funnel)
  'indicator-inflation': {
    id: 'indicator-inflation',
    title: 'Global Inflation Panel — CPI, 20 Economies 2015-2025',
    category: 'indicator',
    indicators: ['FP.CPI.TOTL.ZG'],
    years: '2015:2025',
    tier: 'basic',
    description:
      'A single-indicator, twenty-economy panel of consumer inflation (CPI, percent YoY) from 2015 to 2025 — the cheapest way to screen global price pressure before buying a wider report.',
    keywords: ['inflation', 'cpi', 'consumer prices', 'global inflation'],
    sources: [WB],
  },
  'indicator-gdp': {
    id: 'indicator-gdp',
    title: 'Global Growth Panel — Real GDP, 20 Economies 2015-2025',
    category: 'indicator',
    indicators: ['NY.GDP.MKTP.KD.ZG'],
    years: '2015:2025',
    tier: 'basic',
    description:
      'A single-indicator, twenty-economy panel of real GDP growth (percent YoY) from 2015 to 2025 — the cheapest screen of global growth before a wider purchase.',
    keywords: ['gdp', 'real growth', 'economic growth', 'global gdp'],
    sources: [WB],
  },
  'indicator-debt': {
    id: 'indicator-debt',
    title: 'Global Debt Panel — Govt Debt/GDP, 20 Economies 2015-2025',
    category: 'indicator',
    indicators: ['GC.DOD.TOTL.GD.ZS'],
    years: '2015:2025',
    tier: 'basic',
    description:
      'A single-indicator, twenty-economy panel of central-government debt (percent of GDP) from 2015 to 2025 — the cheapest sovereign-risk screen before a wider purchase.',
    keywords: ['government debt', 'debt gdp', 'sovereign', 'fiscal'],
    sources: [WB],
  },
  'indicator-trade': {
    id: 'indicator-trade',
    title: 'Global Trade Panel — Trade Openness, 20 Economies 2015-2025',
    category: 'indicator',
    indicators: ['NE.TRD.GNFS.ZS'],
    years: '2015:2025',
    tier: 'basic',
    description:
      'A single-indicator, twenty-economy panel of trade openness (trade percent of GDP) from 2015 to 2025 — the cheapest external-exposure screen before a wider purchase.',
    keywords: ['trade', 'trade openness', 'exports imports', 'current account'],
    sources: [WB],
  },
  'indicator-unemployment': {
    id: 'indicator-unemployment',
    title: 'Global Unemployment Panel — 20 Economies 2015-2025',
    category: 'indicator',
    indicators: ['SL.UEM.TOTL.ZS'],
    years: '2015:2025',
    tier: 'basic',
    description:
      'A single-indicator, twenty-economy panel of unemployment (percent of labour force) from 2015 to 2025 — the cheapest labour-market screen before a wider purchase.',
    keywords: ['unemployment', 'jobless', 'labour market'],
    sources: [WB],
  },
};

// Coverage is assigned rather than hand-written on every entry, so a report added later cannot
// silently ship coverage its own data cannot fill. A report is widened to the twenty-economy set
// only if every indicator it sells is dense enough for that set; the moment one thin indicator is
// involved the whole report stays at ten, so its tables remain comparable row-for-row.
for (const report of Object.values(CATALOG)) {
  if (report.region || report.pair || report.shock) continue; // scoped reports keep their explicit country subset
  report.countries = report.indicators.some((code) => THIN_INDICATORS.has(code)) ? TOP : WORLD;
}

// Parameterised products. These are not fixed report ids: the buyer supplies the parameters
// and the price is computed from the size of the request.
export const PRODUCTS = {
  custom: {
    id: 'custom',
    endpoint: '/report/custom',
    title: 'Custom Report — Build Your Own',
    description:
      'Request any combination of supported indicators, economies and years. Priced by request size, so a single-indicator slice is cheap and a wide panel costs more.',
    pricingFormula:
      'USD 0.10 base + 0.03 per indicator + 0.01 per economy, times a data-freshness factor, clamped to [0.20, 0.95]. The ceiling is the per-payment spend cap the x402 buyer libraries apply by default, so no product is ever priced above what a default-configured agent can pay. The exact amount is quoted in every 402 response.',
    queryParams: {
      indicators: 'comma-separated World Bank indicator codes, or "all" (default: NY.GDP.MKTP.CD)',
      countries: 'comma-separated ISO-2 economy codes, or "all" (default: the twenty economies the catalog reports cover)',
      years: 'inclusive range "YYYY:YYYY" (default: 2015:2025)',
      format: 'html (default), json or csv — see /schema/report.json',
      title: 'optional report title override',
    },
  },
  bundle: {
    id: 'bundle',
    endpoint: '/report/bundle',
    title: 'Full Catalog Bundle — best value',
    description:
      'Every catalog report in a single document for ONE x402 payment — the highest-value purchase in the store. It costs a fraction of buying the reports separately and unlocks the entire dataset (all economies, all years, all indicators) with one signed USDC transfer. Available as html or json. Pass ?category= to take one theme at a lower price.',
  },
};

// Delivery formats every paid endpoint accepts. Named here so the catalog, the OpenAPI document,
// the discovery manifests and the Bazaar extension all state the same thing.
// Delivery formats. `summary-csv` is the same data as `csv` but pivoted to one row per economy
// carrying the derived metrics, which is what an agent wants when it is comparing rather than
// plotting. It is listed as a separate format because that is how a buyer will ask for it.
export const FORMATS = ['html', 'json', 'csv', 'summary-csv'];

// Categories are derived from the catalog rather than maintained separately, so a new report
// cannot silently fall outside the category index.
export const CATEGORIES = [...new Set(Object.values(CATALOG).map((r) => r.category))].sort();

// The widest years window any report can answer for. The year index below is clamped to it, so a
// yearbook whose window starts earlier than 2015 can never advertise a year the other reports — or
// the upstream data — cannot cover.
export const CATALOG_YEARS = `${CATALOG_YEAR_START}:${CATALOG_YEAR_END}`;

// Every year the catalog can answer for, oldest first.
export const CATALOG_YEAR_LIST = Array.from(
  { length: CATALOG_YEAR_END - CATALOG_YEAR_START + 1 },
  (_, i) => CATALOG_YEAR_START + i,
);

// The inclusive year window a single report covers, as [from, to].
export function reportWindow(def) {
  const [a, b] = String(def.years).split(':').map(Number);
  return [a, b];
}

// report ids grouped by every year they cover. A report spanning 2015-2025 appears under all eleven
// years, which is the honest answer: it does contain a 2017 figure, and an agent that asks for 2017
// should be able to find it by year rather than by guessing a topic id.
export function yearIndex() {
  const idx = Object.fromEntries(CATALOG_YEAR_LIST.map((y) => [y, []]));
  for (const [id, def] of Object.entries(CATALOG)) {
    const [a, b] = reportWindow(def);
    for (let y = Math.max(a, CATALOG_YEAR_START); y <= Math.min(b, CATALOG_YEAR_END); y++) {
      idx[y].push(id);
    }
  }
  return idx;
}

// The yearbook ids, oldest first — the reports that answer for one year specifically.
export const ANNUAL_EDITION_IDS = ANNUAL_EDITION_YEARS.map((y) => `yearbook-${y}`).filter((id) => CATALOG[id]);

// One entry per year: how many reports cover it, which yearbook (if any) is themed on it, and the
// exact endpoints to fetch. This is the payload behind /years and /years/{year}.
export function listYears() {
  const idx = yearIndex();
  return CATALOG_YEAR_LIST.map((year) => {
    const ids = idx[year];
    const edition = CATALOG[`yearbook-${year}`];
    return {
      year,
      reports: ids.length,
      yearbook: edition ? `yearbook-${year}` : null,
      yearbookTitle: edition ? edition.title : null,
      yearbookWindow: edition ? edition.years : null,
      firstYearOf: ids.filter((id) => reportWindow(CATALOG[id])[0] === year).length,
      categories: [...new Set(ids.map((id) => CATALOG[id].category))].sort(),
    };
  });
}

export function listCatalog() {
  return Object.values(CATALOG).map((r) => {
    const [yearFrom, yearTo] = reportWindow(r);
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      tier: r.tier,
      description: r.description,
      keywords: r.keywords,
      indicators: r.indicators,
      countries: r.countries,
      years: r.years,
      // The window stated twice on purpose: `years` is what the upstream query uses, the two
      // integers are what a filter or a year index can compare against without parsing a string.
      yearFrom,
      yearTo,
      sources: r.sources,
      formats: FORMATS,
      // Counted without fetching: the panel size a buyer is paying for.
      requestedCells: r.indicators.length * r.countries.length * (yearTo - yearFrom + 1),
    };
  });
}

export function listIndicators() {
  return Object.entries(INDICATORS).map(([code, label]) => ({
    code,
    label,
    kind: INDICATOR_KIND[code] || 'pct',
    theme: INDICATOR_THEME[code] || 'other',
    polarity: INDICATOR_POLARITY[code] || 'neutral',
    sparseNote: INDICATOR_SPARSE[code] || null,
  }));
}

export function indicatorThemes() {
  const out = {};
  for (const [code, theme] of Object.entries(INDICATOR_THEME)) {
    (out[theme] = out[theme] || []).push(code);
  }
  return out;
}

export const ALL_INDICATOR_CODES = Object.keys(INDICATORS);
export const DEFAULT_COUNTRIES = WORLD;
export const EXTENDED_COUNTRIES = [...new Set(G20)];
