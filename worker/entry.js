import baseWorker from './index.js';
import { generateRecurring } from './recurring.js';

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': `public, max-age=${Number(env.CACHE_SECONDS || 60)}`,
  };
}

function json(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(env) },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(env) });
    const url = new URL(request.url);
    if (url.pathname === '/api/generate-recurring') {
      try {
        const dryRun = url.searchParams.get('run') !== '1';
        return json(await generateRecurring(env, { dryRun }), 200, env);
      } catch (error) {
        return json({ ok: false, error: error.message }, 500, env);
      }
    }
    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(generateRecurring(env, { dryRun: false }));
  },
};
