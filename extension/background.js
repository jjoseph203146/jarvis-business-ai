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
