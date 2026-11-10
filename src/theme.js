'use strict';
(() => {
  const key = 'day-by-day.theme';
  const systemTheme = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let savedChoice = null;
  try { const saved = localStorage.getItem(key); if (['light', 'dark'].includes(saved)) savedChoice = saved; } catch (_) { /* The toggle also works when storage is unavailable. */ }
  let theme = savedChoice || (systemTheme?.matches ? 'dark' : 'light');
  // The tab icon matches the logo in the current theme: violet tile with a white check in light mode,
  // light violet tile with a dark check in dark mode.
  const tabIcon = (tile, check) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 38"><rect width="38" height="38" rx="10" fill="${tile}"/><svg x="6.5" y="6.5" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="${check}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg></svg>`);
  function apply(value) {
    theme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111113' : '#f7f7f8');
    document.querySelector('link[rel="icon"]')?.setAttribute('href', theme === 'dark' ? tabIcon('#b8abff', '#211848') : tabIcon('#5b4ce2', '#ffffff'));
    const button = document.getElementById('themeToggle');
    if (button) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }
  // Apply before the page is painted, so a saved dark theme opens without a light flash.
  apply(theme);
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('themeToggle');
    apply(theme);
    button.addEventListener('click', () => {
      apply(theme === 'dark' ? 'light' : 'dark');
      savedChoice = theme;
      try { localStorage.setItem(key, theme); } catch (_) { /* Keep the selection for this session. */ }
    });
  });
  systemTheme?.addEventListener?.('change', event => { if (!savedChoice) apply(event.matches ? 'dark' : 'light'); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    savedChoice = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
    apply(savedChoice || (systemTheme?.matches ? 'dark' : 'light'));
  });
})();
