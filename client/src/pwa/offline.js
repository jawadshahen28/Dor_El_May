document.getElementById('offline-retry').addEventListener('click', () => {
  if (location.pathname === '/offline.html') location.replace('/');
  else location.reload();
});
