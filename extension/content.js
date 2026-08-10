// Lets the JARVIS page know the extension is installed, and relays its
// "open this dashboard" requests to the background service worker — which
// can open/position a tab without the popup-blocker restrictions a plain
// webpage runs into.
document.documentElement.setAttribute('data-jarvis-extension', 'true');

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== 'jarvis-open-dashboard' || !data.url) return;
  chrome.runtime.sendMessage({ type: 'open-dashboard', url: data.url });
});
