'use strict';
(() => {
  const key = 'day-by-day.theme';
  const systemTheme = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let savedChoice = null;
  try { const saved = localStorage.getItem(key); if (['light', 'dark'].includes(saved)) savedChoice = saved; } catch (_) { /* The toggle also works when storage is unavailable. */ }
  let theme = savedChoice || (systemTheme?.matches ? 'dark' : 'light');
  function apply(value) {
    theme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151c19' : '#236653');
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
