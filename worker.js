// Cloudflare Worker entry. Static files are served straight from the repo by
// the assets setting in wrangler.jsonc; only /api/* requests reach this file.

import { onRequestPost } from './functions/api/request-call.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/request-call') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
      }
      return onRequestPost({ request, env });
    }

    if (pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
