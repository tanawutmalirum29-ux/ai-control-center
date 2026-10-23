/* Mobile-friendly top navigation. No timers, credentials, or network calls. */
(() => {
  'use strict';
  function scrollToTop() {
    window.scrollTo(0, 0);
    const root = document.scrollingElement;
    if (root) root.scrollTop = 0;
    document.body.scrollTop = 0;
  }
  function setup() {
    const topButton = document.createElement('button');
    topButton.type = 'button';
    topButton.className = 'back-to-top';
    topButton.setAttribute('aria-label', 'กลับขึ้นด้านบนสุด');
    topButton.setAttribute('title', 'กลับขึ้นด้านบนสุด');
    topButton.textContent = '↑';
    topButton.hidden = true;
    document.body.append(topButton);
    function updateVisibility() {
      topButton.hidden = (window.scrollY || document.scrollingElement?.scrollTop || 0) < 240;
    }
    topButton.addEventListener('click', scrollToTop);
    document.querySelectorAll('[data-view]').forEach(control => {
      control.addEventListener('click', () => {
        // Wait until the selected panel has changed, then reset the document scroll.
        requestAnimationFrame(() => { scrollToTop(); updateVisibility(); });
      });
    });
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('pageshow', updateVisibility);
    updateVisibility();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
