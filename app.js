'use strict';

/* ── Auth Guard ──────────────────────────────────────────────────────────────
   Redirects to login.html if the user has not authenticated with a valid key.
   ─────────────────────────────────────────────────────────────────────────── */
(function() {
  if (sessionStorage.getItem('tv_auth') !== 'granted') {
    window.location.replace('login.html');
  }
})();

/* ═══════════════════════════════════════════════
   TRADEVISION AI  —  TradingView Data Engine
   • Primary source: TradingView UDF (all pairs)
   • Fallback: Binance (crypto direct)
   • Symbol search: TradingView Symbol Search API
   • TA: EMA, RSI, MACD, BB, ATR, ADX, VWAP, Donchian
   • Zero API keys required
   ═══════════════════════════════════════════════ */

const CRYPTO_BASES = ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','AVAX','MATIC',
  'LINK','DOT','UNI','ATOM','LTC','BCH','NEAR','TRX','ETC','SHIB','PEPE','ARB',
  'OP','INJ','SUI','TIA','WLD','FTM','SAND','MANA','APT','CAKE','XLM','ALGO',
  'VET','HBAR','FIL','AAVE','SNX','APE','CRO','XMR','NOT','WIF','BONK','GMT',
  'EGLD','EOS','COMP','MKR','1INCH','FLOKI','JASMY','ACE','FET','GRT'];

const TV_SEARCH = 'https://symbol-search.tradingview.com/symbol_search/';
const TF_RES  = { '15m':'15', '1h':'60', '4h':'240', '1d':'D' };
const TF_SECS = { '15m':200*900, '1h':200*3600, '4h':200*14400, '1d':200*86400 };

const FOREX_CCY = ['USD','EUR','GBP','JPY','CHF','AUD','CAD','NZD','SGD','HKD',
  'NOK','SEK','DKK','TRY','ZAR','MXN','BRL','INR','THB','CNY','CNH','PLN'];

const SYM_ALIASES = {
  'GOLD':'GC=F','XAUUSD':'GC=F','SILVER':'SI=F','XAGUSD':'SI=F',
  'OIL':'CL=F','BRENT':'BZ=F','NATGAS':'NG=F',
  'SP500':'^GSPC','SPX':'^GSPC','US500':'^GSPC',
  'NASDAQ':'^IXIC','NAS100':'^IXIC','NDX':'^IXIC',
  'DOW':'^DJI','US30':'^DJI','DAX':'^GDAXI','DAX40':'^GDAXI',
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Deploy cloudflare-worker.js to https://workers.cloudflare.com (free)
// STEP 2: Paste your worker URL below (e.g. https://my-proxy.me.workers.dev)
// STEP 3: Push to GitHub — all pairs will work instantly on any host
// ─────────────────────────────────────────────────────────────────────────────
const YOUR_WORKER_URL = 'tradevisionai.lewis-hfm.workers.dev'; // ← See instructions below — needs a SEPARATE proxy worker

// CORS proxies — raced IN PARALLEL; fastest wins
// Worker goes first (most reliable), public proxies are automatic fallbacks
const PROXIES = [
  // Primary: your own Cloudflare Worker (deploy cloudflare-worker.js — free, 100k/day)
  ...(YOUR_WORKER_URL ? [u => `${YOUR_WORKER_URL}?url=${encodeURIComponent(u)}`] : []),
  // Public fallbacks (rate-limited but usually work):
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
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
};

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
      low: q.low[i],  close: q.close[i], volume: q.volume?.[i] || 0,
    })).filter(c => c.open && c.high && c.low && c.close);
    if (candles.length < 10) throw new Error('Too few candles');
    if (tf === '4h') candles = groupCandles(candles, 4);
    if (tf === '3m') candles = groupCandles(candles, 3);
    return candles;
  }));
}

async function fetchYahoo(symbol, tf) {
  const iMap = { '1m':'1m','3m':'1m','5m':'5m','15m':'15m','1h':'1h','4h':'1h','1d':'1d' };
  const rMap = { '1m':'3d','3m':'5d','5m':'7d','15m':'14d','1h':'60d','4h':'60d','1d':'2y' };
  const qs = `?range=${rMap[tf]||'60d'}&interval=${iMap[tf]||'1h'}&includePrePost=false&_t=${Date.now()}`;
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
        return { time: Date.UTC(y,m-1,d), open:+open, high:+high, low:+low, close:+close, volume:+volume||0 };
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
  const isEurBase  = base  === 'EUR';
  const isEurQuote = quote === 'EUR';
  // Single API call — fetch both legs at once when cross-rate needed
  const toParam = isEurBase ? quote : isEurQuote ? base : `${base},${quote}`;
  const url = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=EUR&to=${toParam}`;
  const res = await fetchT(url, 10000);
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
  const json = await res.json();
  if (!json.rates) throw new Error('No Frankfurter rates');
  const entries = Object.entries(json.rates).sort(([a],[b]) => a < b ? -1 : 1);
  if (entries.length < 5) throw new Error('Insufficient history');
  const candles = [];
  for (let i = 0; i < entries.length; i++) {
    const [date, r] = entries[i];
    const [y, m, d] = date.split('-').map(Number);
    let close;
    if (isEurBase)       close = r[quote];           // EUR/QUOTE
    else if (isEurQuote) close = r[base] ? 1/r[base] : null; // BASE/EUR
    else                 close = (r[base] && r[quote]) ? r[quote]/r[base] : null; // cross
    if (!close) continue;
    const prev = i > 0 ? (candles[candles.length-1]?.close || close) : close;
    const spd  = Math.abs(close - prev) * 0.25 || close * 0.00015;
    candles.push({
      time: Date.UTC(y,m-1,d), open: prev,
      high: Math.max(prev,close)+spd, low: Math.min(prev,close)-spd,
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
    catch(e) { errs.push(`Frankfurter: ${e.message}`); }
  }

  // ── Yahoo Finance: all proxies raced in parallel ────────────────────────────
  try { return await fetchYahoo(info.yahooSym, tf); }
  catch(e) { errs.push(`Yahoo: ${e.message}`); }

  // ── Non-forex fallback: stooq CSV ──────────────────────────────────────────
  if (info.type !== 'forex') {
    try {
      const stooqSym = info.yahooSym
        .replace(/\^/g, '').replace(/=F$/i, '.f').replace(/=X$/i, '');
      if (stooqSym) return await fetchStooq(stooqSym, tf);
    } catch(e) { errs.push(`Stooq: ${e.message}`); }
  }

  throw new Error(`No data available for ${info.display}. Try a different pair or timeframe.`);
}

function groupCandles(h, sz) {
  const out = [];
  for (let i = 0; i+sz-1 < h.length; i += sz) {
    const g = h.slice(i, i+sz);
    out.push({ time:g[0].time, open:g[0].open, high:Math.max(...g.map(c=>c.high)),
      low:Math.min(...g.map(c=>c.low)), close:g[g.length-1].close,
      volume:g.reduce((s,c)=>s+c.volume,0) });
  }
  return out;
}

// ─── Data: Binance (direct, no CORS) ─────────────────────────────────────────
async function fetchBinance(symbol, tf) {
  const interval = tf === '1d' ? '1d' : tf;
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`;
  const res = await fetchT(url, 10000);
  if (!res.ok) {
    const e = await res.json().catch(()=>({}));
    throw new Error(e.msg || `Binance error ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)||data.length===0) throw new Error(`No Binance data for ${symbol}`);
  return data.map(k => ({ time:+k[0], open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5] }));
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
      return { binSym:`${base}USDT`, useBinance:true, display:`${base}/USDT`, type:'crypto' };
    if (s === `${base}USDT`)
      return { binSym:s, useBinance:true, display:`${base}/USDT`, type:'crypto' };
  }

  // Alias (Gold, Oil, indices…)
  if (SYM_ALIASES[s])
    return { yahooSym:SYM_ALIASES[s], useYahoo:true, display:s, type:'commodity' };

  // Forex: 6-letter pair of known currency codes
  if (s.length === 6) {
    const a = s.slice(0,3), b = s.slice(3);
    if (FOREX_CCY.includes(a) && FOREX_CCY.includes(b))
      return { yahooSym:`${s}=X`, useYahoo:true, display:`${a}/${b}`, type:'forex' };
  }

  // Default: treat as stock/index on Yahoo Finance
  return { yahooSym: s, useYahoo:true, display:s, type:'stock' };
}

// ─── Technical Analysis ────────────────────────────────────────────────────────
function ema(vals, p) {
  const k = 2/(p+1); let e = null, cnt = 0, sum = 0, r = [];
  for (const v of vals) {
    if (v==null||isNaN(v)){r.push(null);continue}
    if(e===null){sum+=v;cnt++;if(cnt===p){e=sum/p;r.push(e)}else r.push(null)}
    else{e=v*k+e*(1-k);r.push(e)}
  }
  return r;
}
function sma(vals, p) {
  return vals.map((_,i)=>{
    if(i<p-1)return null;
    const s=vals.slice(i-p+1,i+1);
    return s.some(v=>v==null)?null:s.reduce((a,b)=>a+b,0)/p;
  });
}
function rsi(closes, p=14) {
  let ag=0,al=0,r=[null];
  for(let i=1;i<closes.length;i++){
    const d=closes[i]-closes[i-1];
    if(i<=p){ag+=Math.max(d,0);al+=Math.max(-d,0);if(i<p){r.push(null);continue}ag/=p;al/=p}
    else{ag=(ag*(p-1)+Math.max(d,0))/p;al=(al*(p-1)+Math.max(-d,0))/p}
    r.push(al===0?100:100-100/(1+ag/al));
  }
  return r;
}
function macd(closes,fast=12,slow=26,sig=9){
  const ef=ema(closes,fast),es=ema(closes,slow);
  const ml=ef.map((v,i)=>v!=null&&es[i]!=null?v-es[i]:null);
  const vm=ml.filter(v=>v!=null),rs=ema(vm,sig);
  let si=0;const sl=ml.map(v=>v!=null?rs[si++]??null:null);
  return{macd:ml,signal:sl,histogram:ml.map((v,i)=>v!=null&&sl[i]!=null?v-sl[i]:null)};
}
function bb(closes,p=20,m=2){
  const mid=sma(closes,p),u=[],l=[];
  for(let i=0;i<closes.length;i++){
    if(mid[i]==null){u.push(null);l.push(null);continue}
    const sl=closes.slice(i-p+1,i+1);
    const sd=Math.sqrt(sl.reduce((s,v)=>s+(v-mid[i])**2,0)/p);
    u.push(mid[i]+m*sd);l.push(mid[i]-m*sd);
  }
  return{middle:mid,upper:u,lower:l};
}
function atr(candles,p=14){
  const tr=candles.map((c,i)=>i===0?c.high-c.low:Math.max(c.high-c.low,Math.abs(c.high-candles[i-1].close),Math.abs(c.low-candles[i-1].close)));
  return sma(tr,p);
}

// ADX — Average Directional Index (Wilder smoothing)
function adx(candles, p=14){
  const dmP=[],dmN=[],tr=[];
  for(let i=1;i<candles.length;i++){
    const up=candles[i].high-candles[i-1].high;
    const dn=candles[i-1].low-candles[i].low;
    dmP.push(up>dn&&up>0?up:0);
    dmN.push(dn>up&&dn>0?dn:0);
    tr.push(Math.max(candles[i].high-candles[i].low,Math.abs(candles[i].high-candles[i-1].close),Math.abs(candles[i].low-candles[i-1].close)));
  }
  // Wilder smooth
  const ws=(arr,p)=>{
    let s=arr.slice(0,p).reduce((a,b)=>a+b,0);
    const r=[s];
    for(let i=p;i<arr.length;i++){s=s-s/p+arr[i];r.push(s);}
    return r;
  };
  const wTR=ws(tr,p),wDP=ws(dmP,p),wDN=ws(dmN,p);
  const diP=wTR.map((t,i)=>t?100*wDP[i]/t:0);
  const diN=wTR.map((t,i)=>t?100*wDN[i]/t:0);
  const dx=diP.map((p,i)=>{
    const s=p+diN[i];return s?100*Math.abs(p-diN[i])/s:0;
  });
  const adxArr=ws(dx,p);
  // Pad front with nulls to align with original candle array
  const pad=candles.length-adxArr.length;
  return {
    adx: Array(pad).fill(null).concat(adxArr.map(v=>v/p)),
    diP: Array(pad).fill(null).concat(diP),
    diN: Array(pad).fill(null).concat(diN),
  };
}

// VWAP — reset per-dataset (session VWAP approximation)
function vwap(candles){
  let cumPV=0,cumV=0;
  return candles.map(c=>{
    const tp=(c.high+c.low+c.close)/3;
    cumPV+=tp*(c.volume||0);
    cumV+=(c.volume||0);
    return cumV?cumPV/cumV:tp;
  });
}

// Donchian Channel
function donchian(candles, p=20){
  const upper=[],lower=[];
  for(let i=0;i<candles.length;i++){
    if(i<p-1){upper.push(null);lower.push(null);continue;}
    const sl=candles.slice(i-p+1,i+1);
    upper.push(Math.max(...sl.map(c=>c.high)));
    lower.push(Math.min(...sl.map(c=>c.low)));
  }
  const middle=upper.map((u,i)=>u!=null&&lower[i]!=null?(u+lower[i])/2:null);
  return{upper,lower,middle};
}

// ─── Swing Points ─────────────────────────────────────────────────────────────
function swingPoints(candles, lb=5){
  const highs=[],lows=[];
  for(let i=lb;i<candles.length-lb;i++){
    const sl=candles.slice(i-lb,i+lb+1);
    if(candles[i].high===Math.max(...sl.map(c=>c.high))) highs.push({i,price:candles[i].high});
    if(candles[i].low===Math.min(...sl.map(c=>c.low))) lows.push({i,price:candles[i].low});
  }
  return{highs,lows};
}

// ─── Market Structure ─────────────────────────────────────────────────────────
function detectMarketStructure(candles,swings){
  const{highs,lows}=swings;
  if(highs.length<2||lows.length<2) return{trend:'ranging',events:[],labels:[]};
  const rH=highs.slice(-3),rL=lows.slice(-3);
  let hh=0,lh=0,hl=0,ll=0;
  for(let i=1;i<rH.length;i++) rH[i].price>rH[i-1].price?hh++:lh++;
  for(let i=1;i<rL.length;i++) rL[i].price>rL[i-1].price?hl++:ll++;
  let trend='ranging';
  if(hh>=1&&hl>=1) trend='uptrend';
  else if(lh>=1&&ll>=1) trend='downtrend';
  const events=[],labels=[];
  // Label last 3 swings
  rH.forEach((h,i)=>{ const tag=i===0?(rH[1]&&rH[1].price>h.price?'LL':'HH'):(rH[i-1]&&h.price>rH[i-1].price?'HH':'LH'); labels.push({i:h.i,price:h.price,tag,side:'high'}); });
  rL.forEach((l,i)=>{ const tag=i===0?(rL[1]&&rL[1].price<l.price?'HH':'LL'):(rL[i-1]&&l.price<rL[i-1].price?'LL':'HL'); labels.push({i:l.i,price:l.price,tag,side:'low'}); });
  const n=candles.length-1,close=candles[n].close;
  if(highs.length>=1&&close>highs[highs.length-1].price&&trend!=='uptrend') events.push({type:'BOS',dir:'bull'});
  if(lows.length>=1&&close<lows[lows.length-1].price&&trend!=='downtrend') events.push({type:'BOS',dir:'bear'});
  if(trend==='uptrend'&&lows.length>=2&&close<rL[rL.length-1].price) events.push({type:'ChoCH',dir:'bear'});
  if(trend==='downtrend'&&highs.length>=2&&close>rH[rH.length-1].price) events.push({type:'ChoCH',dir:'bull'});
  return{trend,events,labels};
}

// ─── S/R Zones ────────────────────────────────────────────────────────────────
function detectSRZones(candles,swings){
  const close=candles[candles.length-1].close;
  const tol=0.006;
  const pts=[...swings.highs.map(h=>h.price),...swings.lows.map(l=>l.price)];
  const zones=[];
  for(const p of pts){
    const ex=zones.find(z=>Math.abs(z.mid-p)/p<tol);
    if(ex){ex.count++;ex.top=Math.max(ex.top,p*(1+tol/2));ex.bottom=Math.min(ex.bottom,p*(1-tol/2));ex.mid=(ex.top+ex.bottom)/2;}
    else zones.push({mid:p,top:p*(1+tol/2),bottom:p*(1-tol/2),count:1,type:p>close?'resistance':'support'});
  }
  return zones.sort((a,b)=>b.count-a.count).slice(0,6);
}

// ─── Candlestick Patterns ─────────────────────────────────────────────────────
function detectPatterns(candles){
  const out=[],n=candles.length,lb=Math.min(40,n);
  for(let i=n-lb;i<n;i++){
    const c=candles[i],p=i>0?candles[i-1]:null,p2=i>1?candles[i-2]:null;
    const body=Math.abs(c.close-c.open),range=c.high-c.low||0.0001;
    const uWick=c.high-Math.max(c.open,c.close),lWick=Math.min(c.open,c.close)-c.low;
    if(body/range<0.1){out.push({name:'Doji',i,type:'neutral'});continue;}
    if(lWick>body*2&&uWick<body*0.5) out.push({name:c.close>c.open?'Hammer':'Hang.Man',i,type:c.close>c.open?'bull':'bear'});
    if(uWick>body*2&&lWick<body*0.5) out.push({name:'Shoot.Star',i,type:'bear'});
    if(p){
      const pb=Math.abs(p.close-p.open);
      if(c.close>c.open&&p.close<p.open&&body>pb&&c.open<p.close&&c.close>p.open) out.push({name:'Bull Engulf',i,type:'bull'});
      if(c.close<c.open&&p.close>p.open&&body>pb&&c.open>p.close&&c.close<p.open) out.push({name:'Bear Engulf',i,type:'bear'});
    }
    if(p&&p2){
      const pb2=Math.abs(p2.close-p2.open),pb=Math.abs(p.close-p.open);
      if(pb2>0&&pb/pb2<0.3&&p2.close<p2.open&&c.close>c.open&&c.close>(p2.open+p2.close)/2) out.push({name:'Morning Star',i,type:'bull'});
      if(pb2>0&&pb/pb2<0.3&&p2.close>p2.open&&c.close<c.open&&c.close<(p2.open+p2.close)/2) out.push({name:'Evening Star',i,type:'bear'});
    }
    if((lWick>range*0.6||uWick>range*0.6)&&body<range*0.25&&!out.find(x=>x.i===i)) out.push({name:'Pin Bar',i,type:lWick>uWick?'bull':'bear'});
  }
  return out;
}

// ─── RSI Divergence ───────────────────────────────────────────────────────────
function detectDivergence(candles,rsiArr,swings){
  const res={bullish:[],bearish:[]};
  const{highs,lows}=swings;
  if(lows.length>=2){
    const a=lows[lows.length-2],b=lows[lows.length-1];
    if(b.price<a.price&&rsiArr[b.i]!=null&&rsiArr[a.i]!=null&&rsiArr[b.i]>rsiArr[a.i]&&rsiArr[b.i]<45)
      res.bullish.push({startI:a.i,endI:b.i,startP:a.price,endP:b.price,startRSI:rsiArr[a.i],endRSI:rsiArr[b.i]});
  }
  if(highs.length>=2){
    const a=highs[highs.length-2],b=highs[highs.length-1];
    if(b.price>a.price&&rsiArr[b.i]!=null&&rsiArr[a.i]!=null&&rsiArr[b.i]<rsiArr[a.i]&&rsiArr[b.i]>55)
      res.bearish.push({startI:a.i,endI:b.i,startP:a.price,endP:b.price,startRSI:rsiArr[a.i],endRSI:rsiArr[b.i]});
  }
  return res;
}

// ─── Fibonacci ────────────────────────────────────────────────────────────────
function fibonacci(candles){
  const lb=Math.min(100,candles.length),sl=candles.slice(-lb);
  const high=Math.max(...sl.map(c=>c.high)),low=Math.min(...sl.map(c=>c.low));
  const rng=high-low;
  return{high,low,levels:[
    {r:0,price:low,label:'0%'},{r:0.236,price:low+rng*0.236,label:'23.6%'},
    {r:0.382,price:low+rng*0.382,label:'38.2%'},{r:0.5,price:low+rng*0.5,label:'50%'},
    {r:0.618,price:low+rng*0.618,label:'61.8%'},{r:0.786,price:low+rng*0.786,label:'78.6%'},
    {r:1,price:high,label:'100%'},
  ]};
}

// ─── AI Narrative ─────────────────────────────────────────────────────────────
function generateNarrative(sig,ta,info){
  const n=ta.ri.length-1;
  const rv=ta.ri[n]?.toFixed(1)||'–';
  const adxV=ta.adxData?.adx[n]?.toFixed(1)||'–';
  const vw=ta.vwapLine?.[n],close=candles=>candles[candles.length-1].close;
  const trend=ta.ms?.trend||'ranging';
  const tStr=trend==='uptrend'?'bullish uptrend':trend==='downtrend'?'bearish downtrend':'ranging market';
  const adxStr=parseFloat(adxV)>25?`strong momentum (ADX <em>${adxV}</em>)`:`low-momentum conditions (ADX <em>${adxV}</em>)`;
  const vwapStr=vw?(sig.entry&&parseFloat(sig.entry.replace(/,/g,''))>vw?' — price <em>above VWAP</em> (bullish bias)':' — price <em>below VWAP</em> (bearish bias)'):''; 
  const rsiStr=rv<30?`RSI is <em>oversold at ${rv}</em>`:rv>70?`RSI is <em>overbought at ${rv}</em>`:`RSI reads <em>${rv}</em>`;
  const pats=ta.patterns||[];const lastPat=pats.filter(p=>p.type!=='neutral').slice(-1)[0];
  const patStr=lastPat?` A <em>${lastPat.name}</em> pattern was detected.`:'';
  const divB=ta.divergence?.bullish?.length>0,divBr=ta.divergence?.bearish?.length>0;
  const divStr=divB?' <em>Bullish RSI divergence</em> adds long confluence.':divBr?' <em>Bearish RSI divergence</em> warns of reversal.':'';
  const tradeStr=sig.signal==='BUY'?`Look for longs near <em>${sig.entry}</em>, target <em>${sig.tp}</em>, stop <em>${sig.sl}</em>.`:`Look for shorts near <em>${sig.entry}</em>, target <em>${sig.tp}</em>, stop <em>${sig.sl}</em>.`;
  return `<em>${info.display}</em> is in a <em>${tStr}</em> with ${adxStr}${vwapStr}. ${rsiStr}.${patStr}${divStr} ${tradeStr}`;
}

// ─── Multi-Timeframe ──────────────────────────────────────────────────────────
async function runMultiTF(info){
  const tfs=['15m','1h','4h','1d'];
  const results=await Promise.allSettled(tfs.map(async tf=>{
    const candles=info.useBinance?await fetchBinance(info.binSym,tf):await fetchData(info,tf);
    const closes=candles.map(c=>c.close);
    const ta={e20:ema(closes,20),e50:ema(closes,50),e200:ema(closes,200),ri:rsi(closes,14),
      mc:macd(closes),bbs:bb(closes,20),at:atr(candles,14),adxData:adx(candles,14),
      vwapLine:vwap(candles),dc:donchian(candles,20)};
    const swings=swingPoints(candles);ta.ms=detectMarketStructure(candles,swings);
    return{tf,sig:generateSignal(candles,ta,info)};
  }));
  return results.map((r,i)=>r.status==='fulfilled'?{tf:tfs[i],...r.value.sig}:{tf:tfs[i],signal:'ERR',confidence:0});
}
function renderMTF(results){
  const el=document.getElementById('mtf-grid');
  if(!el) return;
  el.innerHTML=results.map(r=>{
    const cls=r.signal==='BUY'?'buy':r.signal==='SELL'?'sell':r.signal==='ERR'?'loading':'neutral';
    const lbl=r.signal==='ERR'?'N/A':r.signal;
    const conf=r.confidence||0;
    return `<div class="mtf-cell ${cls}"><span class="mtf-tf">${r.tf.toUpperCase()}</span><span class="mtf-sig">${lbl}</span><span class="mtf-conf">${conf}%</span><div class="mtf-bar-wrap"><div class="mtf-bar" style="width:${conf}%"></div></div></div>`;
  }).join('');
  const buys=results.filter(r=>r.signal==='BUY').length;
  const sells=results.filter(r=>r.signal==='SELL').length;
  const score=Math.max(buys,sells)/results.length;
  const color=buys>sells?'#00E676':sells>buys?'#FF5252':'#FFD54F';
  const fill=document.getElementById('conf-bar-multi-fill');
  if(fill){fill.style.width=(score*100)+'%';fill.style.background=color;}
  const txt=document.getElementById('conf-score-text');
  if(txt) txt.textContent=buys>sells?`${buys}/4 Bullish`:sells>buys?`${sells}/4 Bearish`:'Mixed';
}

// ─── Signal History ───────────────────────────────────────────────────────────
function saveHistory(entry){
  let h=loadHistory();
  h.unshift(entry);
  if(h.length>50) h=h.slice(0,50);
  try{localStorage.setItem('tv_history',JSON.stringify(h));}catch(e){}
}
function loadHistory(){
  try{return JSON.parse(localStorage.getItem('tv_history')||'[]');}catch{return [];}
}
function renderHistory(){
  const list=document.getElementById('history-list');
  if(!list) return;
  const h=loadHistory();
  if(!h.length){list.innerHTML='<div class="hist-empty">No history yet. Run an analysis to start tracking.</div>';return;}
  list.innerHTML=h.map(e=>{
    const cls=e.signal==='BUY'?'buy':'sell';
    return `<div class="hist-row"><span class="hist-pair">${e.pair}</span><span class="hist-tf">${e.tf}</span><span class="hist-sig ${cls}">${e.signal}</span><span class="hist-conf">${e.confidence}%</span></div>`;
  }).join('');
}
document.getElementById('hist-clear-btn')?.addEventListener('click',()=>{
  try{localStorage.removeItem('tv_history');}catch(e){}
  renderHistory();
  toast('History cleared','ok');
});
renderHistory();

// ─── Price Alerts ─────────────────────────────────────────────────────────────
const ALERT={price:null,above:null,id:null};
function setAlert(price,currentPrice){
  ALERT.price=price;ALERT.above=price>currentPrice;
  const badge=document.getElementById('alert-active-badge');
  const wrap=document.getElementById('alert-row');
  if(badge){badge.style.display='flex';document.getElementById('alert-badge-text').textContent=`Alert: ${fmtP(price)}`;}
  if(wrap) wrap.style.display='none';
  toast(`Alert set at ${fmtP(price)}`,'ok');
}
function clearAlert(){
  ALERT.price=null;clearInterval(ALERT.id);
  const badge=document.getElementById('alert-active-badge');
  const wrap=document.getElementById('alert-row');
  if(badge) badge.style.display='none';
  if(wrap) wrap.style.display='flex';
  document.getElementById('alert-input').value='';
}
async function checkAlert(info){
  if(!ALERT.price||!info) return;
  try{
    let price;
    if(info.useBinance){
      const r=await fetchT(`https://api.binance.com/api/v3/ticker/price?symbol=${info.binSym}`,5000);
      price=parseFloat((await r.json()).price);
    } else {
      const c=await fetchYahoo(info.yahooSym,'1h');
      price=c[c.length-1].close;
    }
    const triggered=ALERT.above?price>=ALERT.price:price<=ALERT.price;
    if(triggered){
      if(Notification.permission==='granted') new Notification('TradeVision AI Alert',{body:`${info.display} hit ${fmtP(ALERT.price)} · Current: ${fmtP(price)}`,icon:''});
      toast(`🔔 Alert triggered! ${info.display} @ ${fmtP(price)}`,'ok');
      clearAlert();
    }
  }catch(e){}
}
document.getElementById('alert-set-btn')?.addEventListener('click',()=>{
  const v=parseFloat(document.getElementById('alert-input').value);
  if(!v||isNaN(v)){toast('Enter a valid alert price','warn');return;}
  if(!S.active){toast('Analyze a pair first','warn');return;}
  if(Notification.permission==='default') Notification.requestPermission();
  setAlert(v,S.lastCandles?S.lastCandles[S.lastCandles.length-1].close:v);
  ALERT.id=setInterval(()=>checkAlert(S.active),30000);
});
document.getElementById('alert-active-badge')?.addEventListener('click',()=>{clearAlert();toast('Alert cleared','ok');});

// ─── Chart Drawing Tools ──────────────────────────────────────────────────────
const DT={mode:'pointer',drawings:[],isDrawing:false,start:null};
const CS={pMin:0,pMax:1,pH:0,W:0}; // chart state for coord mapping
function canvasToPrice(y){return CS.pMin+(1-y/CS.pH)*(CS.pMax-CS.pMin);}
function priceToY(p){return CS.pH*(1-(p-CS.pMin)/(CS.pMax-CS.pMin));}
function initDrawingTools(){
  const canvas=document.getElementById('main-canvas');
  const toolbar=document.getElementById('draw-toolbar');
  if(!toolbar||!canvas) return;
  toolbar.classList.remove('hidden');
  ['pointer','hline','trendline','rect'].forEach(id=>{
    const btn=document.getElementById(`draw-${id}`);
    if(!btn) return;
    btn.addEventListener('click',()=>{
      DT.mode=id;DT.isDrawing=false;
      document.querySelectorAll('.draw-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      canvas.style.cursor=id==='pointer'?'default':'crosshair';
    });
  });
  document.getElementById('draw-clear')?.addEventListener('click',()=>{
    DT.drawings=[];
    if(S.lastCandles&&S.lastTA&&S.lastSig) drawChart(canvas,S.lastCandles,S.lastTA,S.lastSig);
    toast('Drawings cleared','ok');
  });
  canvas.addEventListener('mousedown',e=>{
    if(DT.mode==='pointer') return;
    const rect=canvas.getBoundingClientRect();
    const scaleX=canvas.clientWidth/rect.width,scaleY=canvas.clientHeight/rect.height;
    const x=(e.clientX-rect.left)/scaleX, y=(e.clientY-rect.top)/scaleY;
    if(y>CS.pH) return; // only draw in price panel
    DT.isDrawing=true;DT.start={x,y,price:canvasToPrice(y),xFrac:x/CS.W};
  });
  canvas.addEventListener('mouseup',e=>{
    if(!DT.isDrawing||DT.mode==='pointer') return;
    const rect=canvas.getBoundingClientRect();
    const scaleX=canvas.clientWidth/rect.width,scaleY=canvas.clientHeight/rect.height;
    const x=(e.clientX-rect.left)/scaleX, y=(e.clientY-rect.top)/scaleY;
    const endPrice=canvasToPrice(Math.min(y,CS.pH));
    if(DT.mode==='hline') DT.drawings.push({type:'hline',price:DT.start.price});
    else if(DT.mode==='trendline') DT.drawings.push({type:'trendline',x1:DT.start.xFrac,p1:DT.start.price,x2:x/CS.W,p2:endPrice});
    else if(DT.mode==='rect') DT.drawings.push({type:'rect',x1:DT.start.xFrac,p1:DT.start.price,x2:x/CS.W,p2:endPrice});
    DT.isDrawing=false;
    if(S.lastCandles&&S.lastTA&&S.lastSig) drawChart(canvas,S.lastCandles,S.lastTA,S.lastSig);
  });
}
function drawDrawings(ctx,W){
  DT.drawings.forEach(d=>{
    ctx.save();
    if(d.type==='hline'){
      const y=priceToY(d.price);
      if(y<0||y>CS.pH){ctx.restore();return;}
      ctx.strokeStyle='rgba(249,168,37,0.7)';ctx.lineWidth=1.5;ctx.setLineDash([6,3]);
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
      ctx.setLineDash([]);ctx.fillStyle='rgba(249,168,37,0.85)';ctx.font='bold 10px Inter';
      ctx.textAlign='right';ctx.fillText(fmtP(d.price),W-4,y-3);
    } else if(d.type==='trendline'){
      const x1=d.x1*W,y1=priceToY(d.p1),x2=d.x2*W,y2=priceToY(d.p2);
      ctx.strokeStyle='rgba(79,172,254,0.75)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    } else if(d.type==='rect'){
      const x1=Math.min(d.x1,d.x2)*W,x2=Math.max(d.x1,d.x2)*W;
      const y1=priceToY(Math.max(d.p1,d.p2)),y2=priceToY(Math.min(d.p1,d.p2));
      ctx.strokeStyle='rgba(206,147,216,0.6)';ctx.lineWidth=1;ctx.fillStyle='rgba(206,147,216,0.06)';
      ctx.fillRect(x1,y1,x2-x1,y2-y1);ctx.strokeRect(x1,y1,x2-x1,y2-y1);
    }
    ctx.restore();
  });
}

// ─── Collapsibles ─────────────────────────────────────────────────────────────
document.querySelectorAll('.collapsible-toggle').forEach(toggle=>{
  toggle.addEventListener('click',e=>{
    if(e.target.classList.contains('hist-clear-btn')) return;
    const bodyId=toggle.id.replace('-toggle','-body');
    const body=document.getElementById(bodyId);
    if(!body) return;
    const open=body.classList.toggle('open');
    toggle.classList.toggle('open',open);
  });
});

// ─── Signal Generator ─────────────────────────────────────────────────────────
function generateSignal(candles, ta, pInfo) {
  const { e20, e50, e200, ri, mc, bbs, at, adxData, vwapLine, dc } = ta;
  const n = candles.length-1, close = candles[n].close;
  let bull=0, bear=0;

  // EMA
  if(e20[n]&&e50[n]){ close>e20[n]?bull+=10:bear+=10; e20[n]>e50[n]?bull+=10:bear+=10; }
  if(e50[n]&&e200[n]){ e50[n]>e200[n]?bull+=10:bear+=10; }
  // RSI
  const rv=ri[n];
  if(rv!=null){
    if(rv<25)bull+=25; else if(rv<35)bull+=18; else if(rv<45)bull+=8;
    else if(rv<55) {} else if(rv<65)bear+=8; else if(rv<75)bear+=18; else bear+=25;
  }
  // MACD
  const hv=mc.histogram[n], hp=mc.histogram[n-1];
  if(hv!=null&&hp!=null){
    if(hv>0){hp<=0?bull+=25:hv>hp?bull+=12:bull+=5}
    else{hp>=0?bear+=25:Math.abs(hv)>Math.abs(hp)?bear+=12:bear+=5}
  }
  // BB
  const bu=bbs.upper[n],bl=bbs.lower[n];
  let bbPos=0.5;
  if(bu&&bl&&bu!==bl){
    bbPos=(close-bl)/(bu-bl);
    if(bbPos<0.08)bull+=20; else if(bbPos<0.28)bull+=10;
    else if(bbPos>0.92)bear+=20; else if(bbPos>0.72)bear+=10;
  }
  // ADX — boost confidence when trend is strong
  const adxV=adxData?.adx[n], diPV=adxData?.diP[n], diNV=adxData?.diN[n];
  if(adxV!=null&&diPV!=null&&diNV!=null){
    if(adxV>25){// trending
      if(diPV>diNV)bull+=15; else bear+=15;
    }
  }
  // VWAP
  const vw=vwapLine?.[n];
  if(vw!=null){
    close>vw?bull+=12:bear+=12;
  }
  const net=bull-bear;
  const signal = net >= 0 ? 'BUY' : 'SELL';
  const confidence = Math.min(92, 40+Math.abs(net)*0.55);

  // Levels
  const atrV=at[n]??(close*0.012);
  const sl=candles.slice(Math.max(0,n-20),n+1);
  const swL=Math.min(...sl.map(c=>c.low)), swH=Math.max(...sl.map(c=>c.high));
  const isForex = pInfo.type==='forex'||close<5;
  const dec = isForex?5:close<10?4:close<1000?2:0;
  const f = v=>parseFloat(v.toFixed(dec)).toLocaleString('en',{minimumFractionDigits:dec,maximumFractionDigits:dec});

  let entry,tp,slV,rrRatio=S.rr;
  if(signal==='BUY'){
    entry=close; slV=Math.max(swL-atrV*0.3,close-atrV*1.8);
    const r=entry-slV; tp=entry+r*rrRatio;
  } else {
    entry=close; slV=Math.min(swH+atrV*0.3,close+atrV*1.8);
    const r=slV-entry; tp=entry-r*rrRatio;
  }
  return { signal, confidence:Math.round(confidence), entry:f(entry), tp:f(tp), sl:f(slV), rr:`1:${rrRatio}`, rv, hv, bbPos, atrV, adxV:adxV?.toFixed(1), vwap:vw?.toFixed(5) };
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
  const W=canvas.clientWidth, H=canvas.clientHeight;
  if(W<1||H<1||!candles?.length) return;
  const dpr=window.devicePixelRatio||1;
  canvas.width=W*dpr; canvas.height=H*dpr;
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  const MAX=Math.min(candles.length,Math.floor(W/7.5));
  const cs=candles.slice(-MAX); const n=cs.length;
  if(n<2) return;

  // Panel layout — price | vol | rsi | macd | adx | atr
  const pH=Math.floor(H*0.46),
        vH=Math.floor(H*0.07),
        rH=Math.floor(H*0.11),
        mH=Math.floor(H*0.11),
        dxH=Math.floor(H*0.11),
        atH=H-pH-vH-rH-mH-dxH;
  const vY=pH, rY=vY+vH, mY=rY+rH, dxY=mY+mH, atY=dxY+dxH;
  const rightPad = Math.max(15, Math.floor(n * 0.3));
  const cw=W/(n+rightPad), bw=Math.max(2,cw*0.62);
  const xOf=i=>(i+0.5)*cw;

  // Price range — expand to include Donchian / VWAP
  const dcU=ta.dc?.upper.slice(-n)||[], dcL=ta.dc?.lower.slice(-n)||[];
  const vwapArr=ta.vwapLine?.slice(-n)||[];
  const allPrices=[...cs.map(c=>c.high),...cs.map(c=>c.low),...dcU.filter(Boolean),...dcL.filter(Boolean),...vwapArr.filter(Boolean)];
  const pMax=Math.max(...allPrices)*1.002, pMin=Math.min(...allPrices)*0.998;
  const pR=pMax-pMin||1;
  const py=v=>pH*(1-(v-pMin)/pR);

  // Update global chart state for drawing tools
  CS.pMin=pMin; CS.pMax=pMax; CS.pH=pH; CS.W=W;

  // ── S/R Zones ────────────────────────────────────────────────────────────
  (ta.srZones||[]).forEach(z=>{
    const y1=py(Math.min(z.top,pMax)),y2=py(Math.max(z.bottom,pMin));
    const h=Math.abs(y2-y1)||2;
    ctx.fillStyle=z.type==='resistance'?'rgba(255,82,82,0.07)':'rgba(0,230,118,0.07)';
    ctx.fillRect(0,Math.min(y1,y2),W*0.82,Math.max(h,2));
    ctx.strokeStyle=z.type==='resistance'?'rgba(255,82,82,0.3)':'rgba(0,230,118,0.3)';
    ctx.lineWidth=0.8;ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(0,py(z.mid));ctx.lineTo(W*0.82,py(z.mid));ctx.stroke();
    ctx.setLineDash([]);
    if(py(z.mid)>8&&py(z.mid)<pH-4){
      ctx.fillStyle=z.type==='resistance'?'rgba(255,82,82,0.55)':'rgba(0,230,118,0.55)';
      ctx.font='8px JetBrains Mono';ctx.textAlign='left';
      ctx.fillText(z.type==='resistance'?'R':'S',3,py(z.mid)-2);
    }
  });

  // Grid
  ctx.strokeStyle=C.grid; ctx.lineWidth=1;
  ctx.fillStyle=C.txt; ctx.font=`9px 'JetBrains Mono',monospace`;
  for(let i=0;i<=5;i++){
    const v=pMin+pR*i/5, yy=py(v);
    ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(W,yy); ctx.stroke();
    ctx.textAlign='right'; ctx.fillText(fmtP(v),W-3,yy-2);
  }

  // ── Donchian Cloud (cloud only, no border lines) ──────────────────────────
  ctx.beginPath();
  let dcStart=true;
  dcU.forEach((v,i)=>{if(v==null){dcStart=true;return;} dcStart?ctx.moveTo(xOf(i),py(v)):ctx.lineTo(xOf(i),py(v)); dcStart=false;});
  for(let i=n-1;i>=0;i--){if(dcL[i]==null)continue; ctx.lineTo(xOf(i),py(dcL[i]));}
  ctx.closePath(); ctx.fillStyle=C.dcFill; ctx.fill();

  // ── BB ────────────────────────────────────────────────────────────────────
  const bbU=ta.bbs.upper.slice(-n), bbL=ta.bbs.lower.slice(-n), bbM=ta.bbs.middle.slice(-n);
  ctx.beginPath();
  bbU.forEach((v,i)=>{if(v==null)return; i===0||bbU[i-1]==null?ctx.moveTo(xOf(i),py(v)):ctx.lineTo(xOf(i),py(v));});
  for(let i=n-1;i>=0;i--){if(bbL[i]==null)continue; ctx.lineTo(xOf(i),py(bbL[i]));}
  ctx.closePath(); ctx.fillStyle=C.bbFill; ctx.fill();
  [[bbU,C.bbLine],[bbM,'rgba(255,255,255,0.1)'],[bbL,C.bbLine]].forEach(([arr,cl])=>{
    ctx.beginPath(); ctx.strokeStyle=cl; ctx.lineWidth=1; let s=true;
    arr.forEach((v,i)=>{if(v==null){s=true;return;} s?ctx.moveTo(xOf(i),py(v)):ctx.lineTo(xOf(i),py(v)); s=false;});
    ctx.stroke();
  });

  // ── EMAs ──────────────────────────────────────────────────────────────────
  [[ta.e20.slice(-n),C.e20,1.5],[ta.e50.slice(-n),C.e50,1.5],[ta.e200.slice(-n),C.e200,1.2]].forEach(([arr,cl,lw])=>{
    ctx.beginPath(); ctx.strokeStyle=cl; ctx.lineWidth=lw; let s=true;
    arr.forEach((v,i)=>{if(v==null){s=true;return;} s?ctx.moveTo(xOf(i),py(v)):ctx.lineTo(xOf(i),py(v)); s=false;});
    ctx.stroke();
  });

  // ── VWAP ──────────────────────────────────────────────────────────────────
  ctx.beginPath(); ctx.strokeStyle=C.vwap; ctx.lineWidth=1.6; ctx.setLineDash([5,3]); let vwFirst=true;
  vwapArr.forEach((v,i)=>{if(v==null){vwFirst=true;return;} vwFirst?ctx.moveTo(xOf(i),py(v)):ctx.lineTo(xOf(i),py(v)); vwFirst=false;});
  ctx.stroke(); ctx.setLineDash([]);

  // ── Candles ───────────────────────────────────────────────────────────────
  cs.forEach((cd,i)=>{
    const x=xOf(i), up=cd.close>=cd.open, cl=up?C.bull:C.bear;
    ctx.strokeStyle=cl; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x,py(cd.high)); ctx.lineTo(x,py(cd.low)); ctx.stroke();
    const t=Math.min(py(cd.open),py(cd.close)), b=Math.max(py(cd.open),py(cd.close));
    ctx.fillStyle=cl;
    if(!up) ctx.globalAlpha=0.82;
    ctx.fillRect(x-bw/2, t, bw, Math.max(1,b-t));
    ctx.globalAlpha=1;
  });

  // ── Entry/TP/SL & Price tag ───────────────────────────────────────────────
  const drawHL=(price,cl,lbl,bgOverride,xOffset=0)=>{
    const v = typeof price === 'number' ? price : parseFloat(price?.toString().replace(/,/g,''));
    if(!v||isNaN(v)||v<pMin||v>pMax) return;
    const yy=py(v);
    ctx.save(); ctx.strokeStyle=cl; ctx.lineWidth=1.5;
    ctx.setLineDash([7,4]); ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(W-xOffset,yy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font='bold 10px Inter,sans-serif'; ctx.textAlign='right';
    const tag=`${lbl}  ${typeof price === 'number' ? fmtP(price) : price}`;
    const tw=ctx.measureText(tag).width;
    ctx.globalAlpha=0.92; ctx.fillStyle = bgOverride || cl;
    ctx.fillRect(W - tw - 12 - xOffset, yy-9, tw+12, 18);
    const isLight = document.body.classList.contains('light-theme');
    ctx.globalAlpha=1; ctx.fillStyle= bgOverride ? '#fff' : isLight ? '#fff' : '#000';
    ctx.fillText(tag, W - 6 - xOffset, yy+4);
    ctx.restore();
  };

  const actualPrice = cs[n-1].close;
  drawHL(actualPrice, 'rgba(79,172,254,0.6)', '▶', 'rgba(10,10,25,0.9)');

  if(sig){
    drawHL(sig.entry,C.entry,'ENTRY');
    drawHL(sig.tp,   C.tp,   'TP   ');
    drawHL(sig.sl,   C.sl,   'SL   ');
  }

  // ── Fibonacci Levels ──────────────────────────────────────────────────────
  const startO=candles.length-Math.min(candles.length,MAX);
  if(ta.fib){
    ta.fib.levels.forEach(lv=>{
      if(lv.price<pMin||lv.price>pMax) return;
      const yy=py(lv.price);
      const isKey=lv.r===0.382||lv.r===0.5||lv.r===0.618;
      ctx.save();ctx.strokeStyle=isKey?'rgba(255,213,79,0.35)':'rgba(255,213,79,0.15)';ctx.lineWidth=0.8;ctx.setLineDash([3,4]);
      ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(W*0.82,yy);ctx.stroke();ctx.setLineDash([]);
      if(yy>8&&yy<pH-4){
        ctx.fillStyle='rgba(255,213,79,0.6)';ctx.font='8px JetBrains Mono';ctx.textAlign='right';
        ctx.fillText(lv.label,W*0.82-2,yy-2);
      }
      ctx.restore();
    });
  }

  // ── Market Structure Labels ───────────────────────────────────────────────
  if(ta.ms?.labels){
    ta.ms.labels.forEach(lb=>{
      const idx=lb.i-startO;
      if(idx<0||idx>=n) return;
      const x=xOf(idx),y=lb.side==='high'?py(lb.price)-8:py(lb.price)+14;
      ctx.save();ctx.font='bold 8px JetBrains Mono';ctx.textAlign='center';
      ctx.fillStyle=lb.tag==='HH'||lb.tag==='HL'?'rgba(0,230,118,0.7)':'rgba(255,82,82,0.7)';
      ctx.fillText(lb.tag,x,y);ctx.restore();
    });
  }

  // ── Pattern Badges ────────────────────────────────────────────────────────
  (ta.patterns||[]).slice(-8).forEach(pt=>{
    const idx=pt.i-startO;
    if(idx<0||idx>=n) return;
    const cd=cs[idx];if(!cd) return;
    const x=xOf(idx);
    const yBase=pt.type==='bull'?py(cd.low)+14:py(cd.high)-8;
    ctx.save();ctx.font='bold 7px Inter';ctx.textAlign='center';
    ctx.fillStyle=pt.type==='bull'?'rgba(0,230,118,0.75)':pt.type==='bear'?'rgba(255,82,82,0.75)':'rgba(255,213,79,0.65)';
    ctx.fillText(pt.name,x,yBase);ctx.restore();
  });

  // ── Volume ────────────────────────────────────────────────────────────────
  const maxV=Math.max(...cs.map(c=>c.volume))||1;
  cs.forEach((cd,i)=>{
    const vh=(cd.volume/maxV)*vH;
    ctx.fillStyle=cd.close>=cd.open?C.vol_bull:C.vol_bear;
    ctx.fillRect(xOf(i)-bw/2, vY+vH-vh, bw, vh);
  });
  ctx.fillStyle=C.txt; ctx.font='9px Inter'; ctx.textAlign='left'; ctx.fillText('VOL',4,vY+12);

  // ── RSI ───────────────────────────────────────────────────────────────────
  const ri=ta.ri.slice(-n);
  const rpy=v=>rY+rH*(1-v/100);
  ctx.fillStyle='rgba(255,82,82,0.10)'; ctx.fillRect(0,rY,W,rH*0.3);
  ctx.fillStyle='rgba(0,230,118,0.08)'; ctx.fillRect(0,rY+rH*0.7,W,rH*0.3);
  [30,50,70].forEach(v=>{
    ctx.strokeStyle=v===50?'rgba(255,255,255,.12)':'rgba(255,255,255,.07)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(0,rpy(v)); ctx.lineTo(W,rpy(v)); ctx.stroke();
    ctx.fillStyle=C.txt; ctx.font='9px JetBrains Mono'; ctx.textAlign='right'; ctx.fillText(v,W-2,rpy(v)-2);
  });
  ctx.beginPath(); ctx.strokeStyle=C.rsiLine; ctx.lineWidth=1.5; let rFirst=true;
  ri.forEach((v,i)=>{if(v==null){rFirst=true;return;} rFirst?ctx.moveTo(xOf(i),rpy(v)):ctx.lineTo(xOf(i),rpy(v)); rFirst=false;});
  ctx.stroke();
  // RSI divergence arrows
  const drawDivArrow=(xi,rsiV,isBull)=>{
    if(xi<0||xi>=n) return;
    const x=xOf(xi),y=rpy(rsiV);
    ctx.save();ctx.fillStyle=isBull?'rgba(0,230,118,0.85)':'rgba(255,82,82,0.85)';
    ctx.font='bold 10px Inter';ctx.textAlign='center';
    ctx.fillText(isBull?'▲':'▼',x,isBull?y+12:y-4);
    ctx.restore();
  };
  (ta.divergence?.bullish||[]).forEach(d=>{ const si=d.endI-startO; drawDivArrow(si,d.endRSI,true); });
  (ta.divergence?.bearish||[]).forEach(d=>{ const si=d.endI-startO; drawDivArrow(si,d.endRSI,false); });
  ctx.fillStyle=C.txt; ctx.font='9px Inter'; ctx.textAlign='left'; ctx.fillText('RSI(14)',4,rY+12);

  // ── MACD ──────────────────────────────────────────────────────────────────
  const ml=ta.mc.macd.slice(-n), sl2=ta.mc.signal.slice(-n), hl=ta.mc.histogram.slice(-n);
  const allv=[...ml,...sl2,...hl].filter(v=>v!=null);
  const mMax=Math.max(...allv.map(Math.abs))||1;
  const mpy=v=>mY+mH*(1-(v+mMax)/(2*mMax));
  ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(0,mpy(0)); ctx.lineTo(W,mpy(0)); ctx.stroke();
  hl.forEach((v,i)=>{
    if(v==null)return;
    const hh=Math.abs(v)*mH/(2*mMax), yt=v>=0?mpy(v):mpy(0);
    ctx.fillStyle=v>=0?C.mBull:C.mBear; ctx.fillRect(xOf(i)-bw/2,yt,bw,Math.max(1,hh));
  });
  [[ml,C.macdL,1.5],[sl2,C.macdS,1.2]].forEach(([arr,cl,lw])=>{
    ctx.beginPath(); ctx.strokeStyle=cl; ctx.lineWidth=lw; let s=true;
    arr.forEach((v,i)=>{if(v==null){s=true;return;} s?ctx.moveTo(xOf(i),mpy(v)):ctx.lineTo(xOf(i),mpy(v)); s=false;});
    ctx.stroke();
  });
  ctx.fillStyle=C.txt; ctx.font='9px Inter'; ctx.textAlign='left'; ctx.fillText('MACD',4,mY+12);

  // ── ADX panel ─────────────────────────────────────────────────────────────
  const adxArr=ta.adxData?.adx.slice(-n)||[], diPArr=ta.adxData?.diP.slice(-n)||[], diNArr=ta.adxData?.diN.slice(-n)||[];
  const adxVals=[...adxArr,...diPArr,...diNArr].filter(v=>v!=null);
  const adxMax=Math.max(...adxVals,50)||50;
  const adxPy=v=>dxY+dxH*(1-v/adxMax);
  // reference line at 25
  ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(0,adxPy(25)); ctx.lineTo(W,adxPy(25)); ctx.stroke();
  ctx.fillStyle=C.txt; ctx.font='9px JetBrains Mono'; ctx.textAlign='right'; ctx.fillText('25',W-2,adxPy(25)-2);
  [[adxArr,C.adxLine,1.6],[diPArr,C.diPLine,1.2],[diNArr,C.diNLine,1.2]].forEach(([arr,cl,lw])=>{
    ctx.beginPath(); ctx.strokeStyle=cl; ctx.lineWidth=lw; let s=true;
    arr.forEach((v,i)=>{if(v==null){s=true;return;} s?ctx.moveTo(xOf(i),adxPy(v)):ctx.lineTo(xOf(i),adxPy(v)); s=false;});
    ctx.stroke();
  });
  ctx.fillStyle=C.txt; ctx.font='9px Inter'; ctx.textAlign='left'; ctx.fillText('ADX(14)',4,dxY+12);

  // ── ATR panel ─────────────────────────────────────────────────────────────
  const atrArr=ta.at.slice(-n);
  const atrMax=Math.max(...atrArr.filter(Boolean))||1;
  const atrPy=v=>atY+atH*(1-v/atrMax);
  ctx.beginPath(); ctx.strokeStyle=C.atrLine; ctx.lineWidth=1.5; let aFirst=true;
  atrArr.forEach((v,i)=>{if(v==null){aFirst=true;return;} aFirst?ctx.moveTo(xOf(i),atrPy(v)):ctx.lineTo(xOf(i),atrPy(v)); aFirst=false;});
  ctx.stroke();
  ctx.fillStyle=C.txt; ctx.font='9px Inter'; ctx.textAlign='left'; ctx.fillText('ATR(14)',4,atY+12);

  // ── Dividers ──────────────────────────────────────────────────────────────
  ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1;
  [vY,rY,mY,dxY,atY].forEach(y=>{ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();});

  // ── X-axis time ───────────────────────────────────────────────────────────
  ctx.fillStyle=C.txt; ctx.font='9px JetBrains Mono'; ctx.textAlign='center';
  const tStep=Math.max(1,Math.floor(n/7));
  for(let i=0;i<n;i+=tStep) ctx.fillText(fmtT(cs[i].time),xOf(i),H-2);

  // ── User Drawings ─────────────────────────────────────────────────────────
  drawDrawings(ctx,W);
}

function fmtP(v){
  if(!v)return'0';
  if(v>=10000)return v.toFixed(0);
  if(v>=100)return v.toFixed(2);
  if(v>=1)return v.toFixed(4);
  return v.toFixed(5);
}
function fmtT(ts){
  const d=new Date(ts), h=d.getHours(), mo=d.toLocaleString('en',{month:'short'});
  return h===0?`${d.getDate()} ${mo}`:`${String(h).padStart(2,'0')}:00`;
}

// ─── Particles ────────────────────────────────────────────────────────────────
(function(){
  const cv=document.getElementById('particles-canvas'), cx=cv.getContext('2d');
  let W,H,P;
  const init=()=>{W=cv.width=innerWidth;H=cv.height=innerHeight;P=Array.from({length:48},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.2+.3,vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.2,a:Math.random()*.38+.07,h:Math.random()>.5?220:270}))};
  const draw=()=>{cx.clearRect(0,0,W,H);P.forEach(p=>{p.x=(p.x+p.vx+W)%W;p.y=(p.y+p.vy+H)%H;cx.beginPath();cx.arc(p.x,p.y,p.r,0,Math.PI*2);cx.fillStyle=`hsla(${p.h},70%,75%,${p.a})`;cx.fill()});requestAnimationFrame(draw)};
  init();draw();window.addEventListener('resize',init);
})();

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function toast(msg, type='info'){
  const prev=document.querySelector('.toast');if(prev)prev.remove();
  const el=document.createElement('div');el.className=`toast ${type}`;
  el.textContent=({'ok':'✓','err':'✗','warn':'⚠','info':'ℹ'}[type]||'ℹ')+' '+msg;
  document.body.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('show')));
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),400)},4500);
}

function showState(name){
  ['state-empty','state-loading','state-error','chart-wrapper'].forEach(id=>{
    document.getElementById(id).style.display=(id===name)?'flex':'none';
  });
}

let _stepT;
function startSteps(){
  const steps=['ls1','ls2','ls3','ls4'];
  steps.forEach(s=>document.getElementById(s).className='lstep');
  document.getElementById('ls1').className='lstep active';
  let cur=0;
  _stepT=setInterval(()=>{
    if(cur<steps.length-1){document.getElementById(steps[cur]).className='lstep done';cur++;document.getElementById(steps[cur]).className='lstep active';}
  },800);
}
function stopSteps(){ clearInterval(_stepT); ['ls1','ls2','ls3','ls4'].forEach(s=>document.getElementById(s).className='lstep done'); }

// ─── Pair Selector UI ────────────────────────────────────────────────────────
const pairInput  = document.getElementById('pair-input');
const cSelects   = document.querySelectorAll('.c-select');
const localSearch= document.getElementById('local-search');
const suggestionsBox = document.getElementById('local-suggestions');

// Build available dictionary from dropdowns
const localPairs = [];
cSelects.forEach(sel => {
  const type = sel.dataset.type;
  Array.from(sel.options).forEach(opt => {
    if(opt.value) localPairs.push({ val: opt.value, text: opt.textContent, type });
  });
});

localSearch.addEventListener('input', () => {
  const q = localSearch.value.trim().toLowerCase();
  if(!q) { suggestionsBox.style.display = 'none'; return; }
  
  const matches = localPairs.filter(p => p.val.toLowerCase().includes(q) || p.text.toLowerCase().includes(q));
  
  if(!matches.length) {
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
          if(opt.value === val) { sel.selectedIndex = idx; found = true; sel.dispatchEvent(new Event('change')); }
        });
        if(!found) {
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
  if(suggestionsBox && !suggestionsBox.contains(e.target) && e.target !== localSearch) {
    suggestionsBox.style.display = 'none';
  }
});

// Build custom glassy dropdowns over the ugly OS native selects
cSelects.forEach(sel => {
  const wrapper = sel.closest('.select-wrapper');
  if(!wrapper) return;
  const dd = document.createElement('div');
  dd.className = 'sw-dropdown';
  
  // Re-populate dropdown on first focus/click to ensure options are fresh
  const populate = () => {
    dd.innerHTML = '';
    Array.from(sel.options).forEach((opt, idx) => {
      if(idx === 0) return; // skip placeholder
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
  if(!e.target.closest('.select-wrapper')) {
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
if(localStorage.getItem('tv-light-mode')==='true') {
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
      e20:     ema(closes, 20),
      e50:     ema(closes, 50),
      e200:    ema(closes, 200),
      ri:      rsi(closes, 14),
      mc:      macd(closes),
      bbs:     bb(closes, 20),
      at:      atr(candles, 14),
      adxData: adx(candles, 14),
      vwapLine:vwap(candles),
      dc:      donchian(candles, 20),
    };
    // Advanced analysis layers
    const swings = swingPoints(candles);
    ta.ms       = detectMarketStructure(candles, swings);
    ta.srZones  = detectSRZones(candles, swings);
    ta.patterns = detectPatterns(candles);
    ta.divergence = detectDivergence(candles, ta.ri, swings);
    ta.fib      = fibonacci(candles);
    const sig = generateSignal(candles, ta, info);

    S.lastCandles = candles; S.lastTA = ta; S.lastSig = sig;

    stopSteps();
    await new Promise(r => setTimeout(r, 300));
    showState('chart-wrapper');

    // Chart topbar
    const last = candles[candles.length-1], prev = candles[candles.length-2];
    const chg = ((last.close-prev.close)/prev.close*100).toFixed(2);
    const up = parseFloat(chg) >= 0;
    document.getElementById('chart-pair-name').textContent = pairInput.value.toUpperCase();
    document.getElementById('chart-price').textContent = fmtP(last.close);
    const chEl = document.getElementById('chart-change');
    chEl.textContent = `${up?'+':''}${chg}%`; chEl.className = `chart-change ${up?'up':'down'}`;
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
    saveHistory({pair:pairInput.value.toUpperCase(),tf:S.tf,signal:sig.signal,confidence:sig.confidence,date:new Date().toLocaleString()});
    renderHistory();
    toast(`${pairInput.value.toUpperCase()} · ${sig.signal} · ${sig.confidence}% confidence`, 'ok');
    // Multi-TF (async, non-blocking)
    const mtfCard = document.getElementById('mtf-card');
    if(mtfCard){ mtfCard.style.display='flex'; }
    runMultiTF(info).then(renderMTF).catch(()=>{});
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

  const isBuy  = sig.signal === 'BUY';
  const isSell = sig.signal === 'SELL';
  const hero = document.getElementById('signal-hero');
  hero.className = `signal-hero ${isBuy?'buy':isSell?'sell':'neutral'}`;
  document.getElementById('sig-icon').textContent = isBuy ? '▲' : isSell ? '▼' : '↔';
  document.getElementById('sig-text').textContent = sig.signal;
  document.getElementById('sig-pair').textContent = pairInput.value.toUpperCase();
  document.getElementById('sig-tf').textContent   = S.tf.toUpperCase() + ' Timeframe';

  document.getElementById('conf-pct').textContent = sig.confidence + '%';
  setTimeout(() => { document.getElementById('conf-fill').style.width = sig.confidence + '%'; }, 80);
  const fill = document.getElementById('conf-fill');
  fill.style.background = isBuy ? 'linear-gradient(90deg,#7B5EA7,#00E676)' : isSell ? 'linear-gradient(90deg,#7B5EA7,#FF5252)' : 'linear-gradient(90deg,#7B5EA7,#FFD54F)';
  const tag = document.getElementById('conf-tag');
  const confLabel = sig.confidence>=65?'High':sig.confidence>=45?'Moderate':'Low';
  tag.textContent = `${confLabel} Confidence`;
  tag.className   = `conf-tag ${sig.confidence>=65?'high':sig.confidence>=45?'mid':'low'}`;

  document.getElementById('lv-entry').textContent = sig.entry;
  document.getElementById('lv-tp').textContent    = sig.tp;
  document.getElementById('lv-sl').textContent    = sig.sl;
  document.getElementById('lv-rr').textContent    = sig.rr;

  // ── Market Structure Badges
  const ms = ta?.ms, strip = document.getElementById('ms-strip');
  if(strip && ms){
    const badges = [];
    const trendCls = ms.trend==='uptrend'?'uptrend':ms.trend==='downtrend'?'downtrend':'ranging';
    badges.push(`<span class="ms-badge ${trendCls}">${ms.trend==='uptrend'?'↑ Uptrend':ms.trend==='downtrend'?'↓ Downtrend':'↔ Ranging'}</span>`);
    ms.events.forEach(ev=>{ badges.push(`<span class="ms-badge ${ev.type.toLowerCase()}">${ev.type} ${ev.dir==='bull'?'↑':'↓'}</span>`); });
    if(ta.divergence?.bullish?.length) badges.push('<span class="ms-badge div-bull">RSI Div ↑</span>');
    if(ta.divergence?.bearish?.length) badges.push('<span class="ms-badge div-bear">RSI Div ↓</span>');
    const pats=ta.patterns?.filter(p=>p.type!=='neutral').slice(-2)||[];
    pats.forEach(p=>{ badges.push(`<span class="ms-badge ${p.type==='bull'?'uptrend':'downtrend'}">${p.name}</span>`); });
    strip.innerHTML = badges.join('');
  }

  // ── AI Narrative
  const nc = document.getElementById('narrative-content');
  if(nc && ta){
    setTimeout(()=>{
      try{ nc.innerHTML = `<p class="narrative-text">${generateNarrative(sig,ta,info)}</p>`; }
      catch(e){ nc.innerHTML='<p class="narrative-text">Analysis complete.</p>'; }
    }, 600);
  }
}
