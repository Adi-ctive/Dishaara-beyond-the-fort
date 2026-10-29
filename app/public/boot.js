// Only the plain home page shows the instant copy in index.html; a deep link waits for the app instead of flashing
// the home page. A file of its own: the Content-Security-Policy allows no inline scripts.
if (location.hash.length > 1 || location.pathname.length > 1 || location.search) document.getElementById('boot')?.remove();
