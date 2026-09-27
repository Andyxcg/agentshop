// datasources.js — adapter layer over free, commercially-usable data sources.
// Primary source: World Bank Open Data (CC BY 4.0, no auth, commercially usable with attribution).

const WB = 'https://api.worldbank.org/v2';

// Indicator code -> human label. Labels are phrased the way an agent's retrieval step would
// describe the series, not the way the source names its database columns.
export const INDICATORS = {
  // ---- output & growth
  'NY.GDP.MKTP.CD': 'GDP (current US$)',
  'NY.GDP.MKTP.KD': 'GDP (constant 2015 US$)',
  'NY.GDP.MKTP.PP.CD': 'GDP, PPP (current international $)',
  'NY.GDP.PCAP.CD': 'GDP per capita (current US$)',
  'NY.GDP.PCAP.KD': 'GDP per capita (constant 2015 US$)',
  'NY.GNP.PCAP.CD': 'GNI per capita, Atlas method (current US$)',
  'NY.GDP.MKTP.KD.ZG': 'GDP growth (annual %)',
  'NY.GDP.DEFL.KD.ZG': 'Inflation, GDP deflator (annual %)',
  // ---- prices & money
  'FP.CPI.TOTL.ZG': 'Inflation, consumer prices (annual %)',
  'PA.NUS.FCRF': 'Official exchange rate (LCU per US$, period average)',
  'FS.AST.PRVT.GD.ZS': 'Domestic credit to private sector (% of GDP)',
  'CM.MKT.LCAP.CD': 'Market capitalization of listed companies (current US$)',
  'GC.DOD.TOTL.GD.ZS': 'Central government debt, total (% of GDP)',
  // ---- external sector
  'NE.EXP.GNFS.CD': 'Exports of goods and services (current US$)',
  'NE.EXP.GNFS.ZS': 'Exports of goods and services (% of GDP)',
  'NE.IMP.GNFS.CD': 'Imports of goods and services (current US$)',
  'NE.IMP.GNFS.ZS': 'Imports of goods and services (% of GDP)',
  'NE.TRD.GNFS.ZS': 'Trade (% of GDP)',
  'BN.CAB.XOKA.CD': 'Current account balance (current US$)',
  'BX.KLT.DINV.CD.WD': 'Foreign direct investment, net inflows (current US$)',
  'BX.GSR.CMCP.ZS': 'ICT service exports (% of service exports)',
  'BX.GSR.TRVL.ZS': 'International tourism, receipts (% of total exports)',
  'BX.TRF.PWKR.CD.DT': 'Personal remittances, received (current US$)',
  'DT.DOD.DECT.CD': 'External debt stocks, public and publicly guaranteed (current US$)',
  'TM.TAX.MRCH.WM.AR.ZS': 'Tariff rate, applied, weighted mean, all products (%)',
  // ---- labor & society
  'SP.POP.TOTL': 'Total population',
  'SP.POP.GROW': 'Population growth (annual %)',
  'SP.URB.GROW': 'Urban population growth (annual %)',
  'SP.URB.TOTL.IN.ZS': 'Urban population (% of total population)',
  'SP.POP.0014.TO.ZS': 'Population ages 0-14 (% of total)',
  'SP.POP.1564.TO.ZS': 'Population ages 15-64 (% of total)',
  'SP.POP.65UP.TO.ZS': 'Population ages 65 and above (% of total)',
  'SP.DYN.LE00.IN': 'Life expectancy at birth, total (years)',
  'SP.DYN.LE00.FE.IN': 'Life expectancy at birth, female (years)',
  'SP.DYN.LE00.MA.IN': 'Life expectancy at birth, male (years)',
  'SP.DYN.TFRT.IN': 'Fertility rate (births per woman)',
  'SL.UEM.TOTL.ZS': 'Unemployment, total (% of labor force)',
  'SL.TLF.CACT.ZS': 'Labor force participation rate (% of population 15+)',
  'SH.DYN.MORT': 'Mortality rate, under-5 (per 1,000 live births)',
  'SI.POV.GINI': 'Gini index (0-100)',
  'SI.POV.DDAY': 'Poverty headcount ratio at $2.15 a day (2017 PPP, % of population)',
  'FX.OWN.TOTL.ZS': 'Account ownership at a financial institution (% of population 15+)',
  'SG.GEN.PARL.ZS': 'Proportion of seats held by women in national parliaments (%)',
  // ---- structure of the economy
  'NV.AGR.TOTL.ZS': 'Agriculture, forestry and fishing value added (% of GDP)',
  'NV.IND.TOTL.ZS': 'Industry value added (% of GDP)',
  'NV.SRV.TOTL.ZS': 'Services value added (% of GDP)',
  // ---- fiscal
  'GC.TAX.TOTL.GD.ZS': 'Tax revenue (% of GDP)',
  'GC.XPN.INTP.ZS': 'Interest payments (% of expense)',
  'GC.NLD.TOTL.GD.ZS': 'Net lending (+) / net borrowing (-) (% of GDP)',
  'SE.XPD.TOTL.GD.ZS': 'Government expenditure on education (% of GDP)',
  // ---- education & innovation
  'SE.SEC.ENRR': 'School enrolment, secondary (% gross)',
  'SE.TER.ENRR': 'School enrolment, tertiary (% gross)',
  'SE.ADT.LITR.ZS': 'Adult literacy rate (% of people ages 15 and above)',
  'GB.XPD.RSDV.GD.ZS': 'Research and development expenditure (% of GDP)',
  'IP.PAT.RESD': 'Patent applications, residents',
  'IP.PAT.NRES': 'Patent applications, nonresidents',
  'IP.JRN.ARTC.SC': 'Scientific and technical journal articles',
  'TX.VAL.TECH.MF.ZS': 'High-technology exports (% of manufactured exports)',
  // ---- energy & environment
  'EG.USE.PCAP.KG.OE': 'Energy use (kg of oil equivalent per capita)',
  'EG.USE.COMM.FO.ZS': 'Fossil fuel energy consumption (% of total)',
  'EG.FEC.RNEW.ZS': 'Renewable energy consumption (% of final energy use)',
  'EG.ELC.RNEW.ZS': 'Renewable electricity output (% of total electricity output)',
  'EG.ELC.ACCS.ZS': 'Access to electricity (% of population)',
  'EG.IMP.CONS.ZS': 'Energy imports, net (% of energy use)',
  'EN.GHG.CO2.PC.CE.AR5': 'CO2 emissions per capita (t CO2e)',
  'EN.ATM.PM25.MC.M3': 'PM2.5 air pollution (micrograms per cubic meter)',
  'ER.H2O.FWTL.ZS': 'Freshwater withdrawal (% of internal resources)',
  'AG.LND.FRST.ZS': 'Forest area (% of land area)',
  'AG.LND.AGRI.ZS': 'Agricultural land (% of land area)',
  // ---- food & agriculture
  'AG.PRD.FOOD.XD': 'Food production index (2014-2016 = 100)',
  'AG.YLD.CREL.KG': 'Cereal yield (kg per hectare)',
  'SN.ITK.DEFC.ZS': 'Prevalence of undernourishment (% of population)',
  // ---- health
  'SH.XPD.CHEX.GD.ZS': 'Current health expenditure (% of GDP)',
  'SH.MED.BEDS.ZS': 'Hospital beds (per 1,000 people)',
  'SH.MED.PHYS.ZS': 'Physicians (per 1,000 people)',
  'SH.IMM.MEAS': 'Immunization, measles (% of children ages 12-23 months)',
  'SH.H2O.BASW.ZS': 'People using at least basic drinking water services (% of population)',
  'SH.STA.BASS.ZS': 'People using at least basic sanitation services (% of population)',
  // ---- defense
  'MS.MIL.XPND.GD.ZS': 'Military expenditure (% of GDP)',
  'MS.MIL.XPND.CD': 'Military expenditure (current US$)',
  'MS.MIL.TOTL.P1': 'Armed forces personnel, total',
  // ---- digital & infrastructure
  'IT.NET.USER.ZS': 'Individuals using the Internet (% of population)',
  'IT.NET.BBND.P2': 'Fixed broadband subscriptions (per 100 people)',
  'IT.NET.SECR.P6': 'Secure Internet servers (per 1 million people)',
  'IT.CEL.SETS.P2': 'Mobile cellular subscriptions (per 100 people)',
  'TG.VAL.TOTL.GD.ZS': 'Merchandise trade (% of GDP)',
};

// Measurement kind drives formatting and whether a "share of total" column is meaningful.
//   usd   — absolute money amount (share of group total is meaningful)
//   count — absolute headcount (share of group total is meaningful)
//   pct   — already a percentage or a ratio (no share column)
//   index — index number or a per-capita/per-unit rate (no share column)
export const INDICATOR_KIND = {
  'NY.GDP.MKTP.CD': 'usd',
  'NY.GDP.MKTP.KD': 'usd',
  'NY.GDP.MKTP.PP.CD': 'usd',
  'NY.GDP.PCAP.CD': 'usd',
  'NY.GDP.PCAP.KD': 'usd',
  'NY.GNP.PCAP.CD': 'usd',
  'NY.GDP.MKTP.KD.ZG': 'pct',
  'NY.GDP.DEFL.KD.ZG': 'pct',
  'FP.CPI.TOTL.ZG': 'pct',
  'PA.NUS.FCRF': 'pct',
  'FS.AST.PRVT.GD.ZS': 'pct',
  'CM.MKT.LCAP.CD': 'usd',
  'GC.DOD.TOTL.GD.ZS': 'pct',
  'NE.EXP.GNFS.CD': 'usd',
  'NE.EXP.GNFS.ZS': 'pct',
  'NE.IMP.GNFS.CD': 'usd',
  'NE.IMP.GNFS.ZS': 'pct',
  'NE.TRD.GNFS.ZS': 'pct',
  'BN.CAB.XOKA.CD': 'usd',
  'BX.KLT.DINV.CD.WD': 'usd',
  'BX.GSR.CMCP.ZS': 'pct',
  'BX.GSR.TRVL.ZS': 'pct',
  'BX.TRF.PWKR.CD.DT': 'usd',
  'DT.DOD.DECT.CD': 'usd',
  'TM.TAX.MRCH.WM.AR.ZS': 'pct',
  'SP.POP.TOTL': 'count',
  'SP.POP.GROW': 'pct',
  'SP.URB.GROW': 'pct',
  'SP.URB.TOTL.IN.ZS': 'pct',
  'SP.POP.0014.TO.ZS': 'pct',
  'SP.POP.1564.TO.ZS': 'pct',
  'SP.POP.65UP.TO.ZS': 'pct',
  'SP.DYN.LE00.IN': 'index',
  'SP.DYN.LE00.FE.IN': 'index',
  'SP.DYN.LE00.MA.IN': 'index',
  'SP.DYN.TFRT.IN': 'index',
  'SL.UEM.TOTL.ZS': 'pct',
  'SL.TLF.CACT.ZS': 'pct',
  'SH.DYN.MORT': 'index',
  'SI.POV.GINI': 'index',
  'SI.POV.DDAY': 'pct',
  'FX.OWN.TOTL.ZS': 'pct',
  'SG.GEN.PARL.ZS': 'pct',
  'NV.AGR.TOTL.ZS': 'pct',
  'NV.IND.TOTL.ZS': 'pct',
  'NV.SRV.TOTL.ZS': 'pct',
  'GC.TAX.TOTL.GD.ZS': 'pct',
  'GC.XPN.INTP.ZS': 'pct',
  'GC.NLD.TOTL.GD.ZS': 'pct',
  'SE.XPD.TOTL.GD.ZS': 'pct',
  'SE.SEC.ENRR': 'pct',
  'SE.TER.ENRR': 'pct',
  'SE.ADT.LITR.ZS': 'pct',
  'GB.XPD.RSDV.GD.ZS': 'pct',
  'IP.PAT.RESD': 'count',
  'IP.PAT.NRES': 'count',
  'IP.JRN.ARTC.SC': 'count',
  'TX.VAL.TECH.MF.ZS': 'pct',
  'EG.USE.PCAP.KG.OE': 'index',
  'EG.USE.COMM.FO.ZS': 'pct',
  'EG.FEC.RNEW.ZS': 'pct',
  'EG.ELC.RNEW.ZS': 'pct',
  'EG.ELC.ACCS.ZS': 'pct',
  'EG.IMP.CONS.ZS': 'pct',
  'EN.GHG.CO2.PC.CE.AR5': 'index',
  'EN.ATM.PM25.MC.M3': 'index',
  'ER.H2O.FWTL.ZS': 'pct',
  'AG.LND.FRST.ZS': 'pct',
  'AG.LND.AGRI.ZS': 'pct',
  'AG.PRD.FOOD.XD': 'index',
  'AG.YLD.CREL.KG': 'index',
  'SN.ITK.DEFC.ZS': 'pct',
  'SH.XPD.CHEX.GD.ZS': 'pct',
  'SH.MED.BEDS.ZS': 'index',
  'SH.MED.PHYS.ZS': 'index',
  'SH.IMM.MEAS': 'pct',
  'SH.H2O.BASW.ZS': 'pct',
  'SH.STA.BASS.ZS': 'pct',
  'MS.MIL.XPND.GD.ZS': 'pct',
  'MS.MIL.XPND.CD': 'usd',
  'MS.MIL.TOTL.P1': 'count',
  'IT.NET.USER.ZS': 'pct',
  'IT.NET.BBND.P2': 'index',
  'IT.NET.SECR.P6': 'index',
  'IT.CEL.SETS.P2': 'index',
  'TG.VAL.TOTL.GD.ZS': 'pct',
};

// Indicators where a rising value is adverse — drives chart colour and the summary wording.
// This is a presentation hint, not a value judgement about any economy.
export const INDICATOR_POLARITY = {
  'PA.NUS.FCRF': 'inverse', // rising = local currency depreciation
  'SL.UEM.TOTL.ZS': 'inverse',
  'SH.DYN.MORT': 'inverse',
  'SI.POV.DDAY': 'inverse',
  'SN.ITK.DEFC.ZS': 'inverse',
  'EG.USE.COMM.FO.ZS': 'inverse',
  'EN.GHG.CO2.PC.CE.AR5': 'inverse',
  'EN.ATM.PM25.MC.M3': 'inverse',
  'ER.H2O.FWTL.ZS': 'inverse',
  'FP.CPI.TOTL.ZG': 'inverse',
  'TM.TAX.MRCH.WM.AR.ZS': 'inverse', // higher applied tariffs = more restrictive trade
  'GC.XPN.INTP.ZS': 'inverse', // more of the budget consumed by interest
};

// Series the source publishes sparsely, with a lag, or only for a subset of economies.
// Surfaced in reports and in /indicators so a buyer knows the coverage before paying.
export const INDICATOR_SPARSE = {
  'SI.POV.GINI': 'Survey-based; typically 1-2 observations per decade per economy.',
  'SI.POV.DDAY': 'Survey-based; published in irregular waves, not annually.',
  'SE.ADT.LITR.ZS': 'Census/survey-based; many economies have no observation in this range.',
  'FX.OWN.TOTL.ZS': 'Survey-based (Global Findex); available only in survey years.',
  'GC.DOD.TOTL.GD.ZS': 'Reported only by economies with a published central-government debt series.',
  'GC.XPN.INTP.ZS': 'Reported only by economies with an IMF-format central-government finance series.',
  'GC.NLD.TOTL.GD.ZS': 'Reported only by economies with an IMF-format central-government finance series.',
  'TM.TAX.MRCH.WM.AR.ZS': 'Reported intermittently; the newest year often lags the reporting period.',
  'IP.PAT.NRES': 'Registry-based; publication lags and coverage varies by economy.',
  'IP.JRN.ARTC.SC': 'Bibliometric count; publication lags by two to three years.',
  'MS.MIL.TOTL.P1': 'SIPRI series; published with a lag and definitional breaks.',
  'SH.MED.BEDS.ZS': 'Health-system registry; reported in irregular years for many economies.',
  'SH.MED.PHYS.ZS': 'Health-system registry; reported in irregular years for many economies.',
  'AG.LND.FRST.ZS': 'Land-cover series; reported at multi-year intervals.',
  'AG.LND.AGRI.ZS': 'Land-cover series; reported at multi-year intervals.',
  'EG.ELC.RNEW.ZS': 'Energy-balance series; published with a lag of several years.',
  'EG.USE.COMM.FO.ZS': 'Energy-balance series; published with a lag of several years.',
  'EG.IMP.CONS.ZS': 'Energy-balance series; published with a lag of several years.',
  'SN.ITK.DEFC.ZS': 'Model-based FAO estimate, published in three-year windows.',
  'SH.IMM.MEAS': 'Reported via WHO/UNICEF estimates with a lag.',
};

// Indicators that are themselves rates of change rather than levels.
//
// This flags a category error the report engine must not commit: compounding a growth rate is
// meaningless. "GDP growth fell from 6.9% to 5.0%" is a two-percentage-point decline, not a −3.4%
// annual compound rate — yet the ordinary CAGR formula will happily produce that number and a
// reader will believe it. For these indicators the engine reports the average level, the change in
// percentage points, and the trend in percentage points per year, and suppresses CAGR and the
// growth index entirely.
export const INDICATOR_IS_RATE = {
  'NY.GDP.MKTP.KD.ZG': true, // GDP growth
  'NY.GDP.DEFL.KD.ZG': true, // GDP deflator inflation
  'FP.CPI.TOTL.ZG': true, // consumer-price inflation
  'SP.POP.GROW': true, // population growth
  'SP.URB.GROW': true, // urban population growth
};

// Theme grouping. Powers the /indicators listing and the sitemap, and gives the discovery
// layer a second axis to match a query on beyond the per-report keyword list.
export const INDICATOR_THEME = {
  'NY.GDP.MKTP.CD': 'output', 'NY.GDP.MKTP.KD': 'output', 'NY.GDP.MKTP.PP.CD': 'output',
  'NY.GDP.PCAP.CD': 'output', 'NY.GDP.PCAP.KD': 'output', 'NY.GNP.PCAP.CD': 'output',
  'NY.GDP.MKTP.KD.ZG': 'output', 'NY.GDP.DEFL.KD.ZG': 'prices',
  'FP.CPI.TOTL.ZG': 'prices', 'PA.NUS.FCRF': 'prices',
  'FS.AST.PRVT.GD.ZS': 'finance', 'CM.MKT.LCAP.CD': 'finance', 'GC.DOD.TOTL.GD.ZS': 'fiscal',
  'NE.EXP.GNFS.CD': 'external', 'NE.EXP.GNFS.ZS': 'external', 'NE.IMP.GNFS.CD': 'external',
  'NE.IMP.GNFS.ZS': 'external', 'NE.TRD.GNFS.ZS': 'external', 'BN.CAB.XOKA.CD': 'external',
  'BX.KLT.DINV.CD.WD': 'investment', 'BX.GSR.CMCP.ZS': 'digital', 'BX.GSR.TRVL.ZS': 'trade',
  'BX.TRF.PWKR.CD.DT': 'external', 'DT.DOD.DECT.CD': 'fiscal', 'TM.TAX.MRCH.WM.AR.ZS': 'trade',
  'SP.POP.TOTL': 'demographics', 'SP.POP.GROW': 'demographics', 'SP.URB.GROW': 'demographics',
  'SP.URB.TOTL.IN.ZS': 'demographics', 'SP.POP.0014.TO.ZS': 'demographics',
  'SP.POP.1564.TO.ZS': 'demographics', 'SP.POP.65UP.TO.ZS': 'demographics',
  'SP.DYN.LE00.IN': 'health', 'SP.DYN.LE00.FE.IN': 'health', 'SP.DYN.LE00.MA.IN': 'health',
  'SP.DYN.TFRT.IN': 'demographics', 'SL.UEM.TOTL.ZS': 'labor', 'SL.TLF.CACT.ZS': 'labor',
  'SH.DYN.MORT': 'health', 'SI.POV.GINI': 'society', 'SI.POV.DDAY': 'society',
  'FX.OWN.TOTL.ZS': 'society', 'SG.GEN.PARL.ZS': 'society',
  'NV.AGR.TOTL.ZS': 'structure', 'NV.IND.TOTL.ZS': 'structure', 'NV.SRV.TOTL.ZS': 'structure',
  'GC.TAX.TOTL.GD.ZS': 'fiscal', 'GC.XPN.INTP.ZS': 'fiscal', 'GC.NLD.TOTL.GD.ZS': 'fiscal',
  'SE.XPD.TOTL.GD.ZS': 'fiscal',
  'SE.SEC.ENRR': 'education', 'SE.TER.ENRR': 'education', 'SE.ADT.LITR.ZS': 'education',
  'GB.XPD.RSDV.GD.ZS': 'innovation', 'IP.PAT.RESD': 'innovation', 'IP.PAT.NRES': 'innovation',
  'IP.JRN.ARTC.SC': 'innovation', 'TX.VAL.TECH.MF.ZS': 'innovation',
  'EG.USE.PCAP.KG.OE': 'energy', 'EG.USE.COMM.FO.ZS': 'energy', 'EG.FEC.RNEW.ZS': 'energy',
  'EG.ELC.RNEW.ZS': 'energy', 'EG.ELC.ACCS.ZS': 'energy', 'EG.IMP.CONS.ZS': 'energy',
  'EN.GHG.CO2.PC.CE.AR5': 'environment', 'EN.ATM.PM25.MC.M3': 'environment',
  'ER.H2O.FWTL.ZS': 'environment', 'AG.LND.FRST.ZS': 'environment', 'AG.LND.AGRI.ZS': 'agriculture',
  'AG.PRD.FOOD.XD': 'agriculture', 'AG.YLD.CREL.KG': 'agriculture', 'SN.ITK.DEFC.ZS': 'agriculture',
  'SH.XPD.CHEX.GD.ZS': 'health', 'SH.MED.BEDS.ZS': 'health', 'SH.MED.PHYS.ZS': 'health',
  'SH.IMM.MEAS': 'health', 'SH.H2O.BASW.ZS': 'health', 'SH.STA.BASS.ZS': 'health',
  'MS.MIL.XPND.GD.ZS': 'defense', 'MS.MIL.XPND.CD': 'defense', 'MS.MIL.TOTL.P1': 'defense',
  'IT.NET.USER.ZS': 'digital', 'IT.NET.BBND.P2': 'digital', 'IT.NET.SECR.P6': 'digital',
  'IT.CEL.SETS.P2': 'digital', 'TG.VAL.TOTL.GD.ZS': 'trade',
};

export const COUNTRY_NAMES = {
  US: 'United States', CN: 'China', JP: 'Japan', DE: 'Germany', IN: 'India',
  GB: 'United Kingdom', FR: 'France', BR: 'Brazil', RU: 'Russian Federation', KR: 'Korea, Rep.',
  CA: 'Canada', IT: 'Italy', ES: 'Spain', MX: 'Mexico', ID: 'Indonesia',
  TR: 'Turkiye', SA: 'Saudi Arabia', AU: 'Australia', ZA: 'South Africa', AR: 'Argentina',
  VN: 'Viet Nam', TH: 'Thailand', PL: 'Poland', NL: 'Netherlands', SG: 'Singapore',
  AE: 'United Arab Emirates', NG: 'Nigeria', EG: 'Egypt, Arab Rep.', CH: 'Switzerland',
};

// World Bank time series (no auth, CC BY 4.0)
export async function fetchSeries(indicator, country, date) {
  const url = `${WB}/country/${country}/indicator/${indicator}?format=json&date=${date}&per_page=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WB HTTP ${res.status} for ${country}/${indicator}`);
  const [meta, data] = await res.json();
  if (!Array.isArray(data)) throw new Error(`WB empty for ${country}/${indicator}`);
  return data
    .filter((d) => d.value != null)
    .map((d) => ({ year: Number(d.date), value: Number(d.value) }))
    .sort((a, b) => a.year - b.year); // World Bank returns descending -> normalize to ascending
}

// FRED (optional; free but requires an API key)
// Register at https://fredaccount.stlouisfed.org/apikeys and set FRED_API_KEY to enable.
export async function fetchFRED(seriesId, apiKey, years = 5) {
  if (!apiKey) return [];
  const end = new Date().getFullYear();
  const start = end - years;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${start}-01-01`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const json = await res.json();
  return (json.observations || [])
    .filter((o) => o.value !== '.' && o.value != null)
    .map((o) => ({ year: Number(o.date.slice(0, 4)), value: Number(o.value) }));
}

// Fetch every series required by a report definition.
// A failed country yields an empty series so the report can still be produced.
// Countries within one indicator are fetched in parallel; indicators run in parallel too.
export async function fetchReportData(def, { fredKey, concurrency = 10 } = {}) {
  const seriesMap = {};
  const jobs = [];
  for (const indicator of def.indicators) {
    for (const country of def.countries) {
      jobs.push({ indicator, country });
    }
  }
  const results = new Array(jobs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const i = cursor++;
      const { indicator, country } = jobs[i];
      try {
        results[i] = [indicator, country, await fetchSeries(indicator, country, def.years)];
      } catch (e) {
        console.error(`[warn] ${def.id}/${country}/${indicator}: ${e.message}`);
        results[i] = [indicator, country, []];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

  for (const [indicator, country, series] of results) {
    if (!seriesMap[indicator]) seriesMap[indicator] = {};
    seriesMap[indicator][country] = series;
  }
  return seriesMap;
}
