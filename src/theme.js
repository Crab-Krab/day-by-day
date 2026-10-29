'use strict';
(() => {
  const key = 'day-by-day.theme';
  let theme = 'light';
  try { if (localStorage.getItem(key) === 'dark') theme = 'dark'; } catch (_) { /* The toggle also works when storage is unavailable. */ }
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
      try { localStorage.setItem(key, theme); } catch (_) { /* Keep the selection for this session. */ }
    });
  });
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(event.newValue === 'dark' ? 'dark' : 'light'); });
})();
