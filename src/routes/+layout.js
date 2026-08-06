// Prerender every route into plain HTML files that GitHub Pages can serve.
export const prerender = true;

// The whole app runs on data the browser owns (localStorage rules) plus a JSON file
// fetched at runtime, so there is nothing useful to render on the server.
export const ssr = false;

// Emit alerts/index.html rather than alerts.html - the shape GitHub Pages serves
// most reliably for extensionless URLs.
export const trailingSlash = 'always';
