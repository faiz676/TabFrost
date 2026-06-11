const params = new URLSearchParams(window.location.search);
const originalUrl = params.get('url');
const originalTitle = params.get('title');

// Show the original URL
if (originalUrl) {
  document.getElementById('originalUrl').textContent = originalUrl;
  document.title = `💤 ${originalTitle || originalUrl}`;
}

function restoreTab() {
  if (!originalUrl) return;

  // Show loading state immediately so user
  // knows something is happening
  const btn = document.getElementById('restoreBtn');
  const snowflake = document.querySelector('.snowflake');
  const title = document.querySelector('.title');

  btn.textContent = 'Restoring...';
  btn.style.background = '#2563eb';
  btn.style.opacity = '0.7';
  btn.style.cursor = 'wait';
  snowflake.textContent = '⏳';
  title.textContent = 'Loading tab...';

  // Small delay so the UI update renders
  // before navigation starts
  setTimeout(() => {
    window.location.href = originalUrl;
  }, 50);
}

// Restore on button click
document.getElementById('restoreBtn')
  .addEventListener('click', restoreTab);

// Restore on anywhere click
document.body.addEventListener('click', restoreTab);