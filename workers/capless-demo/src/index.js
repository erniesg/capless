/**
 * Capless Demo - Cloudflare Worker
 * Serves static HTML/JS frontend for viral parliamentary moments
 */

export default {
  async fetch(request, env) {
    // Simple static asset serving
    // Cloudflare Workers with [assets] config automatically serves files from public/
    return new Response('Worker is running', {
      headers: { 'content-type': 'text/plain' },
    });
  },
};
