// ===== X Buddy — Startup Marker =====
// Runs at document_start, before the page can block the main thread with long
// tasks. The service worker checks this marker so it does not inject a second
// copy while the document_idle content scripts are still queued.

if (document.documentElement) {
  document.documentElement.setAttribute('data-xb-buddy-scheduled', '1');
}
