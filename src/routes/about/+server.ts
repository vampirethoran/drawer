// Serve the standalone slide deck verbatim at /about. The deck is a complete
// HTML document (own <head>, fonts, script), so it must NOT go through the app
// shell / global Tailwind / runes — we return the raw file as-is. Prerendered,
// so Cloudflare serves it as a static asset with no worker invocation.
import deck from './deck.html?raw';

export const prerender = true;

export const GET = () =>
	new Response(deck, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
