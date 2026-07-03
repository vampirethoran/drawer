// Client-only page: it drives the camera, MediaPipe and canvas — nothing to
// render on the server. Disabling SSR keeps browser globals and the MediaPipe
// import off the worker; the shell is still prerendered as static HTML.
export const ssr = false;
export const prerender = true;
