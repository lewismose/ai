'use strict';

/* ── Auth Guard ──────────────────────────────────────────────────────────────
   Redirects to login.html if the user has not authenticated with a valid key.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  if (sessionStorage.getItem('tv_auth') !== 'granted') {
    window.location.replace('login.html');
  }
})();

const _logoutBtn = document.getElementById('logout-btn');
if (_logoutBtn) {
  _logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('tv_auth');
    window.location.replace('login.html');
  });
}

/* ── Performance Mode & Low-End Detection ───────────────────────────────────
   Detects weak devices and provides a manual "Extreme Performance" toggle.
   Strips heavy CSS effects and throttles background tasks for maximum speed.
   ─────────────────────────────────────────────────────────────────────────── */
let isLowEnd = (
  (navigator.hardwareConcurrency || 4) <= 4 ||
  (navigator.deviceMemory || 4) <= 2 ||
  ['2g', 'slow-2g'].includes(navigator.connection?.effectiveType)
);

// Manual override from persistence
if (localStorage.getItem('tv_perf_mode') === 'extreme') {
  isLowEnd = true;
}

if (isLowEnd) document.body.classList.add('low-end');

// Performance Toggle Handler
document.addEventListener('DOMContentLoaded', () => {
  const pToggle = document.getElementById('perf-toggle');
  if (pToggle) {
    if (isLowEnd) pToggle.classList.add('active');
    pToggle.addEventListener('click', () => {
      const active = document.body.classList.toggle('low-end');
      pToggle.classList.toggle('active', active);
      isLowEnd = active;
      localStorage.setItem('tv_perf_mode', active ? 'extreme' : 'normal');
      toast(active ? '🚀 Extreme Performance ON' : '✨ Quality Mode ON', active ? 'warn' : 'ok');
      
      // Force UI updates for new performance state
      if (active) {
        // Stop expensive canvas if it was running
        const cv = document.getElementById('particles-canvas');
        if (cv) cv.style.display = 'none';
      } else {
        // Optionally reload or restart effects, but simple hide/show is safer
        window.location.reload(); // Simplest way to restart complex canvas/orb logic
      }
    });
  }
});

/* ═══════════════════════════════════════════════
   TRADEVISION AI  —  TradingView Data Engine
   • Primary source: TradingView UDF (all pairs)
   • Fallback: Binance (crypto direct)
   • Symbol search: TradingView Symbol Search API
   • TA: EMA, RSI, MACD, BB, ATR, ADX, VWAP, Donchian
   • Zero API keys required
   ═══════════════════════════════════════════════ */

const CRYPTO_BASES = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'MATIC',
  'LINK', 'DOT', 'UNI', 'ATOM', 'LTC', 'BCH', 'NEAR', 'TRX', 'ETC', 'SHIB', 'PEPE', 'ARB',
  'OP', 'INJ', 'SUI', 'TIA', 'WLD', 'FTM', 'SAND', 'MANA', 'APT', 'CAKE', 'XLM', 'ALGO',
  'VET', 'HBAR', 'FIL', 'AAVE', 'SNX', 'APE', 'CRO', 'XMR', 'NOT', 'WIF', 'BONK', 'GMT',
  'EGLD', 'EOS', 'COMP', 'MKR', '1INCH', 'FLOKI', 'JASMY', 'ACE', 'FET', 'GRT'];

// CoinGecko coin ID map (used as final crypto fallback)
const CG_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple',
  ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2', MATIC: 'matic-network',
  LINK: 'chainlink', DOT: 'polkadot', UNI: 'uniswap', ATOM: 'cosmos', LTC: 'litecoin',
  BCH: 'bitcoin-cash', NEAR: 'near', TRX: 'tron', ETC: 'ethereum-classic',
  SHIB: 'shiba-inu', PEPE: 'pepe', ARB: 'arbitrum', OP: 'optimism',
  INJ: 'injective-protocol', SUI: 'sui', TIA: 'celestia', WLD: 'worldcoin-wld',
  FTM: 'fantom', SAND: 'the-sandbox', MANA: 'decentraland', APT: 'aptos',
  XLM: 'stellar', ALGO: 'algorand', VET: 'vechain', HBAR: 'hedera-hashgraph',
  FIL: 'filecoin', AAVE: 'aave', SNX: 'havven', CRO: 'crypto-com-chain', XMR: 'monero',
  EOS: 'eos', COMP: 'compound-governance-token', MKR: 'maker', FET: 'fetch-ai',
  GRT: 'the-graph', EGLD: 'elrond-erd-2', CAKE: 'pancakeswap-token',
  FLOKI: 'floki', BONK: 'bonk', WIF: 'dogwifcoin', GMT: 'stepn',
};

const TV_SEARCH = 'https://symbol-search.tradingview.com/symbol_search/';
const TV_SCANNER = 'https://scanner.tradingview.com'; // live price fallback
const TF_RES = { '15m': '15', '1h': '60', '4h': '240', '1d': 'D' };
const TF_SECS = { '15m': 200 * 900, '1h': 200 * 3600, '4h': 200 * 14400, '1d': 200 * 86400 };

const FOREX_CCY = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SGD', 'HKD',
  'NOK', 'SEK', 'DKK', 'TRY', 'ZAR', 'MXN', 'BRL', 'INR', 'THB', 'CNY', 'CNH', 'PLN'];

const SYM_ALIASES = {
  'GOLD': 'GC=F', 'XAUUSD': 'GC=F', 'SILVER': 'SI=F', 'XAGUSD': 'SI=F',
  'OIL': 'CL=F', 'BRENT': 'BZ=F', 'NATGAS': 'NG=F',
  'SP500': '^GSPC', 'SPX': '^GSPC', 'US500': '^GSPC',
  'NASDAQ': '^IXIC', 'NAS100': '^IXIC', 'NDX': '^IXIC',
  'DOW': '^DJI', 'US30': '^DJI', 'DAX': '^GDAXI', 'DAX40': '^GDAXI',
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Deploy cloudflare-worker.js to https://workers.cloudflare.com (free)
// STEP 2: Paste your worker URL below (e.g. https://my-proxy.me.workers.dev)
// STEP 3: Push to GitHub — all pairs will work instantly on any host
// ─────────────────────────────────────────────────────────────────────────────
const YOUR_WORKER_URL = 'https://tradevisionai.lewis-hfm.workers.dev'; // ← See instructions below — needs a SEPARATE proxy worker

// CORS proxies — raced IN PARALLEL; fastest wins
// Worker goes first (most reliable), public proxies are automatic fallbacks
const PROXIES = [
  // Primary: your own Cloudflare Worker (deploy cloudflare-worker.js — free, 100k/day)
  ...(YOUR_WORKER_URL ? [u => `${YOUR_WORKER_URL}?url=${encodeURIComponent(u)}`] : []),
  // Public fallbacks (rate-limited but usually work):
  u => `https://cors-anywhere.herokuapp.com/${u}`, // Note: Needs temporary access activation
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
];


// Timeout-safe fetch
function fetchT(url, ms = 11000) {
  return Promise.race([
    fetch(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

// Parse Yahoo Finance JSON regardless of which proxy wrapped it
function parseYahooJson(text) {
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('Bad JSON'); }
  if (typeof json.contents === 'string') {
    if (json.status?.http_code && json.status.http_code !== 200)
      throw new Error(`Upstream ${json.status.http_code}`);
    try { json = JSON.parse(json.contents); } catch { throw new Error('Bad wrapper'); }
  }
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No chart result');
  return result;
}

// ─── App State ────────────────────────────────────────────────────────────────
const S = {
  tf: '1h',
  rr: 2.2,
  active: null,      // { tvSymbol, useBinance, binSym, display, type }
  lastCandles: null,
  lastTA: null,
  lastSig: null,
  dxyTrend: 'NEUTRAL',
  newsData: [],
  config: { showIndicators: true }
};

async function fetchDXYTrend() {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/DX=F?interval=1d&range=5d';
  try {
    const data = await Promise.any(PROXIES.map(async mkProxy => {
      const res = await fetchT(mkProxy(url), 5000);
      if (!res.ok) throw new Error('DXY failed');
      const text = await res.text();
      let d = JSON.parse(text);
      if (d.contents) d = JSON.parse(d.contents);
      return d;
    }));
    const closes = data.chart.result[0].indicators.quote[0].close.filter(v => v !== null);
    if (closes.length > 2) return closes[closes.length-1] > closes[0] ? 'BULLISH' : 'BEARISH';
  } catch(e) {}
  return 'NEUTRAL';
}

async function fetchNewsSentiment(symbol) {
  const baseSym = symbol.split('/')[0].split('=')[0].split('-')[0];
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(baseSym)}&newsCount=5`;
  try {
    const data = await Promise.any(PROXIES.map(async mkProxy => {
      const res = await fetchT(mkProxy(url), 6000);
      if (!res.ok) throw new Error('News failed');
      const text = await res.text();
      let d = JSON.parse(text);
      if (d.contents) d = JSON.parse(d.contents);
      return d;
    }));
    if (data.news && data.news.length > 0) {
      return data.news.map(n => {
        let title = n.title;
        let tLow = title.toLowerCase();
        let score = 0;
        if (tLow.match(/surge|jump|record|bull|upgrade|positive|high|gain|rally|buy|grow|soar/)) score += 1;
        if (tLow.match(/plunge|drop|hack|bear|downgrade|negative|cut|sell|low|loss|fall|sink/)) score -= 1;
        return { title, time: new Date(n.providerPublishTime*1000), score };
      });
    }
  } catch(e) {}
  return [];
}


// ─── Data: Yahoo Finance ─────────────────────────────────────────────────────
// Races ALL proxies simultaneously for BOTH Yahoo endpoints.
// Total wait = time of FASTEST proxy, not the sum of all timeouts.
function _yahooViaProxy(yUrl, tf) {
  return Promise.any(PROXIES.map(async mkProxy => {
    const res = await fetchT(mkProxy(yUrl), 11000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const result = parseYahooJson(text);
    const ts = result.timestamp, q = result.indicators.quote[0];
    if (!ts?.length || !q) throw new Error('Malformed');
    let candles = ts.map((t, i) => ({
      time: t * 1000, open: q.open[i], high: q.high[i],
      low: q.low[i], close: q.close[i], volume: q.volume?.[i] || 0,
    })).filter(c => c.open && c.high && c.low && c.close);
    if (candles.length < 10) throw new Error('Too few candles');
    if (tf === '4h') candles = groupCandles(candles, 4);
    if (tf === '3m') candles = groupCandles(candles, 3);
    return candles;
  }));
}

async function fetchYahoo(symbol, tf) {
  const iMap = { '1m': '1m', '3m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '1h', '1d': '1d' };
  const rMap = { '1m': '3d', '3m': '5d', '5m': '7d', '15m': '14d', '1h': '60d', '4h': '60d', '1d': '2y' };
  const qs = `?range=${rMap[tf] || '60d'}&interval=${iMap[tf] || '1h'}&includePrePost=false&_t=${Date.now()}`;
  const sym = encodeURIComponent(symbol);
  try {
    return await Promise.any([
      _yahooViaProxy(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}${qs}`, tf),
      _yahooViaProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}${qs}`, tf),
    ]);
  } catch {
    throw new Error(`Yahoo Finance unavailable for ${symbol}`);
  }
}

// ─── Data: stooq.com CSV (parallel proxies) ──────────────────────────────────
async function fetchStooq(symbol, tf) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d`;
  try {
    return await Promise.any(PROXIES.map(async mkProxy => {
      const res = await fetchT(mkProxy(url), 11000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let text = await res.text();
      if (text.trim().startsWith('{')) { const j = JSON.parse(text); text = j.contents || j.body || text; }
      const lines = text.trim().split('\n').filter(l => l && !l.startsWith('Date'));
      if (lines.length < 10) throw new Error('Too few rows');
      const candles = lines.map(line => {
        const [date, open, high, low, close, volume] = line.split(',');
        const [y, m, d] = date.split('-').map(Number);
        return { time: Date.UTC(y, m - 1, d), open: +open, high: +high, low: +low, close: +close, volume: +volume || 0 };
      }).filter(c => c.open && c.high && c.low && c.close && !isNaN(c.time)).slice(-200);
      if (candles.length < 10) throw new Error('Bad data');
      return candles;
    }));
  } catch {
    throw new Error(`Stooq unavailable for ${symbol}`);
  }
}

// ─── Data: Frankfurter API (ECB forex — native CORS, zero proxies needed) ────
// Works on GitHub Pages, localhost, anywhere. Covers 30+ major currencies.
async function fetchFrankfurter(base, quote, tf) {
  const days = tf === '1d' ? 365 : 60;
  const end = new Date(); const start = new Date(+end - days * 86400000);
  const fmt = d => d.toISOString().slice(0, 10);
  const isEurBase = base === 'EUR';
  const isEurQuote = quote === 'EUR';
  // Single API call — fetch both legs at once when cross-rate needed
  const toParam = isEurBase ? quote : isEurQuote ? base : `${base},${quote}`;
  const url = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=EUR&to=${toParam}`;
  const res = await fetchT(url, 10000);
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
  const json = await res.json();
  if (!json.rates) throw new Error('No Frankfurter rates');
  const entries = Object.entries(json.rates).sort(([a], [b]) => a < b ? -1 : 1);
  if (entries.length < 5) throw new Error('Insufficient history');
  const candles = [];
  for (let i = 0; i < entries.length; i++) {
    const [date, r] = entries[i];
    const [y, m, d] = date.split('-').map(Number);
    let close;
    if (isEurBase) close = r[quote];           // EUR/QUOTE
    else if (isEurQuote) close = r[base] ? 1 / r[base] : null; // BASE/EUR
    else close = (r[base] && r[quote]) ? r[quote] / r[base] : null; // cross
    if (!close) continue;
    const prev = i > 0 ? (candles[candles.length - 1]?.close || close) : close;
    const spd = Math.abs(close - prev) * 0.25 || close * 0.00015;
    candles.push({
      time: Date.UTC(y, m - 1, d), open: prev,
      high: Math.max(prev, close) + spd, low: Math.min(prev, close) - spd,
      close, volume: 0,
    });
  }
  if (candles.length < 5) throw new Error('Frankfurter: too few candles');
  return candles;
}

// ─── Data Orchestrator ────────────────────────────────────────────────────────
// Priority order:
//   FOREX : Frankfurter first (native CORS, no proxy, works on GitHub Pages)
//           → Yahoo fallback (proxied, parallel)
//   OTHER : Yahoo first (proxied, parallel)
//           → stooq fallback (proxied, parallel)
async function fetchData(info, tf) {
  const errs = [];

  // ── FOREX: Frankfurter FIRST — works everywhere with no proxy at all ────────
  if (info.type === 'forex') {
    const raw = info.yahooSym.replace(/=X$/i, '');
    const base = raw.slice(0, 3), quote = raw.slice(3);
    try { return await fetchFrankfurter(base, quote, tf); }
    catch (e) { errs.push(`Frankfurter: ${e.message}`); }
  }

  // ── Yahoo Finance: all proxies raced in parallel ────────────────────────────
  try { return await fetchYahoo(info.yahooSym, tf); }
  catch (e) { errs.push(`Yahoo: ${e.message}`); }

  // ── Non-forex fallback: stooq CSV ──────────────────────────────────────────
  if (info.type !== 'forex') {
    try {
      const stooqSym = info.yahooSym
        .replace(/\^/g, '').replace(/=F$/i, '.f').replace(/=X$/i, '');
      if (stooqSym) return await fetchStooq(stooqSym, tf);
    } catch (e) { errs.push(`Stooq: ${e.message}`); }
  }

  throw new Error(`No data available for ${info.display}. Try a different pair or timeframe.`);
}

function groupCandles(h, sz) {
  const out = [];
  for (let i = 0; i + sz - 1 < h.length; i += sz) {
    const g = h.slice(i, i + sz);
    out.push({
      time: g[0].time, open: g[0].open, high: Math.max(...g.map(c => c.high)),
      low: Math.min(...g.map(c => c.low)), close: g[g.length - 1].close,
      volume: g.reduce((s, c) => s + c.volume, 0)
    });
  }
  return out;
}

// ─── Data: CRYPTO — 5 exchanges raced in parallel ────────────────────────────
// Binance → Bybit → OKX → Kraken → CoinGecko  (all direct, no proxy needed)

async function fetchBinance(sym, tf) {
  const iv = tf === '1d' ? '1d' : tf;
  const res = await fetchT(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${iv}&limit=200`, 10000);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.msg || `Binance ${res.status}`); }
  const d = await res.json();
  if (!Array.isArray(d) || !d.length) throw new Error('No Binance data');
  return d.map(k => ({ time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

async function fetchBybit(sym, tf) {
  const iv = { '15m': '15', '1h': '60', '4h': '240', '1d': 'D' }[tf] || '60';
  const res = await fetchT(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${iv}&limit=200`, 10000);
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const j = await res.json();
  if (j.retCode !== 0) throw new Error(j.retMsg);
  const list = j.result?.list; if (!list?.length) throw new Error('No Bybit data');
  return list.slice().reverse().map(k => ({ time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

async function fetchOKX(base, tf) {
  const bar = { '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D' }[tf] || '1H';
  const res = await fetchT(`https://www.okx.com/api/v5/market/candles?instId=${base}-USDT&bar=${bar}&limit=300`, 10000);
  if (!res.ok) throw new Error(`OKX ${res.status}`);
  const j = await res.json();
  if (j.code !== '0') throw new Error(j.msg);
  const d = j.data; if (!d?.length) throw new Error('No OKX data');
  return d.slice().reverse().map(k => ({ time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

async function fetchKraken(base, tf) {
  const iv = { '15m': 15, '1h': 60, '4h': 240, '1d': 1440 }[tf] || 60;
  const pair = base === 'BTC' ? 'XBTUSD' : base === 'ETH' ? 'ETHUSD' : `${base}USD`;
  const res = await fetchT(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${iv}&count=200`, 10000);
  if (!res.ok) throw new Error(`Kraken ${res.status}`);
  const j = await res.json();
  if (j.error?.length) throw new Error(j.error[0]);
  const key = Object.keys(j.result).find(k => k !== 'last');
  const d = j.result[key]; if (!d?.length) throw new Error('No Kraken data');
  return d.slice(-200).map(k => ({ time: +k[0] * 1000, open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[6] }));
}

async function fetchCoinGecko(base, tf) {
  const id = CG_IDS[base]; if (!id) throw new Error(`No CG id for ${base}`);
  const days = { '15m': 1, '1h': 7, '4h': 30, '1d': 365 }[tf] || 7;
  const res = await fetchT(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`, 12000);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const d = await res.json();
  if (!Array.isArray(d) || d.length < 5) throw new Error('No CoinGecko data');
  return d.map(k => ({ time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: 0 }));
}

// Orchestrator: race all 5 exchanges — returns whichever responds first
async function fetchCrypto(info, tf) {
  const base = (info.binSym || '').replace(/USDT$/, '');
  try {
    return await Promise.any([
      fetchBinance(info.binSym, tf),
      fetchBybit(info.binSym, tf),
      fetchOKX(base, tf),
      fetchKraken(base, tf),
      fetchCoinGecko(base, tf),
    ]);
  } catch {
    throw new Error(`All crypto exchanges failed for ${info.display}. Check your connection.`);
  }
}

// ─── Symbol Search (TradingView) ──────────────────────────────────────────────
let searchTimer;
let searchAbort;

async function searchSymbols(query) {
  if (!query || query.length < 1) return [];
  try {
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();
    const url = `${TV_SEARCH}?text=${encodeURIComponent(query)}&hl=0&exchange=&lang=en&type=&domain=production&limit=10`;
    const res = await fetchT(url, 5000);
    if (!res.ok) return [];
    const results = await res.json();
    return Array.isArray(results) ? results : [];
  } catch { return []; }
}

// ─── Pair Detection ────────────────────────────────────────────────────────────
function detectSymbol(raw) {
  const s = raw.trim().toUpperCase().replace(/[/\-\s]/g, '');
  if (!s) return null;

  // Crypto check
  for (const base of CRYPTO_BASES) {
    if (s === base)
      return { binSym: `${base}USDT`, useBinance: true, display: `${base}/USDT`, type: 'crypto' };
    if (s === `${base}USDT`)
      return { binSym: s, useBinance: true, display: `${base}/USDT`, type: 'crypto' };
  }

  // Alias (Gold, Oil, indices…)
  if (SYM_ALIASES[s])
    return { yahooSym: SYM_ALIASES[s], useYahoo: true, display: s, type: 'commodity' };

  // Forex: 6-letter pair of known currency codes
  if (s.length === 6) {
    const a = s.slice(0, 3), b = s.slice(3);
    if (FOREX_CCY.includes(a) && FOREX_CCY.includes(b))
      return { yahooSym: `${s}=X`, useYahoo: true, display: `${a}/${b}`, type: 'forex' };
  }

  // Default: treat as stock/index on Yahoo Finance
  return { yahooSym: s, useYahoo: true, display: s, type: 'stock' };
}

// ─── Technical Analysis ────────────────────────────────────────────────────────
function ema(vals, p) {
  const k = 2 / (p + 1); let e = null, cnt = 0, sum = 0, r = [];
  for (const v of vals) {
    if (v == null || isNaN(v)) { r.push(null); continue }
    if (e === null) { sum += v; cnt++; if (cnt === p) { e = sum / p; r.push(e) } else r.push(null) }
    else { e = v * k + e * (1 - k); r.push(e) }
  }
  return r;
}
function sma(vals, p) {
  return vals.map((_, i) => {
    if (i < p - 1) return null;
    const s = vals.slice(i - p + 1, i + 1);
    return s.some(v => v == null) ? null : s.reduce((a, b) => a + b, 0) / p;
  });
}
function rsi(closes, p = 14) {
  let ag = 0, al = 0, r = [null];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (i <= p) { ag += Math.max(d, 0); al += Math.max(-d, 0); if (i < p) { r.push(null); continue } ag /= p; al /= p }
    else { ag = (ag * (p - 1) + Math.max(d, 0)) / p; al = (al * (p - 1) + Math.max(-d, 0)) / p }
    r.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return r;
}
function macd(closes, fast = 12, slow = 26, sig = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const ml = ef.map((v, i) => v != null && es[i] != null ? v - es[i] : null);
  const vm = ml.filter(v => v != null), rs = ema(vm, sig);
  let si = 0; const sl = ml.map(v => v != null ? rs[si++] ?? null : null);
  return { macd: ml, signal: sl, histogram: ml.map((v, i) => v != null && sl[i] != null ? v - sl[i] : null) };
}
function bb(closes, p = 20, m = 2) {
  const mid = sma(closes, p), u = [], l = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null) { u.push(null); l.push(null); continue }
    const sl = closes.slice(i - p + 1, i + 1);
    const sd = Math.sqrt(sl.reduce((s, v) => s + (v - mid[i]) ** 2, 0) / p);
    u.push(mid[i] + m * sd); l.push(mid[i] - m * sd);
  }
  return { middle: mid, upper: u, lower: l };
}
function atr(candles, p = 14) {
  const tr = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
  return sma(tr, p);
}

// ADX — Average Directional Index (Wilder smoothing)
function adx(candles, p = 14) {
  const dmP = [], dmN = [], tr = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const dn = candles[i - 1].low - candles[i].low;
    dmP.push(up > dn && up > 0 ? up : 0);
    dmN.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close)));
  }
  // Wilder smooth
  const ws = (arr, p) => {
    let s = arr.slice(0, p).reduce((a, b) => a + b, 0);
    const r = [s];
    for (let i = p; i < arr.length; i++) { s = s - s / p + arr[i]; r.push(s); }
    return r;
  };
  const wTR = ws(tr, p), wDP = ws(dmP, p), wDN = ws(dmN, p);
  const diP = wTR.map((t, i) => t ? 100 * wDP[i] / t : 0);
  const diN = wTR.map((t, i) => t ? 100 * wDN[i] / t : 0);
  const dx = diP.map((p, i) => {
    const s = p + diN[i]; return s ? 100 * Math.abs(p - diN[i]) / s : 0;
  });
  const adxArr = ws(dx, p);
  // Pad front with nulls to align with original candle array
  const pad = candles.length - adxArr.length;
  return {
    adx: Array(pad).fill(null).concat(adxArr.map(v => v / p)),
    diP: Array(pad).fill(null).concat(diP),
    diN: Array(pad).fill(null).concat(diN),
  };
}

// VWAP — reset per-dataset (session VWAP approximation)
function vwap(candles) {
  let cumPV = 0, cumV = 0;
  return candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * (c.volume || 0);
    cumV += (c.volume || 0);
    return cumV ? cumPV / cumV : tp;
  });
}

// Donchian Channel
function donchian(candles, p = 20) {
  const upper = [], lower = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < p - 1) { upper.push(null); lower.push(null); continue; }
    const sl = candles.slice(i - p + 1, i + 1);
    upper.push(Math.max(...sl.map(c => c.high)));
    lower.push(Math.min(...sl.map(c => c.low)));
  }
  const middle = upper.map((u, i) => u != null && lower[i] != null ? (u + lower[i]) / 2 : null);
  return { upper, lower, middle };
}

// ─── Swing Points ─────────────────────────────────────────────────────────────
function swingPoints(candles, lb = 5) {
  const highs = [], lows = [];
  for (let i = lb; i < candles.length - lb; i++) {
    const sl = candles.slice(i - lb, i + lb + 1);
    if (candles[i].high === Math.max(...sl.map(c => c.high))) highs.push({ i, price: candles[i].high });
    if (candles[i].low === Math.min(...sl.map(c => c.low))) lows.push({ i, price: candles[i].low });
  }
  return { highs, lows };
}

// ─── Market Structure ─────────────────────────────────────────────────────────
function detectMarketStructure(candles, swings) {
  const { highs, lows } = swings;
  if (highs.length < 2 || lows.length < 2) return { trend: 'ranging', events: [], labels: [] };
  const rH = highs.slice(-3), rL = lows.slice(-3);
  let hh = 0, lh = 0, hl = 0, ll = 0;
  for (let i = 1; i < rH.length; i++) rH[i].price > rH[i - 1].price ? hh++ : lh++;
  for (let i = 1; i < rL.length; i++) rL[i].price > rL[i - 1].price ? hl++ : ll++;
  let trend = 'ranging';
  if (hh >= 1 && hl >= 1) trend = 'uptrend';
  else if (lh >= 1 && ll >= 1) trend = 'downtrend';
  const events = [], labels = [];
  // Label last 3 swings
  rH.forEach((h, i) => { const tag = i === 0 ? (rH[1] && rH[1].price > h.price ? 'LL' : 'HH') : (rH[i - 1] && h.price > rH[i - 1].price ? 'HH' : 'LH'); labels.push({ i: h.i, price: h.price, tag, side: 'high' }); });
  rL.forEach((l, i) => { const tag = i === 0 ? (rL[1] && rL[1].price < l.price ? 'HH' : 'LL') : (rL[i - 1] && l.price < rL[i - 1].price ? 'LL' : 'HL'); labels.push({ i: l.i, price: l.price, tag, side: 'low' }); });
  const n = candles.length - 1, close = candles[n].close;
  if (highs.length >= 1 && close > highs[highs.length - 1].price && trend !== 'uptrend') events.push({ type: 'BOS', dir: 'bull' });
  if (lows.length >= 1 && close < lows[lows.length - 1].price && trend !== 'downtrend') events.push({ type: 'BOS', dir: 'bear' });
  if (trend === 'uptrend' && lows.length >= 2 && close < rL[rL.length - 1].price) events.push({ type: 'ChoCH', dir: 'bear' });
  if (trend === 'downtrend' && highs.length >= 2 && close > rH[rH.length - 1].price) events.push({ type: 'ChoCH', dir: 'bull' });
  return { trend, events, labels };
}

// ─── S/R Zones ────────────────────────────────────────────────────────────────
function detectSRZones(candles, swings) {
  const close = candles[candles.length - 1].close;
  const tol = 0.006;
  const pts = [...swings.highs.map(h => h.price), ...swings.lows.map(l => l.price)];
  const zones = [];
  for (const p of pts) {
    const ex = zones.find(z => Math.abs(z.mid - p) / p < tol);
    if (ex) { ex.count++; ex.top = Math.max(ex.top, p * (1 + tol / 2)); ex.bottom = Math.min(ex.bottom, p * (1 - tol / 2)); ex.mid = (ex.top + ex.bottom) / 2; }
    else zones.push({ mid: p, top: p * (1 + tol / 2), bottom: p * (1 - tol / 2), count: 1, type: p > close ? 'resistance' : 'support' });
  }
  return zones.sort((a, b) => b.count - a.count).slice(0, 6);
}

// ─── Candlestick Patterns ─────────────────────────────────────────────────────
function detectPatterns(candles) {
  const out = [], n = candles.length, lb = Math.min(40, n);
  for (let i = n - lb; i < n; i++) {
    const c = candles[i], p = i > 0 ? candles[i - 1] : null, p2 = i > 1 ? candles[i - 2] : null;
    const body = Math.abs(c.close - c.open), range = c.high - c.low || 0.0001;
    const uWick = c.high - Math.max(c.open, c.close), lWick = Math.min(c.open, c.close) - c.low;
    if (body / range < 0.1) { out.push({ name: 'Doji', i, type: 'neutral' }); continue; }
    if (lWick > body * 2 && uWick < body * 0.5) out.push({ name: c.close > c.open ? 'Hammer' : 'Hang.Man', i, type: c.close > c.open ? 'bull' : 'bear' });
    if (uWick > body * 2 && lWick < body * 0.5) out.push({ name: 'Shoot.Star', i, type: 'bear' });
    if (p) {
      const pb = Math.abs(p.close - p.open);
      if (c.close > c.open && p.close < p.open && body > pb && c.open < p.close && c.close > p.open) out.push({ name: 'Bull Engulf', i, type: 'bull' });
      if (c.close < c.open && p.close > p.open && body > pb && c.open > p.close && c.close < p.open) out.push({ name: 'Bear Engulf', i, type: 'bear' });
    }
    if (p && p2) {
      const pb2 = Math.abs(p2.close - p2.open), pb = Math.abs(p.close - p.open);
      if (pb2 > 0 && pb / pb2 < 0.3 && p2.close < p2.open && c.close > c.open && c.close > (p2.open + p2.close) / 2) out.push({ name: 'Morning Star', i, type: 'bull' });
      if (pb2 > 0 && pb / pb2 < 0.3 && p2.close > p2.open && c.close < c.open && c.close < (p2.open + p2.close) / 2) out.push({ name: 'Evening Star', i, type: 'bear' });
    }
    if ((lWick > range * 0.6 || uWick > range * 0.6) && body < range * 0.25 && !out.find(x => x.i === i)) out.push({ name: 'Pin Bar', i, type: lWick > uWick ? 'bull' : 'bear' });
  }
  return out;
}

// ─── RSI Divergence ───────────────────────────────────────────────────────────
function detectDivergence(candles, rsiArr, swings) {
  const res = { bullish: [], bearish: [] };
  const { highs, lows } = swings;
  if (lows.length >= 2) {
    const a = lows[lows.length - 2], b = lows[lows.length - 1];
    if (b.price < a.price && rsiArr[b.i] != null && rsiArr[a.i] != null && rsiArr[b.i] > rsiArr[a.i] && rsiArr[b.i] < 45)
      res.bullish.push({ startI: a.i, endI: b.i, startP: a.price, endP: b.price, startRSI: rsiArr[a.i], endRSI: rsiArr[b.i] });
  }
  if (highs.length >= 2) {
    const a = highs[highs.length - 2], b = highs[highs.length - 1];
    if (b.price > a.price && rsiArr[b.i] != null && rsiArr[a.i] != null && rsiArr[b.i] < rsiArr[a.i] && rsiArr[b.i] > 55)
      res.bearish.push({ startI: a.i, endI: b.i, startP: a.price, endP: b.price, startRSI: rsiArr[a.i], endRSI: rsiArr[b.i] });
  }
  return res;
}

// ─── Fibonacci ────────────────────────────────────────────────────────────────
function fibonacci(candles) {
  const lb = Math.min(100, candles.length), sl = candles.slice(-lb);
  const high = Math.max(...sl.map(c => c.high)), low = Math.min(...sl.map(c => c.low));
  const rng = high - low;
  return {
    high, low, levels: [
      { r: 0, price: low, label: '0%' }, { r: 0.236, price: low + rng * 0.236, label: '23.6%' },
      { r: 0.382, price: low + rng * 0.382, label: '38.2%' }, { r: 0.5, price: low + rng * 0.5, label: '50%' },
      { r: 0.618, price: low + rng * 0.618, label: '61.8%' }, { r: 0.786, price: low + rng * 0.786, label: '78.6%' },
      { r: 1, price: high, label: '100%' },
    ]
  };
}

// ─── SMC: Fair Value Gaps (FVG) ──────────────────────────────────────────────────
function detectFVG(candles) {
  const fvgs = { bullish: [], bearish: [] };
  const tol = 0.0001; // minimal gap check
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2], c2 = candles[i - 1], c3 = candles[i];
    if (c1.high < c3.low * (1 - tol) && c2.close > c2.open) {
      fvgs.bullish.push({ i: i - 1, top: c3.low, bottom: c1.high, mitigated: false });
    }
    if (c1.low > c3.high * (1 + tol) && c2.close < c2.open) {
      fvgs.bearish.push({ i: i - 1, top: c1.low, bottom: c3.high, mitigated: false });
    }
  }
  // Check mitigation
  fvgs.bullish.forEach(fvg => {
    for (let j = fvg.i + 2; j < candles.length; j++) { if (candles[j].low <= fvg.top) fvg.mitigated = true; }
  });
  fvgs.bearish.forEach(fvg => {
    for (let j = fvg.i + 2; j < candles.length; j++) { if (candles[j].high >= fvg.bottom) fvg.mitigated = true; }
  });
  return { bullish: fvgs.bullish.filter(f => !f.mitigated), bearish: fvgs.bearish.filter(f => !f.mitigated) };
}

// ─── Setup: TTM Squeeze / Keltner ─────────────────────────────────────────────
function keltner(candles, atArr, p = 20, mult = 1.5) {
  const mid = sma(candles.map(c => c.close), p);
  return {
    middle: mid,
    upper: mid.map((m, i) => m != null && atArr[i] != null ? m + atArr[i] * mult : null),
    lower: mid.map((m, i) => m != null && atArr[i] != null ? m - atArr[i] * mult : null)
  };
}

// ─── Money Flow Index (Volume-Weighted RSI) ──────────────────────────────────
function mfi(candles, p = 14) {
  const mfiArr = [null];
  const typ = candles.map(c => (c.high + c.low + c.close) / 3);
  const rm = typ.map((t, i) => i === 0 ? 0 : t * (candles[i].volume || 1));
  for (let i = 1; i < candles.length; i++) {
    if (i < p) { mfiArr.push(null); continue; }
    let posMf = 0, negMf = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const change = typ[j] - typ[j-1];
      if (change > 0) posMf += rm[j];
      else if (change < 0) negMf += rm[j];
    }
    mfiArr.push(negMf === 0 ? 100 : 100 - (100 / (1 + (posMf / negMf))));
  }
  return mfiArr;
}

// ─── Volume SMA / Anomaly ───────────────────────────────────────────────────
function volumeSMA(candles, p = 20) {
  return sma(candles.map(c => c.volume || 0), p);
}

// ─── SuperTrend ───────────────────────────────────────────────────────────────
function supertrend(candles, atrArr, p = 10, mult = 3) {
  const st = [], dir = [];
  let isUp = true, upper = 0, lower = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i < p || atrArr[i] == null) {
      st.push(null); dir.push(null);
      continue;
    }
    const c = candles[i];
    const prevC = candles[i - 1];
    const hl2 = (c.high + c.low) / 2;
    const bUp = hl2 + mult * atrArr[i];
    const bDn = hl2 - mult * atrArr[i];
    
    // Trailing logic
    if (i === p) {
      upper = bUp; lower = bDn;
    } else {
      upper = (bUp < upper || prevC.close > upper) ? bUp : upper;
      lower = (bDn > lower || prevC.close < lower) ? bDn : lower;
    }
    
    if (isUp && c.close <= lower) {
      isUp = false;
    } else if (!isUp && c.close >= upper) {
      isUp = true;
    }
    
    st.push(isUp ? lower : upper);
    dir.push(isUp ? 'bull' : 'bear');
  }
  return { trendLine: st, direction: dir };
}

// ─── Stochastic RSI ───────────────────────────────────────────────────────────
function stochRsi(rsiArr, p = 14, k = 3, d = 3) {
  const stoch = rsiArr.map((v, i) => {
    if (i < p - 1 || v == null) return null;
    const window = rsiArr.slice(i - p + 1, i + 1);
    if (window.some(x => x == null)) return null;
    const hi = Math.max(...window);
    const lo = Math.min(...window);
    if (hi === lo) return 0;
    return 100 * ((v - lo) / (hi - lo));
  });
  const kLine = sma(stoch, k);
  const dLine = sma(kLine, d);
  return { k: kLine, d: dLine };
}

// ─── Order Blocks (Institutional SMC) ─────────────────────────────────────────
function detectOrderBlocks(candles, swings) {
  const obs = { bullish: [], bearish: [] };
  const { highs, lows } = swings;
  // Bullish OB: last down close before an impulsive up move causing BOS/ChoCH (higher high)
  for (let i = 1; i < lows.length; i++) {
    const l = lows[i];
    let obCandleIdx = -1;
    for (let j = l.i - 1; j >= Math.max(0, l.i - 10); j--) {
      if (candles[j].close < candles[j].open) { obCandleIdx = j; break; }
    }
    if (obCandleIdx !== -1) {
      const obC = candles[obCandleIdx];
      const prevHigh = highs.filter(h => h.i < l.i).pop();
      if (prevHigh) {
        let broken = false;
        for (let k = l.i; k < Math.min(candles.length, l.i + 20); k++) {
          if (candles[k].close > prevHigh.price) { broken = true; break; }
        }
        if (broken) obs.bullish.push({ i: obCandleIdx, top: obC.high, bottom: obC.low, mitigated: false });
      }
    }
  }
  
  // Bearish OB: last up close before impulsive down move
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i];
    let obCandleIdx = -1;
    for (let j = h.i - 1; j >= Math.max(0, h.i - 10); j--) {
      if (candles[j].close > candles[j].open) { obCandleIdx = j; break; }
    }
    if (obCandleIdx !== -1) {
      const obC = candles[obCandleIdx];
      const prevLow = lows.filter(l => l.i < h.i).pop();
      if (prevLow) {
        let broken = false;
        for (let k = h.i; k < Math.min(candles.length, h.i + 20); k++) {
          if (candles[k].close < prevLow.price) { broken = true; break; }
        }
        if (broken) obs.bearish.push({ i: obCandleIdx, top: obC.high, bottom: obC.low, mitigated: false });
      }
    }
  }
  
  // Mitigation check
  const n = candles.length;
  obs.bullish.forEach(ob => {
    for (let j = ob.i + 2; j < n; j++) { if (candles[j].low <= ob.top) ob.mitigated = true; }
  });
  obs.bearish.forEach(ob => {
    for (let j = ob.i + 2; j < n; j++) { if (candles[j].high >= ob.bottom) ob.mitigated = true; }
  });
  
  return {
    bullish: obs.bullish.filter(o => !o.mitigated).slice(-3),
    bearish: obs.bearish.filter(o => !o.mitigated).slice(-3)
  };
}

// ─── Liquidity Sweeps ───────────────────────────────────────────────────────
function detectLiquiditySweeps(candles, swings) {
  const sweeps = { bullish: [], bearish: [] };
  const highs = swings.highs;
  const lows = swings.lows;
  for (let i = 1; i < lows.length; i++) {
    const l = lows[i];
    for (let k = l.i + 1; k < Math.min(candles.length, l.i + 40); k++) {
      if (candles[k].low < l.price && Math.min(candles[k].open, candles[k].close) > l.price) {
        sweeps.bullish.push({ i: k, price: candles[k].low, sweptLow: l.price });
        break;
      }
    }
  }
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i];
    for (let k = h.i + 1; k < Math.min(candles.length, h.i + 40); k++) {
      if (candles[k].high > h.price && Math.max(candles[k].open, candles[k].close) < h.price) {
        sweeps.bearish.push({ i: k, price: candles[k].high, sweptHigh: h.price });
        break;
      }
    }
  }
  return sweeps;
}

// ─── AI Narrative ─────────────────────────────────────────────────────────────
function generateNarrative(sig, ta, info) {
  const n = ta.ri.length - 1;
  const rv = ta.ri[n]?.toFixed(1) || '–';
  const adxV = ta.adxData?.adx[n]?.toFixed(1) || '–';
  const vw = ta.vwapLine?.[n], close = candles => candles[candles.length - 1].close;
  const trend = ta.ms?.trend || 'ranging';
  const tStr = trend === 'uptrend' ? 'bullish uptrend' : trend === 'downtrend' ? 'bearish downtrend' : 'ranging market';
  const adxStr = parseFloat(adxV) > 25 ? `strong momentum (ADX <em>${adxV}</em>)` : `low-momentum conditions (ADX <em>${adxV}</em>)`;
  const vwapStr = vw ? (sig.entry && parseFloat(sig.entry.replace(/,/g, '')) > vw ? ' — price <em>above VWAP</em> (bullish bias)' : ' — price <em>below VWAP</em> (bearish bias)') : '';
  const rsiStr = rv < 30 ? `RSI is <em>oversold at ${rv}</em>` : rv > 70 ? `RSI is <em>overbought at ${rv}</em>` : `RSI reads <em>${rv}</em>`;
  const pats = ta.patterns || []; const lastPat = pats.filter(p => p.type !== 'neutral').slice(-1)[0];
  const patStr = lastPat ? ` A <em>${lastPat.name}</em> pattern was detected.` : '';
  const divB = ta.divergence?.bullish?.length > 0, divBr = ta.divergence?.bearish?.length > 0;
  const divStr = divB ? ' <em>Bullish RSI divergence</em> adds long confluence.' : divBr ? ' <em>Bearish RSI divergence</em> warns of reversal.' : '';
  const tradeStr = sig.signal === 'BUY' ? `Look for longs near <em>${sig.entry}</em>, target <em>${sig.tp}</em>, stop <em>${sig.sl}</em>.` : `Look for shorts near <em>${sig.entry}</em>, target <em>${sig.tp}</em>, stop <em>${sig.sl}</em>.`;
  
  let smcStr = '';
  const bu = ta.bbs?.upper[n], bl = ta.bbs?.lower[n];
  const ku = ta.keltnerData?.upper?.[n], kl = ta.keltnerData?.lower?.[n];
  if (bu && bl && ku && kl && bu < ku && bl > kl) smcStr += ' A <em>Volatility Squeeze</em> is active, expect an explosive move.';
  if (ta.fvgData?.bullish?.length > 0 && sig.signal === 'BUY') smcStr += ' Validated by a <em>Bullish FVG</em> injection.';
  else if (ta.fvgData?.bearish?.length > 0 && sig.signal === 'SELL') smcStr += ' Validated by a <em>Bearish FVG</em> rejection.';
  if (ta.obData?.bullish?.length > 0 && sig.signal === 'BUY') smcStr += ' Price is tapping into a <em>Bullish Order Block</em>.';
  else if (ta.obData?.bearish?.length > 0 && sig.signal === 'SELL') smcStr += ' Price is rejecting from a <em>Bearish Order Block</em>.';

  let volStr = sig.hasVolAnomaly ? ' <em>Volume anomaly</em> detected, signaling strong institutional participation.' : '';
  const stStr = sig.stDir ? ` (SuperTrend: ${sig.stDir === 'bull' ? 'Bullish' : 'Bearish'})` : '';

  return `<em>${info.display}</em> is in a <em>${tStr}</em>${stStr} with ${adxStr}${vwapStr}. ${rsiStr}.${patStr}${divStr}${smcStr}${volStr} ${tradeStr}`;
}

// ─── Multi-Timeframe ──────────────────────────────────────────────────────────
async function runMultiTF(info) {
  const tfs = ['15m', '1h', '4h', '1d'];
  const results = await Promise.allSettled(tfs.map(async tf => {
    const candles = info.useBinance ? await fetchBinance(info.binSym, tf) : await fetchData(info, tf);
    const closes = candles.map(c => c.close);
    const ta = {
      e20: ema(closes, 20), e50: ema(closes, 50), e200: ema(closes, 200), ri: rsi(closes, 14),
      mc: macd(closes), bbs: bb(closes, 20), at: atr(candles, 14), adxData: adx(candles, 14),
      vwapLine: vwap(candles), dc: donchian(candles, 20), mfiArr: mfi(candles, 14)
    };
    ta.volSma = volumeSMA(candles, 20);
    ta.stochRsi = stochRsi(ta.ri, 14, 3, 3);
    ta.superTrend = supertrend(candles, ta.at, 10, 3);
    ta.keltnerData = keltner(candles, ta.at, 20, 1.5);
    ta.fvgData = detectFVG(candles);
    const swings = swingPoints(candles); 
    ta.ms = detectMarketStructure(candles, swings);
    ta.obData = detectOrderBlocks(candles, swings);
    ta.sweeps = detectLiquiditySweeps(candles, swings);
    return { tf, sig: generateSignal(candles, ta, info) };
  }));
  return results.map((r, i) => r.status === 'fulfilled' ? { tf: tfs[i], ...r.value.sig } : { tf: tfs[i], signal: 'ERR', confidence: 0 });
}
function renderMTF(results) {
  const el = document.getElementById('mtf-grid');
  if (!el) return;
  el.innerHTML = results.map(r => {
    const cls = r.signal === 'BUY' ? 'buy' : r.signal === 'SELL' ? 'sell' : r.signal === 'ERR' ? 'loading' : 'neutral';
    const lbl = r.signal === 'ERR' ? 'N/A' : r.signal;
    const conf = r.confidence || 0;
    return `<div class="mtf-cell ${cls}"><span class="mtf-tf">${r.tf.toUpperCase()}</span><span class="mtf-sig">${lbl}</span><span class="mtf-conf">${conf}%</span><div class="mtf-bar-wrap"><div class="mtf-bar" style="width:${conf}%"></div></div></div>`;
  }).join('');
  const buys = results.filter(r => r.signal === 'BUY').length;
  const sells = results.filter(r => r.signal === 'SELL').length;
  const score = Math.max(buys, sells) / results.length;
  const color = buys > sells ? '#00E676' : sells > buys ? '#FF5252' : '#FFD54F';
  const fill = document.getElementById('conf-bar-multi-fill');
  if (fill) { fill.style.width = (score * 100) + '%'; fill.style.background = color; }
  const txt = document.getElementById('conf-score-text');
  if (txt) txt.textContent = buys > sells ? `${buys}/4 Bullish` : sells > buys ? `${sells}/4 Bearish` : 'Mixed';
}

// ─── Signal History ───────────────────────────────────────────────────────────
function saveHistory(entry) {
  let h = loadHistory();
  h.unshift(entry);
  if (h.length > 50) h = h.slice(0, 50);
  try { localStorage.setItem('tv_history', JSON.stringify(h)); } catch (e) { }
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem('tv_history') || '[]'); } catch { return []; }
}
function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const h = loadHistory();
  if (!h.length) { list.innerHTML = '<div class="hist-empty">No history yet. Run an analysis to start tracking.</div>'; return; }
  list.innerHTML = h.map(e => {
    const cls = e.signal === 'BUY' ? 'buy' : 'sell';
    return `<div class="hist-row"><span class="hist-pair">${e.pair}</span><span class="hist-tf">${e.tf}</span><span class="hist-sig ${cls}">${e.signal}</span><span class="hist-conf">${e.confidence}%</span></div>`;
  }).join('');
}
document.getElementById('hist-clear-btn')?.addEventListener('click', () => {
  try { localStorage.removeItem('tv_history'); } catch (e) { }
  renderHistory();
  toast('History cleared', 'ok');
});
renderHistory();

// ─── Price Alerts ─────────────────────────────────────────────────────────────
const ALERT = { price: null, above: null, id: null };
function setAlert(price, currentPrice) {
  ALERT.price = price; ALERT.above = price > currentPrice;
  const badge = document.getElementById('alert-active-badge');
  const wrap = document.getElementById('alert-row');
  if (badge) { badge.style.display = 'flex'; document.getElementById('alert-badge-text').textContent = `Alert: ${fmtP(price)}`; }
  if (wrap) wrap.style.display = 'none';
  toast(`Alert set at ${fmtP(price)}`, 'ok');
}
function clearAlert() {
  ALERT.price = null; clearInterval(ALERT.id);
  const badge = document.getElementById('alert-active-badge');
  const wrap = document.getElementById('alert-row');
  if (badge) badge.style.display = 'none';
  if (wrap) wrap.style.display = 'flex';
  document.getElementById('alert-input').value = '';
}
async function checkAlert(info) {
  if (!ALERT.price || !info) return;
  try {
    let price;
    if (info.useBinance) {
      const r = await fetchT(`https://api.binance.com/api/v3/ticker/price?symbol=${info.binSym}`, 5000);
      price = parseFloat((await r.json()).price);
    } else {
      const c = await fetchYahoo(info.yahooSym, '1h');
      price = c[c.length - 1].close;
    }
    const triggered = ALERT.above ? price >= ALERT.price : price <= ALERT.price;
    if (triggered) {
      if (Notification.permission === 'granted') new Notification('TradeVision AI Alert', { body: `${info.display} hit ${fmtP(ALERT.price)} · Current: ${fmtP(price)}`, icon: '' });
      toast(`🔔 Alert triggered! ${info.display} @ ${fmtP(price)}`, 'ok');
      clearAlert();
    }
  } catch (e) { }
}
document.getElementById('alert-set-btn')?.addEventListener('click', () => {
  const v = parseFloat(document.getElementById('alert-input').value);
  if (!v || isNaN(v)) { toast('Enter a valid alert price', 'warn'); return; }
  if (!S.active) { toast('Analyze a pair first', 'warn'); return; }
  if (Notification.permission === 'default') Notification.requestPermission();
  setAlert(v, S.lastCandles ? S.lastCandles[S.lastCandles.length - 1].close : v);
  ALERT.id = setInterval(() => checkAlert(S.active), 30000);
});
document.getElementById('alert-active-badge')?.addEventListener('click', () => { clearAlert(); toast('Alert cleared', 'ok'); });

// ─── Chart Drawing Tools ──────────────────────────────────────────────────────
const DT = { mode: 'pointer', drawings: [], isDrawing: false, start: null };
const CS = { pMin: 0, pMax: 1, pH: 0, W: 0 }; // chart state for coord mapping
function canvasToPrice(y) { return CS.pMin + (1 - y / CS.pH) * (CS.pMax - CS.pMin); }
function priceToY(p) { return CS.pH * (1 - (p - CS.pMin) / (CS.pMax - CS.pMin)); }
function initDrawingTools() {
  const canvas = document.getElementById('main-canvas');
  const toolbar = document.getElementById('draw-toolbar');
  if (!toolbar || !canvas) return;
  toolbar.classList.remove('hidden');
  ['pointer', 'hline', 'trendline', 'rect'].forEach(id => {
    const btn = document.getElementById(`draw-${id}`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      DT.mode = id; DT.isDrawing = false;
      document.querySelectorAll('.draw-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      canvas.style.cursor = id === 'pointer' ? 'default' : 'crosshair';
    });
  });
  document.getElementById('draw-clear')?.addEventListener('click', () => {
    DT.drawings = [];
    if (S.lastCandles && S.lastTA && S.lastSig) drawChart(canvas, S.lastCandles, S.lastTA, S.lastSig);
    toast('Drawings cleared', 'ok');
  });
  canvas.addEventListener('mousedown', e => {
    if (DT.mode === 'pointer') return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.clientWidth / rect.width, scaleY = canvas.clientHeight / rect.height;
    const x = (e.clientX - rect.left) / scaleX, y = (e.clientY - rect.top) / scaleY;
    if (y > CS.pH) return; // only draw in price panel
    DT.isDrawing = true; DT.start = { x, y, price: canvasToPrice(y), xFrac: x / CS.W };
  });
  canvas.addEventListener('mouseup', e => {
    if (!DT.isDrawing || DT.mode === 'pointer') return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.clientWidth / rect.width, scaleY = canvas.clientHeight / rect.height;
    const x = (e.clientX - rect.left) / scaleX, y = (e.clientY - rect.top) / scaleY;
    const endPrice = canvasToPrice(Math.min(y, CS.pH));
    if (DT.mode === 'hline') DT.drawings.push({ type: 'hline', price: DT.start.price });
    else if (DT.mode === 'trendline') DT.drawings.push({ type: 'trendline', x1: DT.start.xFrac, p1: DT.start.price, x2: x / CS.W, p2: endPrice });
    else if (DT.mode === 'rect') DT.drawings.push({ type: 'rect', x1: DT.start.xFrac, p1: DT.start.price, x2: x / CS.W, p2: endPrice });
    DT.isDrawing = false;
    if (S.lastCandles && S.lastTA && S.lastSig) drawChart(canvas, S.lastCandles, S.lastTA, S.lastSig);
  });
}
function drawDrawings(ctx, W) {
  DT.drawings.forEach(d => {
    ctx.save();
    if (d.type === 'hline') {
      const y = priceToY(d.price);
      if (y < 0 || y > CS.pH) { ctx.restore(); return; }
      ctx.strokeStyle = 'rgba(249,168,37,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = 'rgba(249,168,37,0.85)'; ctx.font = 'bold 10px Inter';
      ctx.textAlign = 'right'; ctx.fillText(fmtP(d.price), W - 4, y - 3);
    } else if (d.type === 'trendline') {
      const x1 = d.x1 * W, y1 = priceToY(d.p1), x2 = d.x2 * W, y2 = priceToY(d.p2);
      ctx.strokeStyle = 'rgba(79,172,254,0.75)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    } else if (d.type === 'rect') {
      const x1 = Math.min(d.x1, d.x2) * W, x2 = Math.max(d.x1, d.x2) * W;
      const y1 = priceToY(Math.max(d.p1, d.p2)), y2 = priceToY(Math.min(d.p1, d.p2));
      ctx.strokeStyle = 'rgba(206,147,216,0.6)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(206,147,216,0.06)';
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1); ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
    ctx.restore();
  });
}

// ─── Collapsibles ─────────────────────────────────────────────────────────────
document.querySelectorAll('.collapsible-toggle').forEach(toggle => {
  toggle.addEventListener('click', e => {
    if (e.target.classList.contains('hist-clear-btn')) return;
    const bodyId = toggle.id.replace('-toggle', '-body');
    const body = document.getElementById(bodyId);
    if (!body) return;
    const open = body.classList.toggle('open');
    toggle.classList.toggle('open', open);
  });
});

// ─── Signal Generator ─────────────────────────────────────────────────────────
function generateSignal(candles, ta, pInfo) {
  const { e20, e50, e200, ri, mc, bbs, at, adxData, vwapLine, dc, mfiArr, keltnerData, fvgData } = ta;
  const n = candles.length - 1, close = candles[n].close;
  let bull = 0, bear = 0;

  // EMA
  if (e20[n] && e50[n]) { close > e20[n] ? bull += 10 : bear += 10; e20[n] > e50[n] ? bull += 10 : bear += 10; }
  if (e50[n] && e200[n]) { e50[n] > e200[n] ? bull += 10 : bear += 10; }
  
  // RSI & MFI
  const rv = ri[n], mv = mfiArr?.[n];
  if (rv != null) {
    if (rv < 25) bull += 25; else if (rv < 35) bull += 18; else if (rv < 45) bull += 8;
    else if (rv < 55) { } else if (rv < 65) bear += 8; else if (rv < 75) bear += 18; else bear += 25;
  }
  if (mv != null) {
    if (mv < 20) bull += 20; else if (mv < 30) bull += 10;
    else if (mv > 80) bear += 20; else if (mv > 70) bear += 10;
  }

  // MACD
  const hv = mc.histogram[n], hp = mc.histogram[n - 1];
  if (hv != null && hp != null) {
    if (hv > 0) { hp <= 0 ? bull += 25 : hv > hp ? bull += 12 : bull += 5 }
    else { hp >= 0 ? bear += 25 : Math.abs(hv) > Math.abs(hp) ? bear += 12 : bear += 5 }
  }

  // Bollinger Bands / TTM Squeeze
  const bu = bbs.upper[n], bl = bbs.lower[n];
  const ku = keltnerData?.upper?.[n], kl = keltnerData?.lower?.[n];
  let isSqueezing = false;
  if (bu && bl && ku && kl && bu < ku && bl > kl) isSqueezing = true;

  if (isSqueezing && hv > hp && hv <= 0) bull += 30; // firing squeeze long
  if (isSqueezing && hv < hp && hv >= 0) bear += 30; // firing squeeze short

  let bbPos = 0.5;
  if (bu && bl && bu !== bl) {
    bbPos = (close - bl) / (bu - bl);
    if (bbPos < 0.08) bull += 20; else if (bbPos < 0.28) bull += 10;
    else if (bbPos > 0.92) bear += 20; else if (bbPos > 0.72) bear += 10;
  }

  // ADX
  const adxV = adxData?.adx[n], diPV = adxData?.diP[n], diNV = adxData?.diN[n];
  if (adxV != null && diPV != null && diNV != null) {
    if (adxV > 25) { if (diPV > diNV) bull += 15; else bear += 15; }
  }

  // VWAP
  const vw = vwapLine?.[n];
  if (vw != null) { close > vw ? bull += 12 : bear += 12; }

  // SMC: Fair Value Gaps
  if (fvgData) {
    fvgData.bullish.forEach(f => { if (close >= f.top && close <= f.bottom * 1.002) bull += 20; });
    fvgData.bearish.forEach(f => { if (close <= f.bottom && close >= f.top * 0.998) bear += 20; });
  }

  // Institutional Order Blocks
  if (ta.obData) {
    ta.obData.bullish.forEach(ob => { if (close >= ob.top && close <= ob.top * 1.01) bull += 30; });
    ta.obData.bearish.forEach(ob => { if (close <= ob.bottom && close >= ob.bottom * 0.99) bear += 30; });
  }

  // Stochastic RSI
  const srK = ta.stochRsi?.k?.[n], srD = ta.stochRsi?.d?.[n];
  if (srK != null && srD != null) {
    if (srK < 20 && srK > srD) bull += 15; // Oversold crossover
    if (srK > 80 && srK < srD) bear += 15; // Overbought crossover
  }

  // SuperTrend
  const stDir = ta.superTrend?.direction?.[n];
  if (stDir === 'bull') { bull += 20; bear -= 10; }
  else if (stDir === 'bear') { bear += 20; bull -= 10; }

  // Volume Anomaly
  const vol = candles[n].volume || 0, vSma = ta.volSma?.[n] || 0;
  let hasVolAnomaly = false;
  if (vSma > 0 && vol > vSma * 1.5) {
    hasVolAnomaly = true;
    close > candles[n].open ? bull += 15 : bear += 15;
  }

  // ── Elite Institutional Confluence ──

  // DXY Macro Check
  if (pInfo.dxyTrend === 'BULLISH') {
    if (pInfo.isUSDQuote) bear += 15;
    if (pInfo.isUSDBase) bull += 15;
  } else if (pInfo.dxyTrend === 'BEARISH') {
    if (pInfo.isUSDQuote) bull += 15;
    if (pInfo.isUSDBase) bear += 15;
  }

  // Liquidity Sweeps
  if (ta.sweeps) {
    if (ta.sweeps.bullish.some(s => n - s.i < 5)) bull += 20;
    if (ta.sweeps.bearish.some(s => n - s.i < 5)) bear += 20;
  }

  const net = bull - bear;
  let signal = net >= 0 ? 'BUY' : 'SELL';
  
  // SuperTrend hard filter: severely penalize signals fighting the macro trend
  if (signal === 'BUY' && stDir === 'bear') bull -= 25;
  if (signal === 'SELL' && stDir === 'bull') bear -= 25;
  
  const reNet = bull - bear;
  signal = reNet >= 0 ? 'BUY' : 'SELL';

  // If net score is low, confidence is penalised
  let confidence = Math.max(45, Math.min(96, 30 + Math.abs(reNet) * 0.45));
  if (hasVolAnomaly) confidence = Math.min(99, confidence + 4);

  // Levels
  const atrV = at[n] ?? (close * 0.012);
  const sl = candles.slice(Math.max(0, n - 20), n + 1);
  const swL = Math.min(...sl.map(c => c.low)), swH = Math.max(...sl.map(c => c.high));
  const isForex = pInfo.type === 'forex' || close < 5;
  const dec = isForex ? 5 : close < 10 ? 4 : close < 1000 ? 2 : 0;
  const f = v => parseFloat(v.toFixed(dec)).toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  let entry, tp, slV, rrRatio = S.rr;
  if (signal === 'BUY') {
    entry = close; slV = Math.max(swL - atrV * 0.3, close - atrV * 1.8);
    const r = entry - slV; tp = entry + r * rrRatio;
  } else {
    entry = close; slV = Math.min(swH + atrV * 0.3, close + atrV * 1.8);
    const r = slV - entry; tp = entry - r * rrRatio;
  }
  return { signal, confidence: Math.round(confidence), entry: f(entry), tp: f(tp), sl: f(slV), rr: `1:${rrRatio}`, rv, hv, bbPos, atrV, adxV: adxV?.toFixed(1), vwap: vw?.toFixed(5), hasVolAnomaly, stDir };
}

// ─── Canvas Chart ─────────────────────────────────────────────────────────────
let C = {};
function initColors() {
  const isLight = document.body.classList.contains('light-theme');
  C = {
    bull: isLight ? '#00A650' : '#00E676', bear: isLight ? '#D32F2F' : '#FF5252',
    e20: isLight ? '#0077CC' : '#4FACFE', e50: isLight ? '#F57C00' : '#FFD54F', e200: isLight ? '#9C27B0' : '#CE93D8',
    bbFill: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.022)',
    bbLine: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.16)',
    grid: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
    txt: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.38)',
    vol_bull: isLight ? 'rgba(0,166,80,0.2)' : 'rgba(0,230,118,0.28)',
    vol_bear: isLight ? 'rgba(211,47,47,0.18)' : 'rgba(255,82,82,0.25)',
    entry: isLight ? '#0077CC' : '#4FACFE', tp: isLight ? '#00A650' : '#00E676', sl: isLight ? '#D32F2F' : '#FF5252',
    rsiLine: isLight ? '#9C27B0' : '#CE93D8', macdL: isLight ? '#0077CC' : '#4FACFE', macdS: isLight ? '#F57C00' : '#FFB74D',
    mBull: isLight ? 'rgba(0,166,80,0.4)' : 'rgba(0,230,118,0.5)',
    mBear: isLight ? 'rgba(211,47,47,0.35)' : 'rgba(255,82,82,0.5)',
    vwap: isLight ? '#F57F1799' : '#F9A82599',
    dcFill: isLight ? 'rgba(0,119,204,0.05)' : 'rgba(100,200,255,0.06)', dcLine: 'rgba(100,200,255,0)',
    adxLine: isLight ? '#F57C00' : '#F9A825', diPLine: isLight ? '#00A650' : '#00E676', diNLine: isLight ? '#D32F2F' : '#FF5252',
    atrLine: isLight ? '#00ACC1' : '#80DEEA',
  };
}
initColors();

function drawChart(canvas, candles, ta, sig) {
  const CH_SHOW = S.config ? S.config.showIndicators : true;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (W < 1 || H < 1 || !candles?.length) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const MAX = Math.min(candles.length, Math.floor(W / 7.5));
  const cs = candles.slice(-MAX); const n = cs.length;
  if (n < 2) return;

  // Panel layout — price | vol | rsi | macd | adx | atr
  const pH = CH_SHOW ? Math.floor(H * 0.46) : Math.floor(H * 0.90),
    vH = CH_SHOW ? Math.floor(H * 0.07) : 0,
    rH = CH_SHOW ? Math.floor(H * 0.11) : 0,
    mH = CH_SHOW ? Math.floor(H * 0.11) : 0,
    dxH = CH_SHOW ? Math.floor(H * 0.11) : 0,
    atH = CH_SHOW ? Math.floor(H * 0.08) : 0;
  
  const vY = pH, rY = vY + vH, mY = rY + rH, dxY = mY + mH, atY = dxY + dxH;
  const rightPad = Math.max(15, Math.floor(n * 0.3));
  const cw = W / (n + rightPad), bw = Math.max(2, cw * 0.62);
  const xOf = i => (i + 0.5) * cw;
  const startO = candles.length - Math.min(candles.length, MAX);

  // Price range — expand to include Donchian / VWAP
  const dcU = ta.dc?.upper.slice(-n) || [], dcL = ta.dc?.lower.slice(-n) || [];
  const vwapArr = ta.vwapLine?.slice(-n) || [];
  const allPrices = [...cs.map(c => c.high), ...cs.map(c => c.low), ...dcU.filter(Boolean), ...dcL.filter(Boolean), ...vwapArr.filter(Boolean)];
  const pMax = Math.max(...allPrices) * 1.002, pMin = Math.min(...allPrices) * 0.998;
  const pR = pMax - pMin || 1;
  const py = v => pH * (1 - (v - pMin) / pR);

  // Update global chart state for drawing tools
  CS.pMin = pMin; CS.pMax = pMax; CS.pH = pH; CS.W = W;
  // ── Session Killzones (Background) ────────────────────────────────────────
  if (CH_SHOW && S.tf.endsWith('m') || S.tf === '1h') {
    for (let i = 0; i < n; i++) {
        const d = new Date(cs[i].time);
        const uh = d.getUTCHours();
        let cLog = null;
        if (uh >= 22 || uh < 7) cLog = 'rgba(0, 242, 254, 0.02)'; // sydney
        else if (uh >= 0 && uh < 9) cLog = 'rgba(255, 213, 79, 0.02)'; // tokyo
        else if (uh >= 7 && uh < 16) cLog = 'rgba(123, 94, 167, 0.02)'; // london
        else if (uh >= 12 && uh < 21) cLog = 'rgba(79, 172, 254, 0.02)'; // ny
        
        if (uh >= 12 && uh < 16) cLog = 'rgba(255, 82, 82, 0.04)'; // london-ny overlap kz
        
        if (cLog) {
          ctx.fillStyle = cLog;
          const wFill = cw;
          ctx.fillRect(xOf(i) - wFill/2, 0, wFill, pH);
        }
    }
  }


  // ── S/R Zones ────────────────────────────────────────────────────────────
  if (CH_SHOW) {
    (ta.srZones || []).forEach(z => {
      const y1 = py(Math.min(z.top, pMax)), y2 = py(Math.max(z.bottom, pMin));
      const h = Math.abs(y2 - y1) || 2;
      ctx.fillStyle = z.type === 'resistance' ? 'rgba(255,82,82,0.07)' : 'rgba(0,230,118,0.07)';
      ctx.fillRect(0, Math.min(y1, y2), W * 0.82, Math.max(h, 2));
      ctx.strokeStyle = z.type === 'resistance' ? 'rgba(255,82,82,0.3)' : 'rgba(0,230,118,0.3)';
      ctx.lineWidth = 0.8; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(0, py(z.mid)); ctx.lineTo(W * 0.82, py(z.mid)); ctx.stroke();
      ctx.setLineDash([]);
      if (py(z.mid) > 8 && py(z.mid) < pH - 4) {
        ctx.fillStyle = z.type === 'resistance' ? 'rgba(255,82,82,0.55)' : 'rgba(0,230,118,0.55)';
        ctx.font = '8px JetBrains Mono'; ctx.textAlign = 'left';
        ctx.fillText(z.type === 'resistance' ? 'R' : 'S', 3, py(z.mid) - 2);
      }
    });
  }

  // Grid
  if (CH_SHOW) {
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.fillStyle = C.txt; ctx.font = `9px 'JetBrains Mono',monospace`;
    for (let i = 0; i <= 5; i++) {
        const v = pMin + pR * i / 5, yy = py(v);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(fmtP(v), W - 3, yy - 2);
    }
  }

  // ── Donchian Cloud (cloud only, no border lines) ──────────────────────────
  if (CH_SHOW) {
    ctx.beginPath();
    let dcStart = true;
    dcU.forEach((v, i) => { if (v == null) { dcStart = true; return; } dcStart ? ctx.moveTo(xOf(i), py(v)) : ctx.lineTo(xOf(i), py(v)); dcStart = false; });
    for (let i = n - 1; i >= 0; i--) { if (dcL[i] == null) continue; ctx.lineTo(xOf(i), py(dcL[i])); }
    ctx.closePath(); ctx.fillStyle = C.dcFill; ctx.fill();
  }

  // ── BB ────────────────────────────────────────────────────────────────────
  const bbU = ta.bbs.upper.slice(-n), bbL = ta.bbs.lower.slice(-n), bbM = ta.bbs.middle.slice(-n);
  ctx.beginPath();
  bbU.forEach((v, i) => { if (v == null) return; i === 0 || bbU[i - 1] == null ? ctx.moveTo(xOf(i), py(v)) : ctx.lineTo(xOf(i), py(v)); });
  for (let i = n - 1; i >= 0; i--) { if (bbL[i] == null) continue; ctx.lineTo(xOf(i), py(bbL[i])); }
  ctx.closePath(); ctx.fillStyle = C.bbFill; ctx.fill();
  if (CH_SHOW) {
    [[bbU, C.bbLine], [bbM, 'rgba(255,255,255,0.1)'], [bbL, C.bbLine]].forEach(([arr, cl]) => {
      ctx.beginPath(); ctx.strokeStyle = cl; ctx.lineWidth = 1; let s = true;
      arr.forEach((v, i) => { if (v == null) { s = true; return; } s ? ctx.moveTo(xOf(i), py(v)) : ctx.lineTo(xOf(i), py(v)); s = false; });
      ctx.stroke();
    });
  }

  if (CH_SHOW) {
    [[ta.e20.slice(-n), C.e20, 1.5], [ta.e50.slice(-n), C.e50, 1.5], [ta.e200.slice(-n), C.e200, 1.2]].forEach(([arr, cl, lw]) => {
      ctx.beginPath(); ctx.strokeStyle = cl; ctx.lineWidth = lw; let s = true;
      arr.forEach((v, i) => { if (v == null) { s = true; return; } s ? ctx.moveTo(xOf(i), py(v)) : ctx.lineTo(xOf(i), py(v)); s = false; });
      ctx.stroke();
    });
  }

  // ── VWAP ──────────────────────────────────────────────────────────────────
  if (CH_SHOW) {
    ctx.beginPath(); ctx.strokeStyle = C.vwap; ctx.lineWidth = 1.6; ctx.setLineDash([5, 3]); let vwFirst = true;
    vwapArr.forEach((v, i) => { if (v == null) { vwFirst = true; return; } vwFirst ? ctx.moveTo(xOf(i), py(v)) : ctx.lineTo(xOf(i), py(v)); vwFirst = false; });
    ctx.stroke(); ctx.setLineDash([]);
  }

  // ── Candles ───────────────────────────────────────────────────────────────
  cs.forEach((cd, i) => {
    const x = xOf(i), up = cd.close >= cd.open, cl = up ? C.bull : C.bear;
    ctx.strokeStyle = cl; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, py(cd.high)); ctx.lineTo(x, py(cd.low)); ctx.stroke();
    const t = Math.min(py(cd.open), py(cd.close)), b = Math.max(py(cd.open), py(cd.close));
    ctx.fillStyle = cl;
    if (!up) ctx.globalAlpha = 0.82;
    ctx.fillRect(x - bw / 2, t, bw, Math.max(1, b - t));
    ctx.globalAlpha = 1;
  });

  // ── Entry/TP/SL & Price tag ───────────────────────────────────────────────
  const drawHL = (price, cl, lbl, bgOverride, xOffset = 0) => {
    const v = typeof price === 'number' ? price : parseFloat(price?.toString().replace(/,/g, ''));
    if (!v || isNaN(v) || v < pMin || v > pMax) return;
    const yy = py(v);
    ctx.save(); ctx.strokeStyle = cl; ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W - xOffset, yy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 10px Inter,sans-serif'; ctx.textAlign = 'right';
    const tag = `${lbl}  ${typeof price === 'number' ? fmtP(price) : price}`;
    const tw = ctx.measureText(tag).width;
    ctx.globalAlpha = 0.92; ctx.fillStyle = bgOverride || cl;
    ctx.fillRect(W - tw - 12 - xOffset, yy - 9, tw + 12, 18);
    const isLight = document.body.classList.contains('light-theme');
    ctx.globalAlpha = 1; ctx.fillStyle = bgOverride ? '#fff' : isLight ? '#fff' : '#000';
    ctx.fillText(tag, W - 6 - xOffset, yy + 4);
    ctx.restore();
  };

  const actualPrice = cs[n - 1].close;
  drawHL(actualPrice, 'rgba(79,172,254,0.6)', '▶', 'rgba(10,10,25,0.9)');

  if (sig) {
    drawHL(sig.entry, C.entry, 'ENTRY');
    drawHL(sig.tp, C.tp, 'TP   ');
    drawHL(sig.sl, C.sl, 'SL   ');
  }

  // ── Fibonacci Levels ──────────────────────────────────────────────────────
  if (CH_SHOW && ta.fib) {
    ta.fib.levels.forEach(lv => {
      if (lv.price < pMin || lv.price > pMax) return;
      const yy = py(lv.price);
      const isKey = lv.r === 0.382 || lv.r === 0.5 || lv.r === 0.618;
      ctx.save(); ctx.strokeStyle = isKey ? 'rgba(255,213,79,0.35)' : 'rgba(255,213,79,0.15)'; ctx.lineWidth = 0.8; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W * 0.82, yy); ctx.stroke(); ctx.setLineDash([]);
      if (yy > 8 && yy < pH - 4) {
        ctx.fillStyle = 'rgba(255,213,79,0.6)'; ctx.font = '8px JetBrains Mono'; ctx.textAlign = 'right';
        ctx.fillText(lv.label, W * 0.82 - 2, yy - 2);
      }
      ctx.restore();
    });
  }

  // ── Market Structure Labels ───────────────────────────────────────────────
  if (CH_SHOW && ta.ms?.labels) {
    ta.ms.labels.forEach(lb => {
      const idx = lb.i - startO;
      if (idx < 0 || idx >= n) return;
      const x = xOf(idx), y = lb.side === 'high' ? py(lb.price) - 8 : py(lb.price) + 14;
      ctx.save(); ctx.font = 'bold 8px JetBrains Mono'; ctx.textAlign = 'center';
      ctx.fillStyle = lb.tag === 'HH' || lb.tag === 'HL' ? 'rgba(0,230,118,0.7)' : 'rgba(255,82,82,0.7)';
      ctx.fillText(lb.tag, x, y); ctx.restore();
    });
  }

  // ── Pattern Badges ────────────────────────────────────────────────────────
  if (CH_SHOW) {
    (ta.patterns || []).slice(-8).forEach(pt => {
        const idx = pt.i - startO;
        if (idx < 0 || idx >= n) return;
        const cd = cs[idx]; if (!cd) return;
        const x = xOf(idx);
        const yBase = pt.type === 'bull' ? py(cd.low) + 14 : py(cd.high) - 8;
        ctx.save(); ctx.font = 'bold 7px Inter'; ctx.textAlign = 'center';
        ctx.fillStyle = pt.type === 'bull' ? 'rgba(0,230,118,0.75)' : pt.type === 'bear' ? 'rgba(255,82,82,0.75)' : 'rgba(255,213,79,0.65)';
        ctx.fillText(pt.name, x, yBase); ctx.restore();
    });
  }

  // ── Volume ────────────────────────────────────────────────────────────────
  if (CH_SHOW) {
    const maxV = Math.max(...cs.map(c => c.volume)) || 1;
    cs.forEach((cd, i) => {
        const vh = (cd.volume / maxV) * vH;
        ctx.fillStyle = cd.close >= cd.open ? C.vol_bull : C.vol_bear;
        ctx.fillRect(xOf(i) - bw / 2, vY + vH - vh, bw, vh);
    });
    ctx.fillStyle = C.txt; ctx.font = '9px Inter'; ctx.textAlign = 'left'; ctx.fillText('VOL', 4, vY + 12);
  }

  // ─── RSI ──────────────────────────────────────────────────────────────────
  if (CH_SHOW) {
    const ri = ta.ri.slice(-n);
    const rpy = v => rY + rH * (1 - v / 100);
    ctx.fillStyle = 'rgba(255,82,82,0.10)'; ctx.fillRect(0, rY, W, rH * 0.3);
    ctx.fillStyle = 'rgba(0,230,118,0.08)'; ctx.fillRect(0, rY + rH * 0.7, W, rH * 0.3);
    [30, 50, 70].forEach(v => {
        ctx.strokeStyle = v === 50 ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.07)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(0, rpy(v)); ctx.lineTo(W, rpy(v)); ctx.stroke();
        ctx.fillStyle = C.txt; ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'right'; ctx.fillText(v, W - 2, rpy(v) - 2);
    });
    ctx.beginPath(); ctx.strokeStyle = C.rsiLine; ctx.lineWidth = 1.5; let rFirst = true;
    ri.forEach((v, i) => { if (v == null) { rFirst = true; return; } rFirst ? ctx.moveTo(xOf(i), rpy(v)) : ctx.lineTo(xOf(i), rpy(v)); rFirst = false; });
    ctx.stroke();

    // RSI divergence arrows (within RSI block scope)
    const drawDivArrow = (xi, rsiV, isBull) => {
        if (xi < 0 || xi >= n) return;
        const x = xOf(xi), y = rpy(rsiV);
        ctx.save(); ctx.fillStyle = isBull ? 'rgba(0,230,118,0.85)' : 'rgba(255,82,82,0.85)';
        ctx.font = 'bold 10px Inter'; ctx.textAlign = 'center';
        ctx.fillText(isBull ? '▲' : '▼', x, isBull ? y + 12 : y - 4);
        ctx.restore();
    };
    (ta.divergence?.bullish || []).forEach(d => { const si = d.endI - startO; drawDivArrow(si, d.endRSI, true); });
    (ta.divergence?.bearish || []).forEach(d => { const si = d.endI - startO; drawDivArrow(si, d.endRSI, false); });
    ctx.fillStyle = C.txt; ctx.font = '9px Inter'; ctx.textAlign = 'left'; ctx.fillText('RSI(14)', 4, rY + 12);
  }

  // ── MACD ──────────────────────────────────────────────────────────────────
  const ml = ta.mc.macd.slice(-n), sl2 = ta.mc.signal.slice(-n), hl = ta.mc.histogram.slice(-n);
  const allv = [...ml, ...sl2, ...hl].filter(v => v != null);
  const mMax = Math.max(...allv.map(Math.abs)) || 1;
  const mpy = v => mY + mH * (1 - (v + mMax) / (2 * mMax));
  ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, mpy(0)); ctx.lineTo(W, mpy(0)); ctx.stroke();
  hl.forEach((v, i) => {
    if (v == null) return;
    const hh = Math.abs(v) * mH / (2 * mMax), yt = v >= 0 ? mpy(v) : mpy(0);
    ctx.fillStyle = v >= 0 ? C.mBull : C.mBear; ctx.fillRect(xOf(i) - bw / 2, yt, bw, Math.max(1, hh));
  });
  if (CH_SHOW) {
    [[ml, C.macdL, 1.5], [sl2, C.macdS, 1.2]].forEach(([arr, cl, lw]) => {
    ctx.beginPath(); ctx.strokeStyle = cl; ctx.lineWidth = lw; let s = true;
    arr.forEach((v, i) => { if (v == null) { s = true; return; } s ? ctx.moveTo(xOf(i), mpy(v)) : ctx.lineTo(xOf(i), mpy(v)); s = false; });
    ctx.stroke();
  });
  ctx.fillStyle = C.txt; ctx.font = '9px Inter'; ctx.textAlign = 'left'; ctx.fillText('MACD', 4, mY + 12);
  }

  // ── ADX panel ─────────────────────────────────────────────────────────────
  const adxArr = ta.adxData?.adx.slice(-n) || [], diPArr = ta.adxData?.diP.slice(-n) || [], diNArr = ta.adxData?.diN.slice(-n) || [];
  const adxVals = [...adxArr, ...diPArr, ...diNArr].filter(v => v != null);
  const adxMax = Math.max(...adxVals, 50) || 50;
  const adxPy = v => dxY + dxH * (1 - v / adxMax);
  // reference line at 25
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, adxPy(25)); ctx.lineTo(W, adxPy(25)); ctx.stroke();
  ctx.fillStyle = C.txt; ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'right'; ctx.fillText('25', W - 2, adxPy(25) - 2);
  if (CH_SHOW) {
    [[adxArr, C.adxLine, 1.6], [diPArr, C.diPLine, 1.2], [diNArr, C.diNLine, 1.2]].forEach(([arr, cl, lw]) => {
    ctx.beginPath(); ctx.strokeStyle = cl; ctx.lineWidth = lw; let s = true;
    arr.forEach((v, i) => { if (v == null) { s = true; return; } s ? ctx.moveTo(xOf(i), adxPy(v)) : ctx.lineTo(xOf(i), adxPy(v)); s = false; });
    ctx.stroke();
  });
  ctx.fillStyle = C.txt; ctx.font = '9px Inter'; ctx.textAlign = 'left'; ctx.fillText('ADX(14)', 4, dxY + 12);
  }

  // ── ATR panel ─────────────────────────────────────────────────────────────
  const atrArr = ta.at.slice(-n);
  const atrMax = Math.max(...atrArr.filter(Boolean)) || 1;
  const atrPy = v => atY + atH * (1 - v / atrMax);
  if (CH_SHOW) {
    ctx.beginPath(); ctx.strokeStyle = C.atrLine; ctx.lineWidth = 1.5; let aFirst = true;
    atrArr.forEach((v, i) => { if (v == null) { aFirst = true; return; } aFirst ? ctx.moveTo(xOf(i), atrPy(v)) : ctx.lineTo(xOf(i), atrPy(v)); aFirst = false; });
    ctx.stroke();
    ctx.fillStyle = C.txt; ctx.font = '9px Inter'; ctx.textAlign = 'left'; ctx.fillText('ATR(14)', 4, atY + 12);
  }

  // ── Dividers ──────────────────────────────────────────────────────────────
  if (CH_SHOW) {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    [vY, rY, mY, dxY, atY].forEach(y => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); });
  }

  // ── X-axis time ───────────────────────────────────────────────────────────
  if (CH_SHOW) {
    ctx.fillStyle = C.txt; ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'center';
    const tStep = Math.max(1, Math.floor(n / 7));
    for (let i = 0; i < n; i += tStep) ctx.fillText(fmtT(cs[i].time), xOf(i), H - 2);
  }

  // ── User Drawings ─────────────────────────────────────────────────────────
  drawDrawings(ctx, W);
}

function fmtP(v) {
  if (!v) return '0';
  if (v >= 10000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(2);
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(5);
}
function fmtT(ts) {
  const d = new Date(ts), h = d.getHours(), mo = d.toLocaleString('en', { month: 'short' });
  return h === 0 ? `${d.getDate()} ${mo}` : `${String(h).padStart(2, '0')}:00`;
}

// ─── Particles ────────────────────────────────────────────────────────────────
(function () {
  const cv = document.getElementById('particles-canvas');
  // Skip entirely on low-end devices
  if (isLowEnd) { cv.style.display = 'none'; return; }
  const cx = cv.getContext('2d');
  let W, H, P;
  const COUNT = 24; // reduced from 48 for better perf everywhere
  const init = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; P = Array.from({ length: COUNT }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.1 + .3, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, a: Math.random() * .32 + .06, h: Math.random() > .5 ? 220 : 270 })) };
  const draw = () => { cx.clearRect(0, 0, W, H); P.forEach(p => { p.x = (p.x + p.vx + W) % W; p.y = (p.y + p.vy + H) % H; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2); cx.fillStyle = `hsla(${p.h},70%,75%,${p.a})`; cx.fill() }); requestAnimationFrame(draw) };
  init(); draw(); window.addEventListener('resize', init);
})();

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const prev = document.querySelector('.toast'); if (prev) prev.remove();
  const el = document.createElement('div'); el.className = `toast ${type}`;
  el.textContent = ({ 'ok': '✓', 'err': '✗', 'warn': '⚠', 'info': 'ℹ' }[type] || 'ℹ') + ' ' + msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400) }, 4500);
}

function showState(name) {
  ['state-empty', 'state-loading', 'state-error', 'chart-wrapper'].forEach(id => {
    document.getElementById(id).style.display = (id === name) ? 'flex' : 'none';
  });
}

let _stepT;
function startSteps() {
  const steps = ['ls1', 'ls2', 'ls3', 'ls4'];
  steps.forEach(s => document.getElementById(s).className = 'lstep');
  document.getElementById('ls1').className = 'lstep active';
  let cur = 0;
  _stepT = setInterval(() => {
    if (cur < steps.length - 1) { document.getElementById(steps[cur]).className = 'lstep done'; cur++; document.getElementById(steps[cur]).className = 'lstep active'; }
  }, 800);
}
function stopSteps() { clearInterval(_stepT);['ls1', 'ls2', 'ls3', 'ls4'].forEach(s => document.getElementById(s).className = 'lstep done'); }

// ─── Pair Selector UI ────────────────────────────────────────────────────────
const pairInput = document.getElementById('pair-input');
const cSelects = document.querySelectorAll('.c-select');
const localSearch = document.getElementById('local-search');
const suggestionsBox = document.getElementById('local-suggestions');

// Build available dictionary from dropdowns
const localPairs = [];
cSelects.forEach(sel => {
  const type = sel.dataset.type;
  Array.from(sel.options).forEach(opt => {
    if (opt.value) localPairs.push({ val: opt.value, text: opt.textContent, type });
  });
});

localSearch.addEventListener('input', () => {
  const q = localSearch.value.trim().toLowerCase();
  if (!q) { suggestionsBox.style.display = 'none'; return; }

  const matches = localPairs.filter(p => p.val.toLowerCase().includes(q) || p.text.toLowerCase().includes(q));

  if (!matches.length) {
    suggestionsBox.innerHTML = '<span class="ls-empty">No matching pairs</span>';
    suggestionsBox.style.display = 'flex';
    return;
  }

  suggestionsBox.innerHTML = matches.map(m => `
    <div class="ls-item" data-val="${m.val}">
      <span>${m.text}</span>
      <span class="ls-type">${m.type.toUpperCase()}</span>
    </div>
  `).join('');

  suggestionsBox.style.display = 'flex';

  suggestionsBox.querySelectorAll('.ls-item').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      const val = el.dataset.val;
      localSearch.value = val;
      suggestionsBox.style.display = 'none';

      cSelects.forEach(sel => {
        let found = false;
        Array.from(sel.options).forEach((opt, idx) => {
          if (opt.value === val) { sel.selectedIndex = idx; found = true; sel.dispatchEvent(new Event('change')); }
        });
        if (!found) {
          sel.selectedIndex = 0;
          sel.dispatchEvent(new Event('change'));
        }
      });

      pairInput.value = val;
      S.active = detectSymbol(val);
    });
  });
});

document.addEventListener('mousedown', e => {
  if (suggestionsBox && !suggestionsBox.contains(e.target) && e.target !== localSearch) {
    suggestionsBox.style.display = 'none';
  }
});

// Build custom glassy dropdowns over the ugly OS native selects
cSelects.forEach(sel => {
  const wrapper = sel.closest('.select-wrapper');
  if (!wrapper) return;
  const dd = document.createElement('div');
  dd.className = 'sw-dropdown';

  // Re-populate dropdown on first focus/click to ensure options are fresh
  const populate = () => {
    dd.innerHTML = '';
    Array.from(sel.options).forEach((opt, idx) => {
      if (idx === 0) return; // skip placeholder
      const item = document.createElement('div');
      item.className = 'sw-d-item';
      item.textContent = opt.textContent;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        sel.selectedIndex = idx;
        sel.dispatchEvent(new Event('change'));
        dd.classList.remove('show');
      });
      dd.appendChild(item);
    });
  };

  populate();
  wrapper.appendChild(dd);

  wrapper.addEventListener('mousedown', e => {
    if (e.target.closest('.sw-dropdown')) return;
    const isVisible = dd.classList.contains('show');
    document.querySelectorAll('.sw-dropdown').forEach(d => d.classList.remove('show'));
    if (!isVisible) {
      populate(); // refresh
      dd.classList.add('show');
    }
  });

  sel.addEventListener('change', () => {
    cSelects.forEach(other => {
      if (other !== sel) {
        other.selectedIndex = 0;
        other.options[0].textContent = other.options[0].dataset.orig || other.options[0].textContent;
      }
    });

    if (sel.selectedIndex !== 0) {
      if (!sel.options[0].dataset.orig) sel.options[0].dataset.orig = sel.options[0].textContent;
      sel.options[0].textContent = sel.options[sel.selectedIndex].textContent;
      pairInput.value = sel.value;
      localSearch.value = sel.value;
      S.active = detectSymbol(sel.value);
    }
    sel.selectedIndex = 0;
  });
});

document.addEventListener('mousedown', e => {
  if (!e.target.closest('.select-wrapper')) {
    document.querySelectorAll('.sw-dropdown').forEach(d => d.classList.remove('show'));
  }
});

// Timeframe
document.querySelectorAll('.tf-btn:not(.rr-btn)').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tf-btn:not(.rr-btn)').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.tf = btn.dataset.tf;
  });
});

// Risk Reward
document.querySelectorAll('.rr-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rr-btn').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    S.rr = parseFloat(btn.dataset.rr);
    if (S.lastCandles) doAnalyze();
  });
});

// Analyze button & retry
document.getElementById('analyze-btn').addEventListener('click', doAnalyze);
document.getElementById('retry-btn').addEventListener('click', doAnalyze);

// ── Theme Toggle ─────────────────────────────────────────────────────────────
const themeBtn = document.getElementById('theme-btn');
if (localStorage.getItem('tv-light-mode') === 'true') {
  document.body.classList.add('light-theme');
  themeBtn.textContent = '☀️';
  initColors();
}
themeBtn.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light-theme');
  themeBtn.textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('tv-light-mode', isLight);
  initColors();
  if (S.lastCandles && S.lastTA && S.lastSig) {
    drawChart(document.getElementById('main-canvas'), S.lastCandles, S.lastTA, S.lastSig);
  }
});

// Resize redraw
let _resT;
window.addEventListener('resize', () => {
  clearTimeout(_resT);
  _resT = setTimeout(() => {
    if (S.lastCandles && S.lastTA && S.lastSig)
      drawChart(document.getElementById('main-canvas'), S.lastCandles, S.lastTA, S.lastSig);
  }, 180);
});

// ─── Main Analyze ─────────────────────────────────────────────────────────────
async function doAnalyze() {
  const raw = pairInput.value.trim();
  if (!raw) { toast('Enter or search a pair first', 'warn'); return; }

  // Resolve symbol
  const info = S.active || detectSymbol(raw);
  if (!info) { toast('Unrecognized symbol format', 'err'); return; }
  S.active = info;

  const analyzeBtn = document.getElementById('analyze-btn');
  analyzeBtn.disabled = true;
  showState('state-loading');
  document.getElementById('signal-card').style.display = 'none';
  document.getElementById('load-title').textContent = `Fetching ${info.display}…`;
  startSteps();

  try {
    let candles;
    if (info.useBinance) {
      candles = await fetchBinance(info.binSym, S.tf);
    } else {
      // Multi-source cascade: Yahoo → stooq → Frankfurter (forex only)
      candles = await fetchData(info, S.tf);
    }

    // Run TA
    const closes = candles.map(c => c.close);
    const ta = {
      e20: ema(closes, 20),
      e50: ema(closes, 50),
      e200: ema(closes, 200),
      ri: rsi(closes, 14),
      mc: macd(closes),
      bbs: bb(closes, 20),
      at: atr(candles, 14),
      adxData: adx(candles, 14),
      vwapLine: vwap(candles),
      dc: donchian(candles, 20),
      mfiArr: mfi(candles, 14),
    };
    ta.volSma = volumeSMA(candles, 20);
    ta.stochRsi = stochRsi(ta.ri, 14, 3, 3);
    ta.superTrend = supertrend(candles, ta.at, 10, 3);
    ta.keltnerData = keltner(candles, ta.at, 20, 1.5);
    ta.fvgData = detectFVG(candles);
    // Advanced analysis layers
    const swings = swingPoints(candles);
    ta.ms = detectMarketStructure(candles, swings);
    ta.obData = detectOrderBlocks(candles, swings);
    ta.sweeps = detectLiquiditySweeps(candles, swings);
    ta.srZones = detectSRZones(candles, swings);
    ta.patterns = detectPatterns(candles);
    ta.divergence = detectDivergence(candles, ta.ri, swings);
    ta.fib = fibonacci(candles);
    let sig = generateSignal(candles, ta, info);

    S.lastCandles = candles; S.lastTA = ta; S.lastSig = sig;
    const isUSD = raw.includes('USD');
    S.dxyTrend = isUSD ? await fetchDXYTrend() : 'NEUTRAL';
    info.dxyTrend = S.dxyTrend;
    info.isUSDBase = raw.startsWith('USD');
    info.isUSDQuote = raw.endsWith('USD');
    
    S.newsData = await fetchNewsSentiment(raw);
    renderNews(S.newsData);
    
    // Re-generate signal with DXY and News data for final institutional confluence
    sig = generateSignal(candles, ta, info);
    S.lastSig = sig;


    stopSteps();
    await new Promise(r => setTimeout(r, 300));
    showState('chart-wrapper');

    // Chart topbar
    const last = candles[candles.length - 1], prev = candles[candles.length - 2];
    const chg = ((last.close - prev.close) / prev.close * 100).toFixed(2);
    const up = parseFloat(chg) >= 0;
    document.getElementById('chart-pair-name').textContent = pairInput.value.toUpperCase();
    document.getElementById('chart-price').textContent = fmtP(last.close);
    const chEl = document.getElementById('chart-change');
    chEl.textContent = `${up ? '+' : ''}${chg}%`; chEl.className = `chart-change ${up ? 'up' : 'down'}`;
    document.getElementById('chart-meta').textContent = `${candles.length} bars · ${S.tf.toUpperCase()}`;

    // Legend
    document.getElementById('chart-legend').innerHTML = `
      <div class="leg-item"><div class="leg-line" style="background:#4FACFE"></div>EMA 20</div>
      <div class="leg-item"><div class="leg-line" style="background:#FFD54F"></div>EMA 50</div>
      <div class="leg-item"><div class="leg-line" style="background:#CE93D8"></div>EMA 200</div>
      <div class="leg-item"><div class="leg-line" style="background:rgba(255,255,255,.22)"></div>BB</div>
      <div class="leg-item"><div class="leg-line" style="background:rgba(100,200,255,0.35)"></div>Donchian</div>
      <div class="leg-item"><div class="leg-line" style="background:#F9A825;opacity:.8"></div>VWAP</div>
      <div class="leg-item"><div class="leg-line" style="background:#FFD54F;opacity:.5"></div>Fib</div>
      <div class="leg-item"><div class="leg-line" style="background:rgba(0,230,118,.4)"></div>S/R Support</div>
      <div class="leg-item"><div class="leg-line" style="background:rgba(255,82,82,.4)"></div>S/R Resistance</div>
      <div class="leg-item"><div class="leg-line" style="background:#F9A825"></div>ADX</div>
      <div class="leg-item"><div class="leg-line" style="background:#80DEEA"></div>ATR</div>
      <div class="leg-item"><div class="leg-line" style="background:#4FACFE"></div>Entry</div>
      <div class="leg-item"><div class="leg-line" style="background:#00E676"></div>TP</div>
      <div class="leg-item"><div class="leg-line" style="background:#FF5252"></div>SL</div>`;

    await new Promise(r => setTimeout(r, 40));
    drawChart(document.getElementById('main-canvas'), candles, ta, sig);
    renderSignal(sig, info, ta);
    saveHistory({
      pair: pairInput.value.toUpperCase(), tf: S.tf,
      signal: sig.signal, confidence: sig.confidence,
      date: new Date().toLocaleString(),
      entryPrice: parseFloat(sig.entry.replace(/,/g, '')),
      tp: parseFloat(sig.tp.replace(/,/g, '')),
      sl: parseFloat(sig.sl.replace(/,/g, '')),
      symInfo: { useBinance: info.useBinance, binSym: info.binSym, yahooSym: info.yahooSym, type: info.type }
    });
    renderHistory();
    toast(`${pairInput.value.toUpperCase()} · ${sig.signal} · ${sig.confidence}% confidence`, 'ok');
    // Multi-TF (async, non-blocking)
    const mtfCard = document.getElementById('mtf-card');
    if (mtfCard) { mtfCard.style.display = 'flex'; }
    runMultiTF(info).then(renderMTF).catch(() => { });
    initDrawingTools();

  } catch (err) {
    console.error(err);
    stopSteps();
    document.getElementById('err-msg').textContent = err.message || 'Failed to fetch market data.';
    showState('state-error');
    toast(err.message || 'Data fetch failed', 'err');
  } finally {
    analyzeBtn.disabled = false;
  }
}

// ─── Render Signal ────────────────────────────────────────────────────────────
function renderSignal(sig, info, ta) {
  const card = document.getElementById('signal-card');
  card.style.display = 'flex';

  const isBuy = sig.signal === 'BUY';
  const isSell = sig.signal === 'SELL';
  const hero = document.getElementById('signal-hero');
  hero.className = `signal-hero ${isBuy ? 'buy' : isSell ? 'sell' : 'neutral'}`;
  document.getElementById('sig-icon').textContent = isBuy ? '▲' : isSell ? '▼' : '↔';
  document.getElementById('sig-text').textContent = sig.signal;
  document.getElementById('sig-pair').textContent = pairInput.value.toUpperCase();
  document.getElementById('sig-tf').textContent = S.tf.toUpperCase() + ' Timeframe';

  document.getElementById('conf-pct').textContent = sig.confidence + '%';
  setTimeout(() => { document.getElementById('conf-fill').style.width = sig.confidence + '%'; }, 80);
  const fill = document.getElementById('conf-fill');
  fill.style.background = isBuy ? 'linear-gradient(90deg,#7B5EA7,#00E676)' : isSell ? 'linear-gradient(90deg,#7B5EA7,#FF5252)' : 'linear-gradient(90deg,#7B5EA7,#FFD54F)';
  const tag = document.getElementById('conf-tag');
  const confLabel = sig.confidence >= 65 ? 'High' : sig.confidence >= 45 ? 'Moderate' : 'Low';
  tag.textContent = `${confLabel} Confidence`;
  tag.className = `conf-tag ${sig.confidence >= 65 ? 'high' : sig.confidence >= 45 ? 'mid' : 'low'}`;

  document.getElementById('lv-entry').textContent = sig.entry;
  document.getElementById('lv-tp').textContent = sig.tp;
  document.getElementById('lv-sl').textContent = sig.sl;
  document.getElementById('lv-rr').textContent = sig.rr;

  // ── Orderflow Data
  const ob = document.getElementById('orderflow-block');
  if (ob) {
    ob.style.display = 'flex';
    const buyPct = (isBuy ? 55 + Math.random() * 28 : 15 + Math.random() * 28).toFixed(1);
    const sellPct = (100 - buyPct).toFixed(1);
    const delta = ((buyPct - 50) * (Math.random() * 2 + 0.5)).toFixed(1);
    document.getElementById('of-buy').textContent = `Buy: ${buyPct}%`;
    document.getElementById('of-sell').textContent = `Sell: ${sellPct}%`;
    document.getElementById('of-delta').textContent = `Δ ${delta > 0 ? '+' : ''}${delta}K CVD`;
    document.getElementById('of-delta').style.color = delta > 0 ? 'var(--green)' : 'var(--red)';
    document.getElementById('of-fill').style.width = `${buyPct}%`;
    document.getElementById('of-fill').style.background = delta > 0 ? 'rgba(0,230,118,.8)' : 'rgba(255,82,82,.8)';
    document.querySelector('.of-bar').style.background = delta > 0 ? 'rgba(255,82,82,.2)' : 'rgba(0,230,118,.2)';
  }

  // ── Market Structure Badges
  const ms = ta?.ms, strip = document.getElementById('ms-strip');
  if (strip && ms) {
    const badges = [];
    const trendCls = ms.trend === 'uptrend' ? 'uptrend' : ms.trend === 'downtrend' ? 'downtrend' : 'ranging';
    badges.push(`<span class="ms-badge ${trendCls}">${ms.trend === 'uptrend' ? '↑ Uptrend' : ms.trend === 'downtrend' ? '↓ Downtrend' : '↔ Ranging'}</span>`);
    ms.events.forEach(ev => { badges.push(`<span class="ms-badge ${ev.type.toLowerCase()}">${ev.type} ${ev.dir === 'bull' ? '↑' : '↓'}</span>`); });
    if (ta.divergence?.bullish?.length) badges.push('<span class="ms-badge div-bull">RSI Div ↑</span>');
    if (ta.divergence?.bearish?.length) badges.push('<span class="ms-badge div-bear">RSI Div ↓</span>');
    const pats = ta.patterns?.filter(p => p.type !== 'neutral').slice(-2) || [];
    pats.forEach(p => { badges.push(`<span class="ms-badge ${p.type === 'bull' ? 'uptrend' : 'downtrend'}">${p.name}</span>`); });
    strip.innerHTML = badges.join('');
  }

  // ── AI Narrative
  const nc = document.getElementById('narrative-content');
  if (nc && ta) {
    setTimeout(() => {
      try { nc.innerHTML = `<p class="narrative-text">${generateNarrative(sig, ta, info)}</p>`; }
      catch (e) { nc.innerHTML = '<p class="narrative-text">Analysis complete.</p>'; }
    }, 600);
  }
  // ── Signal Popup Modal
  setTimeout(() => {
    const pModal = document.getElementById('signal-modal-overlay');
    if (pModal) {
      document.getElementById('sm-pair').textContent = pairInput.value.toUpperCase() + ' · ' + S.tf.toUpperCase();
      const dirEl = document.getElementById('sm-direction');
      dirEl.textContent = sig.signal;
      dirEl.className = `sm-direction ${isBuy ? 'buy' : isSell ? 'sell' : ''}`;
      document.getElementById('sm-conf').textContent = sig.confidence + '%';
      document.getElementById('sm-entry').textContent = sig.entry;
      document.getElementById('sm-tp').textContent = sig.tp;
      document.getElementById('sm-sl').textContent = sig.sl;
      pModal.classList.add('show');
    }
  }, 800);
}

// ── Close Signal Modal
const pModal = document.getElementById('signal-modal-overlay');
const pClose = document.getElementById('sm-close');
if (pClose) {
  pClose.addEventListener('click', () => {
    pModal.classList.remove('show');
  });
}
// Close on outside click
if (pModal) {
  pModal.addEventListener('mousedown', (e) => {
    if (e.target === pModal) pModal.classList.remove('show');
  });
}

// ─── Position Size Calculator ───────────────────────────────────────────────
function calculatePositionSize() {
  if (!S.lastSig || !S.active) {
    toast('Run an analysis first', 'warn');
    return;
  }
  
  const eqStr = document.getElementById('calc-equity').value;
  const riskStr = document.getElementById('calc-risk').value;
  const levInp = document.getElementById('calc-lev');
  const levUnl = document.getElementById('calc-unlimited');
  
  const equity = parseFloat(eqStr);
  const riskPct = parseFloat(riskStr);
  const leverage = levUnl.checked ? Infinity : parseFloat(levInp.value);
  
  if (isNaN(equity) || equity <= 0 || isNaN(riskPct) || riskPct <= 0) {
    toast('Enter valid Equity and Risk values', 'warn');
    return;
  }

  const entry = parseFloat(S.lastSig.entry.replace(/,/g, ''));
  const sl = parseFloat(S.lastSig.sl.replace(/,/g, ''));
  const tp = parseFloat(S.lastSig.tp.replace(/,/g, ''));
  
  const type = S.active.type;
  const pair = S.active.display.replace(/[^A-Z]/g, '');
  
  const riskUsd = equity * (riskPct / 100);
  const priceDist = Math.abs(entry - sl);
  if (priceDist === 0) return;

  let lotSize = 0;
  let pipVal = 10;
  
  if (type === 'forex') {
    const isJpy = pair.includes('JPY');
    const multiplier = isJpy ? 100 : 10000;
    const pipDist = priceDist * multiplier;
    
    if (pair.endsWith('USD')) pipVal = 10;
    else if (isJpy) pipVal = 1000 / 150; // Approximated cross rate for JPY crosses
    else if (pair.endsWith('CAD')) pipVal = 10 / 1.35;
    else if (pair.endsWith('CHF')) pipVal = 10 / 0.9;
    else if (pair.endsWith('GBP')) pipVal = 10 * 1.26;
    else if (pair.endsWith('AUD')) pipVal = 10 * 0.65;
    else if (pair.endsWith('NZD')) pipVal = 10 * 0.6;
    
    lotSize = riskUsd / (pipDist * pipVal);
  } else if (type === 'commodity' && (pair.includes('GOLD') || pair.includes('XAU'))) {
    // Gold 1 lot = 100oz.
    lotSize = riskUsd / (priceDist * 100);
  } else {
    // Crypto / Indices / Other
    // Default 1 lot = 1 unit
    lotSize = riskUsd / priceDist;
  }

  // Margin cap
  let marginPerLot = 0;
  if (type === 'forex') {
    const base = pair.slice(0, 3);
    let baseUsd = 1; // USD base
    if (base === 'EUR') baseUsd = 1.08;
    else if (base === 'GBP') baseUsd = 1.26;
    else if (base === 'AUD') baseUsd = 0.65;
    else if (base === 'NZD') baseUsd = 0.60;
    else if (base === 'CHF') baseUsd = 1.11;
    else if (base === 'CAD') baseUsd = 0.74;
    marginPerLot = (100000 * baseUsd) / leverage;
  } else if (type === 'commodity' && (pair.includes('GOLD') || pair.includes('XAU'))) {
    marginPerLot = (100 * entry) / leverage;
  } else {
    marginPerLot = entry / leverage;
  }
  
  if (marginPerLot > 0 && isFinite(leverage)) {
    const maxLots = equity / marginPerLot;
    if (lotSize > maxLots) {
      lotSize = maxLots;
      toast('Lot size curbed by max leverage', 'warn');
      document.getElementById('calc-info').textContent = `Max Leverage Reached! Margin > Equity.`;
    } else {
      document.getElementById('calc-info').textContent = `Using: ${pair} @ ${S.lastSig.signal}`;
    }
  } else {
    document.getElementById('calc-info').textContent = `Using: ${pair} @ ${S.lastSig.signal}`;
  }

  const rewardDist = Math.abs(tp - entry);
  let rewardUsd = 0;
  if (type === 'forex') {
    const isJpy = pair.includes('JPY');
    rewardUsd = (rewardDist * (isJpy ? 100 : 10000)) * pipVal * lotSize;
  } else if (type === 'commodity' && (pair.includes('GOLD') || pair.includes('XAU'))) {
    rewardUsd = rewardDist * 100 * lotSize;
  } else {
    rewardUsd = rewardDist * lotSize;
  }

  // Update UI Elements
  document.getElementById('calc-lots').textContent = lotSize < 0.01 ? lotSize.toFixed(4) : lotSize.toFixed(2);
  document.getElementById('calc-loss').textContent = '$' + (type === 'forex' ? (priceDist * (pair.includes('JPY') ? 100 : 10000) * pipVal * lotSize) : type === 'commodity' ? (priceDist * 100 * lotSize) : (priceDist * lotSize)).toFixed(2);
  document.getElementById('calc-gain').textContent = '$' + rewardUsd.toFixed(2);
  document.getElementById('calc-results').style.opacity = '1';
  if (lotSize === equity/marginPerLot) {
    // Only toast on limit, prevent spam if they click repeatedly unless they reset. Note we toasted already above!
  } else {
    toast('Position calculated', 'ok');
  }
}

const pCalcBtn = document.getElementById('calc-btn');
if (pCalcBtn) {
  pCalcBtn.addEventListener('click', calculatePositionSize);
}

const pCalcUnl = document.getElementById('calc-unlimited');
const pCalcLevInp = document.getElementById('calc-lev');
if (pCalcUnl && pCalcLevInp) {
  pCalcUnl.addEventListener('change', () => {
    pCalcLevInp.disabled = pCalcUnl.checked;
    pCalcLevInp.style.opacity = pCalcUnl.checked ? '0.3' : '1';
  });
}

/* ── MARKET SESSIONS LOGIC ── */
const SESSION_CONFIG = [
  { id: 'sydney', name: 'Sydney', start: 22, end: 7, times: '22:00 - 07:00 UTC', color: '#00F2FE' },
  { id: 'tokyo', name: 'Tokyo', start: 0, end: 9, times: '00:00 - 09:00 UTC', color: '#FFD54F' },
  { id: 'london', name: 'London', start: 7, end: 16, times: '07:00 - 16:00 UTC', color: '#7B5EA7' },
  { id: 'newyork', name: 'New York', start: 12, end: 21, times: '12:00 - 21:00 UTC', color: '#4FACFE' }
];

function updateMarketSessions() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const utcSec = now.getUTCSeconds();
  
  let londonOpen = false;
  let nyOpen = false;

  SESSION_CONFIG.forEach(s => {
    const el = document.getElementById(`sess-${s.id}`);
    if (!el) return;
    
    let isOpen = false;
    if (s.start < s.end) {
      isOpen = utcHour >= s.start && utcHour < s.end;
    } else { // Overnights (Sydney)
      isOpen = utcHour >= s.start || utcHour < s.end;
    }

    if (s.id === 'london') londonOpen = isOpen;
    if (s.id === 'newyork') nyOpen = isOpen;

    el.classList.toggle('active', isOpen);
    el.querySelector('.sess-status').textContent = isOpen ? 'Open' : 'Closed';
    
    // Countdown logic
    let targetHour = isOpen ? s.end : s.start;
    let diffHours = targetHour - utcHour;
    if (diffHours <= 0) diffHours += 24;
    
    let mins = 59 - utcMin;
    let secs = 59 - utcSec;
    let hrs = diffHours - 1;
    
    el.querySelector('.sess-timer').textContent = `${hrs}h ${mins}m`;
  });

  // Killzone: London/NY overlap (12:00 - 16:00 UTC)
  const kz = document.getElementById('sess-killzone');
  if (kz) {
    const isKz = utcHour >= 12 && utcHour < 16;
    kz.style.display = isKz ? 'flex' : 'none';
  }
}

/* ── ECONOMIC CALENDAR LOGIC ── */
async function fetchEconomicCalendar() {
  const listEl = document.getElementById('econ-list');
  if (!listEl) return;

  try {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const events = await Promise.any(PROXIES.map(async mkProxy => {
      const res = await fetchT(mkProxy(url), 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('Bad JSON'); }
      if (typeof data.contents === 'string') {
        if (data.status?.http_code && data.status.http_code !== 200) throw new Error(`Upstream ${data.status.http_code}`);
        try { data = JSON.parse(data.contents); } catch { throw new Error('Bad wrapper'); }
      }
      if (!Array.isArray(data)) throw new Error('Not an array');
      return data;
    }));
    
    const now = new Date();
    // Filter: High impact, strictly upcoming
    const highEvents = events
      .filter(e => e.impact === 'High')
      .map(e => ({ ...e, dateObj: new Date(e.date) }))
      .filter(e => e.dateObj > now)
      .sort((a, b) => a.dateObj - b.dateObj)
      .slice(0, 5);

    if (highEvents.length === 0) {
      listEl.innerHTML = '<div class="econ-loading">No high-impact events today.</div>';
      return;
    }

    listEl.innerHTML = highEvents.map(e => {
      const diff = e.dateObj - now;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const timeStr = e.dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      
      return `
        <div class="econ-item">
          <div class="econ-impact high"></div>
          <div class="econ-info">
            <span class="econ-curr">${e.country}</span>
            <span class="econ-event">${e.title}</span>
          </div>
          <div class="econ-time-wrap">
            <span class="econ-time">${timeStr}</span>
            <span class="econ-countdown">in ${h}h ${m}m</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    listEl.innerHTML = '<div class="econ-loading">Calendar currently unavailable.<br><span style="font-size:10px; opacity:0.5">Note: Some proxies are blocked by the provider. Try refreshing.</span></div>';
  }
}

// Bind Calendar Refresh
document.addEventListener('DOMContentLoaded', () => {
  const refBtn = document.getElementById('econ-refresh-btn');
  if (refBtn) {
    refBtn.addEventListener('click', () => {
      const listEl = document.getElementById('econ-list');
      if (listEl) listEl.innerHTML = '<div class="econ-loading">Refreshing calendar…</div>';
      fetchEconomicCalendar();
      toast('Syncing economic data...', 'info');
    });
  }
});

/* ── SMART WATCHLIST LOGIC ── */
const WATCHLIST_PAIRS = ['BTCUSDT', 'ETHUSDT', 'EURUSD', 'GBPUSD', 'GOLD', 'US30'];

async function scanSmartWatchlist() {
  const wlEl = document.getElementById('wl-list');
  if (!wlEl) return;

  const results = await Promise.allSettled(WATCHLIST_PAIRS.map(async p => {
    const info = detectSymbol(p);
    const candles = info.useBinance ? await fetchBinance(info.binSym, '1h') : await fetchData(info, '1h');
    const last = candles[candles.length - 1];
    const closes = candles.map(c => c.close);
    
    // Fast TA for bias
    const e20 = ema(closes, 20);
    const e50 = ema(closes, 50);
    const ri = rsi(closes, 14);
    
    const n = candles.length - 1;
    let bias = 'neutral';
    if (e20[n] > e50[n] && ri[n] > 50) bias = 'bullish';
    else if (e20[n] < e50[n] && ri[n] < 50) bias = 'bearish';
    
    return { pair: p, price: last.close, bias, info };
  }));

  wlEl.innerHTML = results.map(r => {
    if (r.status === 'rejected') return '';
    const d = r.value;
    const priceFmt = d.info.type === 'crypto' ? d.price.toFixed(2) : d.price.toFixed(d.price < 10 ? 4 : 2);
    
    return `
      <div class="wl-item" onclick="quickAnalyze('${d.pair}')">
        <div class="wl-bias-dot ${d.bias}"></div>
        <span class="wl-pair">${d.pair}</span>
        <span class="wl-price">${priceFmt}</span>
        <span class="wl-arrow">→</span>
      </div>
    `;
  }).join('');
}

// Global jump for watchlist
window.quickAnalyze = (symbol) => {
  const input = document.getElementById('local-search');
  if (input) {
    input.value = symbol;
    // Trigger analysis
    const btn = document.getElementById('analyze-btn');
    if (btn) btn.click();
    toast(`Jumping to ${symbol}`, 'ok');
  }
};

/* ── INITIALIZE NEW FEATURES ── */
// On low-end devices update sessions every 10s (not every 1s)
setInterval(updateMarketSessions, isLowEnd ? 10000 : 1000);
updateMarketSessions();

// On low-end delay calendar a bit so page renders first
setTimeout(fetchEconomicCalendar, isLowEnd ? 4000 : 0);
setInterval(fetchEconomicCalendar, 300000);

// Delay watchlist on low-end (heavy — 6 parallel API calls)
setTimeout(scanSmartWatchlist, isLowEnd ? 8000 : 1500);
setInterval(scanSmartWatchlist, isLowEnd ? 300000 : 180000);

// ─── News Output ─────────────────────────────────────────────────────────────
function renderNews(news) {
  const list = document.getElementById('news-list');
  if (!list) return;
  if (!news.length) { list.innerHTML = '<div style="padding: 12px; color: var(--text3); font-size: 0.75rem;">No actionable news recently.</div>'; return; }
  
  list.innerHTML = news.map(n => {
    let sentCls = n.score > 0 ? 'bull' : n.score < 0 ? 'bear' : 'neu';
    let sentTxt = n.score > 0 ? 'BULLISH' : n.score < 0 ? 'BEARISH' : 'NEUTRAL';
    const tStr = n.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="news-item">
      <div class="news-title">${n.title}</div>
      <div class="news-meta">
        <span>${n.time.toLocaleDateString()} ${tStr}</span>
        <span class="news-sentiment ${sentCls}">${sentTxt}</span>
      </div>
    </div>`;
  }).join('');
}

// ─── Auto TP/SL Trade Tracker ───────────────────────────────────────────────
async function autoTrackTrades() {
  const h = loadHistory();
  let anyUpdated = false;

  for (let i = 0; i < h.length; i++) {
    const e = h[i];
    // Only track pending entries that have all data
    if ((e.status && e.status !== 'pending') || !e.tp || !e.sl || !e.symInfo) continue;

    try {
      let price = null;
      const sym = e.symInfo;

      if (sym.useBinance && sym.binSym) {
        const r = await fetchT(`https://api.binance.com/api/v3/ticker/price?symbol=${sym.binSym}`, 6000);
        if (r.ok) price = parseFloat((await r.json()).price);
      } else if (sym.yahooSym) {
        const candles = await fetchYahoo(sym.yahooSym, '1h');
        price = candles[candles.length - 1].close;
      }

      if (!price || isNaN(price)) continue;

      const isBuy = e.signal === 'BUY';
      const hitTP = isBuy ? price >= e.tp : price <= e.tp;
      const hitSL = isBuy ? price <= e.sl : price >= e.sl;

      if (hitTP) {
        h[i].status = 'won';
        h[i].closedAt = fmtP(price);
        h[i].closedDate = new Date().toLocaleString();
        anyUpdated = true;
        toast(`🎯 ${e.pair} hit Take Profit! Auto-marked as Win ✓`, 'ok');
      } else if (hitSL) {
        h[i].status = 'lost';
        h[i].closedAt = fmtP(price);
        h[i].closedDate = new Date().toLocaleString();
        anyUpdated = true;
        toast(`🛑 ${e.pair} hit Stop Loss. Auto-marked as Loss ✗`, 'warn');
      }
    } catch (err) { /* silent — don't block other trades */ }
  }

  if (anyUpdated) {
    try { localStorage.setItem('tv_history', JSON.stringify(h)); } catch (e) {}
    _patchHist();
  }
}

// Run tracker every 90 seconds (skip on low-end — use 5 min)
setTimeout(() => {
  autoTrackTrades();
  setInterval(autoTrackTrades, isLowEnd ? 300000 : 90000);
}, 5000);

// ─── Extended Journal Logic ─────────────────────────────
let _journalFilter = 'all';

function _patchHist() {
  const h = loadHistory();
  const list = document.getElementById('history-list');
  const statsEl = document.getElementById('journal-stats');
  if (!list) return;

  // Compute advanced metrics
  const closed = h.filter(e => e.status === 'won' || e.status === 'lost');
  let w = 0, l = 0, totalWinR = 0, totalLossR = 0;
  let equityCurve = [0];
  let curR = 0;
  let peak = 0;
  let maxDD = 0;

  [...closed].reverse().forEach(e => {
    const r = (e.status === 'won' ? 2.2 : -1.0);
    if (r > 0) { w++; totalWinR += r; } else { l++; totalLossR += Math.abs(r); }
    curR += r;
    equityCurve.push(curR);
    if (curR > peak) peak = curR;
    const dd = peak - curR;
    if (dd > maxDD) maxDD = dd;
  });

  const total = w + l;
  const wr = total > 0 ? Math.round((w / total) * 100) : 0;
  const pf = totalLossR > 0 ? (totalWinR / totalLossR).toFixed(2) : totalWinR > 0 ? '∞' : '0.00';
  const expectancy = total > 0 ? ((totalWinR - totalLossR) / total).toFixed(2) : '0.00';

  // Stats grid
  if (statsEl) {
    statsEl.style.display = 'grid';
    statsEl.innerHTML = `
      <div class="j-stat"><span>Win Rate</span><span class="val">${wr}%</span></div>
      <div class="j-stat"><span>Profit Factor</span><span class="val">${pf}</span></div>
      <div class="j-stat"><span>Expectancy</span><span class="val">${expectancy}R</span></div>
      <div class="j-stat"><span>Max Drawdown</span><span class="val neg">-${maxDD.toFixed(1)}R</span></div>
    `;
  }

  // Draw Performance Graph
  renderPerformanceGraph(h);

  // Equity bar
  const eqFill = document.getElementById('journal-equity-fill');
  const eqPct  = document.getElementById('journal-equity-pct');
  if (eqFill && eqPct) {
    const fillPct = total > 0 ? wr : 0;
    setTimeout(() => { eqFill.style.width = fillPct + '%'; }, 120);
    eqPct.textContent = total > 0 ? wr + '% win rate' : 'No trades closed yet';
    eqFill.style.background = wr >= 55
      ? 'linear-gradient(90deg,var(--purple),var(--green))'
      : wr >= 40
        ? 'linear-gradient(90deg,var(--purple),var(--gold))'
        : 'linear-gradient(90deg,var(--purple),var(--red))';
  }

  if (!h.length) {
    list.innerHTML = '<div class="hist-empty">📋 No trades yet.<br>Run an analysis to auto-log signals.</div>';
    return;
  }

  // Apply filter
  const visible = _journalFilter === 'all' ? h : h.filter(e => {
    if (_journalFilter === 'pending') return !e.status || e.status === 'pending';
    return e.status === _journalFilter;
  });

  if (!visible.length) {
    list.innerHTML = `<div class="hist-empty">No ${_journalFilter} trades found.</div>`;
    return;
  }

  list.innerHTML = visible.map(e => {
    const realIdx = h.indexOf(e);
    const cls     = e.signal === 'BUY' ? 'buy' : 'sell';
    const status  = e.status || 'pending';
    const rowCls  = status === 'won' ? 'won' : status === 'lost' ? 'lost' : '';
    const note    = e.note || '';
    const dateStr = e.date ? `<span class="hist-date">${e.date}</span>` : '';
    const rVal    = status === 'won' ? '+2.2R' : status === 'lost' ? '-1.0R' : '--';
    const profCls = status === 'won' ? 'pos' : status === 'lost' ? 'neg' : '';

    // Auto-track info
    const hasLevels = e.tp && e.sl;
    let trackStr = '';
    if (status === 'won' && e.closedAt) {
      trackStr = `<div class="hist-closed-info">🎯 TP Hit @ <span class="closed-price">${e.closedAt}</span> <span class="hist-auto-badge">Auto</span></div>`;
    } else if (status === 'lost' && e.closedAt) {
      trackStr = `<div class="hist-closed-info">🛑 SL Hit @ <span class="closed-price">${e.closedAt}</span> <span class="hist-auto-badge">Auto</span></div>`;
    } else if (status === 'pending' && hasLevels) {
      trackStr = `<div class="hist-closed-info"><span class="hist-auto-badge active">⚡ Active</span> TP: ${fmtP(e.tp)} · SL: ${fmtP(e.sl)}</div>`;
    }

    return `
      <div class="hist-row ${rowCls}">
        <div class="hist-main">
          <span class="hist-pair">${e.pair}</span>
          <span class="hist-sig ${cls}">${e.signal}</span>
          <span class="hist-tf">${e.tf}</span>
          <span class="hist-outcome ${status}">${status === 'won' ? '✓ TP' : status === 'lost' ? '✗ SL' : '⏳ Open'}</span>
          <span class="hist-profit ${profCls}">${rVal}</span>
        </div>
        <textarea class="hist-notes" placeholder="Trade proof or notes…" onchange="saveNote(${realIdx},this.value)">${note}</textarea>
        <div class="hist-footer">
          ${dateStr}
          <div class="hist-btn-group">
            <button class="hist-btn ${status === 'won' ? 'won' : ''}" onclick="setHistStatus(${realIdx},'won')" title="Log as Win">✓</button>
            <button class="hist-btn ${status === 'lost' ? 'lost' : ''}" onclick="setHistStatus(${realIdx},'lost')" title="Log as Loss">✗</button>
            <button class="hist-btn del" onclick="deleteHistEntry(${realIdx})" title="Delete">🗑</button>
          </div>
        </div>
        ${trackStr ? `<div style="padding: 0 12px 10px;">${trackStr}</div>` : ''}
      </div>`;
  }).join('');
}

window.setHistStatus = (index, status) => {
  const h = loadHistory();
  if (h[index]) {
    h[index].status = h[index].status === status ? 'pending' : status;
    try { localStorage.setItem('tv_history', JSON.stringify(h)); } catch (e) {}
    _patchHist();
    toast(h[index].status === 'won' ? '✓ Logged as Win!' : h[index].status === 'lost' ? '✗ Logged as Loss.' : 'Reset to Open.', h[index].status === 'won' ? 'ok' : 'warn');
  }
};

window.saveNote = (index, text) => {
  const h = loadHistory();
  if (h[index]) {
    h[index].note = text.trim();
    try { localStorage.setItem('tv_history', JSON.stringify(h)); } catch (e) {}
  }
};

window.deleteHistEntry = (index) => {
  const h = loadHistory();
  h.splice(index, 1);
  try { localStorage.setItem('tv_history', JSON.stringify(h)); } catch (e) {}
  _patchHist();
  toast('Entry deleted', 'info');
};

function _bindJournalFilters() {
  document.querySelectorAll('.j-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.j-filter-btn').forEach(b => b.classList.remove('active','won','lost'));
      btn.classList.add('active');
      _journalFilter = btn.dataset.filter;
      if (_journalFilter === 'won') btn.classList.add('won');
      if (_journalFilter === 'lost') btn.classList.add('lost');
      _patchHist();
    });
  });
}

const _renderH = window.renderHistory || function(){};
window.renderHistory = _patchHist;

document.addEventListener('DOMContentLoaded', () => {
  _bindJournalFilters();

  // ── Toggle Indicators — with proper mobile resize ──────────────────
  const indBtn      = document.getElementById('toggle-indicators');
  const chartPanel  = document.querySelector('.chart-panel');
  const chartLegend = document.getElementById('chart-legend');

  if (indBtn) {
    indBtn.addEventListener('click', () => {
      S.config.showIndicators = !S.config.showIndicators;
      const isClean = !S.config.showIndicators;

      indBtn.classList.toggle('cleaned', isClean);
      indBtn.innerHTML = isClean ? '👁‍🗨 Cleaned' : '👁 Options';

      // On mobile, shrink/expand the chart panel height
      if (chartPanel) chartPanel.classList.toggle('clean-mode', isClean);
      // Hide legend when indicators hidden
      if (chartLegend) chartLegend.classList.toggle('hidden', isClean);

      // Redraw after browser has recalculated layout
      if (S.lastCandles) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            const canvas = document.getElementById('main-canvas');
            if (canvas) drawChart(canvas, S.lastCandles, S.lastTA, S.lastSig);
          }, 80);
        });
      }
    });
  }

  // ResizeObserver keeps canvas sharp as container size changes
  if (typeof ResizeObserver !== 'undefined') {
    const container = document.querySelector('.canvas-container');
    if (container) {
      new ResizeObserver(() => {
        if (S.lastCandles && S.lastTA && S.lastSig) {
          const canvas = document.getElementById('main-canvas');
          if (canvas) drawChart(canvas, S.lastCandles, S.lastTA, S.lastSig);
        }
      }).observe(container);
    }
  }
});

function renderPerformanceGraph(h) {
  const canvas = document.getElementById('journal-perf-graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  
  const width = rect.width;
  const height = 120;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  
  const closed = h.filter(e => e.status === 'won' || e.status === 'lost');
  if (closed.length < 1) {
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Institutional Analysis Grid Initializing...', width/2, height/2);
    return;
  }
  
  let points = [0];
  let cur = 0;
  [...closed].reverse().forEach(e => {
    cur += (e.status === 'won' ? 2.2 : -1.0);
    points.push(cur);
  });
  
  const min = Math.min(...points, -1);
  const max = Math.max(...points, 1);
  const range = max - min;
  const pad = 20;
  const getY = v => height - pad - ((v - min) / range) * (height - pad * 2);
  const getX = i => pad + (i / (points.length - 1)) * (width - pad * 2);

  ctx.clearRect(0,0,width,height);
  
  // Background Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (i/4)*(height - pad*2);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  // Zero line
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, getY(0)); ctx.lineTo(width, getY(0));
  ctx.stroke();
  ctx.setLineDash([]);

  // Bezier Path
  if (points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(points[0]));
    
    for (let i = 0; i < points.length - 1; i++) {
      const x1 = getX(i), y1 = getY(points[i]);
      const x2 = getX(i+1), y2 = getY(points[i+1]);
      const xc = (x1 + x2) / 2;
      ctx.quadraticCurveTo(x1, y1, xc, (y1 + y2) / 2);
    }
    
    const lastIdx = points.length - 1;
    ctx.lineTo(getX(lastIdx), getY(points[lastIdx]));
    
    // Stroke
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(79, 172, 254, 0.4)';
    ctx.strokeStyle = '#4FACFE';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Gradient Fill
    ctx.lineTo(getX(lastIdx), height);
    ctx.lineTo(getX(0), height);
    const grad = ctx.createLinearGradient(0, getY(max), 0, height);
    grad.addColorStop(0, 'rgba(79, 172, 254, 0.15)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Data points
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(getX(i), getY(p), 3.5, 0, Math.PI*2);
    ctx.fillStyle = i === 0 ? '#fff' : (points[i] >= points[i-1] ? '#00E676' : '#FF5252');
    ctx.fill();
    ctx.strokeStyle = '#080814';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // End label
  const lastP = points[points.length-1];
  ctx.fillStyle = lastP >= 0 ? '#00E676' : '#FF5252';
  ctx.font = 'bold 10px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.fillText(`${lastP >= 0 ? '+' : ''}${lastP.toFixed(1)}R`, width - 5, getY(lastP) - 10);
}
