/* Resolves the backend base URL. */
window.CIVIC_API_BASE = (() => {
  if (window.CIVIC_API_BASE) return window.CIVIC_API_BASE;
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || protocol === 'file:') {
    return 'http://localhost:3000';
  }
  return '';
})();
