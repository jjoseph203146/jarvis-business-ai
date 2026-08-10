const JARVIS_URL = 'https://jarvis-business-ai.vercel.app/';
const JARVIS_ORIGIN_PATTERN = 'https://jarvis-business-ai.vercel.app/*';

function startListening(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      if (window.jarvisStartListening) window.jarvisStartListening();
    }
  });
}

async function openJarvisAndListen() {
  const [existingTab] = await chrome.tabs.query({ url: JARVIS_ORIGIN_PATTERN });

  if (existingTab) {
    await chrome.tabs.update(existingTab.id, { active: true });
    await chrome.windows.update(existingTab.windowId, { focused: true });
    startListening(existingTab.id);
    return;
  }

  const newTab = await chrome.tabs.create({ url: JARVIS_URL });

  // Wait for the page (and its inline script) to finish loading before
  // trying to call into it, since a brand-new tab starts at status "loading".
  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId !== newTab.id || info.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(listener);
    startListening(tabId);
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-jarvis') openJarvisAndListen();
});

// Opens a dashboard URL requested by the JARVIS page (see content.js).
// Extensions can create/position windows without a click-triggered popup
// exception, so this is what makes "open Stripe" work with no manual click.
async function openDashboard(url) {
  try {
    const displays = await chrome.system.display.getInfo();
    const secondary = displays.find(d => !d.isPrimary) || (displays.length > 1 ? displays[1] : null);

    if (secondary) {
      const { left, top, width, height } = secondary.workArea;
      await chrome.windows.create({ url, left, top, width, height, type: 'normal' });
      return;
    }
  } catch (error) {
    console.warn('JARVIS: display info unavailable, opening a normal tab', error);
  }

  chrome.tabs.create({ url });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'open-dashboard' && message.url) {
    openDashboard(message.url);
  }
});
