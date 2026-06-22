// Background service worker for Liem gDesign Chrome Extension

// Create context menu item on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "get-design",
    title: "Get Design",
    contexts: ["page", "selection", "link", "image"]
  });
});

// Listen for context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "get-design") {
    if (chrome.action && chrome.action.openPopup) {
      // Programmatically open the action popup (Supported in Chrome 127+)
      chrome.action.openPopup().catch((err) => {
        console.error("Failed to open popup programmatically:", err);
      });
    } else {
      console.warn("chrome.action.openPopup is not supported in this Chrome version.");
      // Fallback: Notify user to click the toolbar extension icon
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          alert("Liem gDesign: Please click the extension icon in the toolbar to view the extracted design.");
        }
      }).catch((err) => {
        console.error("Failed to run alert fallback:", err);
      });
    }
  }
});
