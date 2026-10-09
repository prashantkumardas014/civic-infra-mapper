/* Resolves the backend base URL.
   - Local dev (localhost / 127.0.0.1 / file://): uses the local backend at :3000
   - Production (Vercel, custom domain, etc.): uses the deployed Render backend
*/
window.CIVIC_API_BASE = (() => {
  if (window.CIVIC_API_BASE) return window.CIVIC_API_BASE;
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || protocol === 'file:') {
    return 'http://localhost:3000';
  }
  return 'https://civic-infra-mapper.onrender.com';
})();