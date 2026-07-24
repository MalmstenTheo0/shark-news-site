/* Applies the stored theme before first paint, so switching never flashes.
   Loaded synchronously in <head> — a separate file rather than an inline
   script so the strict CSP does not need 'unsafe-inline'. */

(function () {
  "use strict";
  try {
    var stored = window.localStorage.getItem("shark-news-theme");
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (error) {
    /* Private mode or storage disabled: fall back to the light default. */
  }
})();
