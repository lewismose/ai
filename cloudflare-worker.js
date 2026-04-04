/**
 * TradeVision AI – Cloudflare Worker Proxy
 * ==========================================
 * Deploy this to Cloudflare Workers (free, 100k req/day).
 * It proxies Yahoo Finance + stooq requests and adds CORS headers,
 * solving GitHub Pages / any static-host CORS issues completely.
 *
 * SETUP (5 minutes, free):
 * 1. Go to https://workers.cloudflare.com → Sign up free
 * 2. Click "Create a Worker"
 * 3. Replace the default code with ALL of this file's content
 * 4. Click "Deploy"
 * 5. Copy your worker URL (e.g. https://tradevision-proxy.yourname.workers.dev)
 * 6. In app.js, set YOUR_WORKER_URL at the top of the PROXIES array
 */

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Only allow Yahoo Finance and stooq (security measure)
    const allowed = [
      'query1.finance.yahoo.com',
      'query2.finance.yahoo.com',
      'stooq.com',
    ];
    const targetHost = new URL(target).hostname;
    if (!allowed.some(h => targetHost.endsWith(h))) {
      return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      const response = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/',
          'Origin': 'https://finance.yahoo.com',
        },
        // Cache for 60 seconds at the edge to reduce upstream requests
        cf: { cacheTtl: 60, cacheEverything: true },
      });

      const body = await response.arrayBuffer();

      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=60',
          'X-Proxy': 'TradeVision-CF-Worker',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
