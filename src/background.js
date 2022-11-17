// Param values from https://developer.mozilla.org/Add-ons/WebExtensions/API/contextualIdentities/create
const AMAZON_CONTAINER_DETAILS = {
  name: "Amazon",
  color: "orange",
  icon: "briefcase"
};

const AMAZON_NATIONAL_DOMAINS = [
  "amazon.cn",
  "amazon.in",
  "amazon.co.jp",
  "amazon.com.sg",
  "amazon.com.tr",
  "amazon.fr",
  "amazon.de",
  "amazon.it",
  "amazon.nl",
  "amazon.es",
  "amazon.co.uk",
  "amazon.ca",
  "amazon.com.mx",
  "amazon.com.au",
  "amazon.com.br",
  "amazon.ae",
  "amazon.se",
  "amazon.sg",
  "amazon.com.be",
  "amazon.eg"
];

const AMAZON_TLD_DOMAINS = [
  "amazon.clothing",
  "amazon.com",
  "amazon.company",
  "amazon.cruises",
  "amazon.dog",
  "amazon.energy",
  "amazon.express",
  "amazon.fund",
  "amazon.game",
  "amazon.gd",
  "amazon.gent",
  "amazon.hockey",
  "amazon.international",
  "amazon.jobs",
  "amazon.kiwi",
  "amazon.ltda",
  "amazon.press",
  "amazon.re",
  "amazon.salon",
  "amazon.shopping",
  "amazon.soccer",
  "amazon.tickets",
  "amazon.tienda",
  "amazon.tours",
  "amazon.training",
  "amazon.tv",
  "amazon.wiki"
];

const AUDIBLE_DOMAINS = [
  "audible.com",
  "audible.co.uk",
  "audible.fr",
  "audible.com.au",
  "audible.de",
  "audible.it",
  "audible.ca",
  "audible.in",
  "audible.co.jp"
];

const WHOLEFOODS_DOMAINS = [
  "wholefoodsmarket.com",
  "wholefoodsmarket.co.uk"
];

const AMAZON_SERVICES_DOMAINS = [
  "aboutamazon.com",
  "alexa.com",
  "amazoninspire.com",
  "amazonpay.in",
  "amazonteam.org",
  "amzn.to",
  "awscloud.com",
  "awsevents.com",
  "primevideo.com",
  "twitch.com",
  "twitch.tv",
  "ext-twitch.tv"
];

let AMAZON_DOMAINS = [
  "6pm.com",
  "abebooks.com",
  "acx.com",
  "bookdepository.com",
  "boxofficemojo.com",
  "comixology.com",
  "createspace.com",
  "dpreview.com",
  "eastdane.com",
  "fabric.com",
  "goodreads.com",
  "imdb.com",
  "junglee.com",
  "lab126.com",
  "mturk.com",
  "seattlespheres.com",
  "shopbop.com",
  "souq.com",
  "tenmarks.com",
  "withoutabox.com",
  "woot.com",
  "zappos.com"
];

AMAZON_DOMAINS = AMAZON_DOMAINS.concat(
  AMAZON_NATIONAL_DOMAINS, 
  AMAZON_TLD_DOMAINS, 
  AUDIBLE_DOMAINS,
  WHOLEFOODS_DOMAINS,
  AMAZON_SERVICES_DOMAINS
);

const MAC_ADDON_ID = "@testpilot-containers";

let macAddonEnabled = false;
let amazonCookieStoreId = null;

const canceledRequests = {};
const tabsWaitingToLoad = {};
const tabStates = {};

const amazonHostREs = [];

async function isMACAddonEnabled () {
  try {
    const macAddonInfo = await browser.management.get(MAC_ADDON_ID);
    if (macAddonInfo.enabled) {
      sendJailedDomainsToMAC();
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

async function setupMACAddonListeners () {
  browser.runtime.onMessageExternal.addListener((message, sender) => {
    if (sender.id !== "@testpilot-containers") {
      return;
    }
    switch (message.method) {
    case "MACListening":
      sendJailedDomainsToMAC();
      break;
    }
  });
  function disabledExtension (info) {
    if (info.id === MAC_ADDON_ID) {
      macAddonEnabled = false;
    }
  }
  function enabledExtension (info) {
    if (info.id === MAC_ADDON_ID) {
      macAddonEnabled = true;
    }
  }
  browser.management.onInstalled.addListener(enabledExtension);
  browser.management.onEnabled.addListener(enabledExtension);
  browser.management.onUninstalled.addListener(disabledExtension);
  browser.management.onDisabled.addListener(disabledExtension);
}

async function sendJailedDomainsToMAC () {
  try {
    return await browser.runtime.sendMessage(MAC_ADDON_ID, {
      method: "jailedDomains",
      urls: AMAZON_DOMAINS.map((domain) => {
        return `https://${domain}/`;
      })
    });
  } catch (e) {
    // We likely might want to handle this case: https...
    return false;
  }
}

async function getMACAssignment (url) {
  if (!macAddonEnabled) {
    return false;
  }

  try {
    const assignment = await browser.runtime.sendMessage(MAC_ADDON_ID, {
      method: "getAssignment",
      url
    });
    return assignment;
  } catch (e) {
    return false;
  }
}

function cancelRequest (tab, options) {
  // we decided to cancel the request at this point, register canceled request
  canceledRequests[tab.id] = {
    requestIds: {
      [options.requestId]: true
    },
    urls: {
      [options.url]: true
    }
  };

  // since webRequest onCompleted and onErrorOccurred are not 100% reliable
  // we register a timer here to cleanup canceled requests, just to make sure we don't
  // end up in a situation where certain urls in a tab.id stay canceled
  setTimeout(() => {
    if (canceledRequests[tab.id]) {
      delete canceledRequests[tab.id];
    }
  }, 2000);
}

function shouldCancelEarly (tab, options) {
  // we decided to cancel the request at this point
  if (!canceledRequests[tab.id]) {
    cancelRequest(tab, options);
  } else {
    let cancelEarly = false;
    if (canceledRequests[tab.id].requestIds[options.requestId] ||
        canceledRequests[tab.id].urls[options.url]) {
      // same requestId or url from the same tab
      // this is a redirect that we have to cancel early to prevent opening two tabs
      cancelEarly = true;
    }
    // register this requestId and url as canceled too
    canceledRequests[tab.id].requestIds[options.requestId] = true;
    canceledRequests[tab.id].urls[options.url] = true;
    if (cancelEarly) {
      return true;
    }
  }
  return false;
}

function generateAmazonHostREs () {
  for (let amazonDomain of AMAZON_DOMAINS) {
    amazonHostREs.push(new RegExp(`^(.*\\.)?${amazonDomain}$`));
  }
}

async function clearAmazonCookies () {
  // Clear all amazon cookies
  const containers = await browser.contextualIdentities.query({});
  containers.push({
    cookieStoreId: "firefox-default"
  });

  let macAssignments = [];
  if (macAddonEnabled) {
    const promises = AMAZON_DOMAINS.map(async amazonDomain => {
      const assigned = await getMACAssignment(`https://${amazonDomain}/`);
      return assigned ? amazonDomain : null;
    });
    macAssignments = await Promise.all(promises);
  }

  AMAZON_DOMAINS.map(async amazonDomain => {
    const amazonCookieUrl = `https://${amazonDomain}/`;

    // dont clear cookies for amazonDomain if mac assigned (with or without www.)
    if (macAddonEnabled &&
        (macAssignments.includes(amazonDomain) ||
         macAssignments.includes(`www.${amazonDomain}`))) {
      return;
    }

    containers.map(async container => {
      const storeId = container.cookieStoreId;
      if (storeId === amazonCookieStoreId) {
        // Don't clear cookies in the Amazon Container
        return;
      }

      const cookies = await browser.cookies.getAll({
        domain: amazonDomain,
        storeId
      });

      cookies.map(cookie => {
        browser.cookies.remove({
          name: cookie.name,
          url: amazonCookieUrl,
          storeId
        });
      });
      // Also clear Service Workers as it breaks detecting onBeforeRequest
      await browser.browsingData.remove({hostnames: [amazonDomain]}, {serviceWorkers: true});
    });
  });
}

async function setupContainer () {
  // Use existing Amazon container, or create one

  const info = await browser.runtime.getBrowserInfo();
  if (parseInt(info.version) < 67) {
    AMAZON_CONTAINER_DETAILS.color = "orange";
    AMAZON_CONTAINER_DETIALS.color = "briefcase";
  }

  const contexts = await browser.contextualIdentities.query({name: AMAZON_CONTAINER_DETAILS.name});
  if (contexts.length > 0) {
    const amazonContext = contexts[0];
    amazonCookieStoreId = amazonContext.cookieStoreId;
    if (amazonContext.color !== AMAZON_CONTAINER_DETAILS.color ||
        amazonContext.icon !== AMAZON_CONTAINER_DETAILS.icon) {
          await browser.contextualIdentities.update(
            amazonCookieStoreId,
            { color: AMAZON_CONTAINER_DETAILS.color, icon: AMAZON_CONTAINER_DETAILS.icon }
          );
    }
  } else {
    const context = await browser.contextualIdentities.create(AMAZON_CONTAINER_DETAILS);
    amazonCookieStoreId = context.cookieStoreId;
  }

  const azcStorage = await browser.storage.local.get();
  if (!azcStorage.domainsAddedToAmazonContainer) {
    await browser.storage.local.set({ "domainsAddedToAmazonContainer": [] });
  }
}

async function maybeReopenTab(url, tab, request) {
  const macAssigned = await getMACAssignment(url);
  if (macAssigned) {
    return;
  }

  const cookieStoreId = await shouldContainInto(url, tab);
  if (!cookieStoreId) {
    return;
  }

  if (request && shouldCancelEarly(tab, request)) {
    return { cancel: true };
  }

  await browser.tabs.create({
    url,
    cookieStoreId,
    active: tab.active,
    index: tab.index,
    windowId: tab.windowId
  });

  browser.tabs.remove(tab.id);

  return { cancel: true };
}

function isAmazonURL (url) {
  const parsedUrl = new URL(url);
  for (let amazonHostRE of amazonHostREs) {
    if (amazonHostRE.test(parsedUrl.host)) {
      return true;
    }
  }
  return false;
}

async function supportsSiteSubdomainCheck(url) {
  // No subdomains to check at this time
  return;
}

async function addDomainToAmazonContainer (url) {
  const parsedUrl = new URL(url);
  const azcStorage = await browser.storage.local.get();
  azcStorage.domainsAddedToAmazonContainer.push(parsedUrl.host);
  await browser.storage.local.set({"domainsAddedToAmazonContainer": azcStorage.domainsAddedToAmazonContainer});
  await supportSiteSubdomainCheck(parsedUrl.host);
}

async function removeDomainFromAmazonContainer (domain) {
  const azcStorage = await browser.storage.local.get();
  const domainIndex = azcStorage.domainsAddedToAmazonContainer.indexOf(domain);
  azcStorage.domainsAddedToAmazonContainer.splice(domainIndex, 1);
  await browser.storage.local.set({"domainsAddedToAmazonContainer": azcStorage.domainsAddedToAmazonContainer});
}

async function isAddedToAmazonContainer (url) {
  const parsedUrl = new URL(url);
  const azcStorage = await browser.storage.local.get();
  if (azcStorage.domainsAddedToAmazonContainer.includes(parsedUrl.host)) {
    return true;
  }
  return false;
}

async function shouldContainInto (url, tab) {
  if (!url.startsWith("http")) {
    // we only handle URLs starting with http(s)
    return false;
  }

  const hasBeenAddedToAmazonContainer = await isAddedToAmazonContainer(url);

  if (isAmazonURL(url) || hasBeenAddedToAmazonContainer) {
    if (tab.cookieStoreId !== amazonCookieStoreId) {
      // Amazon-URL outside of Amazon Container Tab
      // Should contain into Amazon Container
      return amazonCookieStoreId;
    }
  } else if (tab.cookieStoreId === amazonCookieStoreId) {
    // Non-Amazon-URL inside Amazon Container Tab
    // Should contain into Default Container
    return "firefox-default";
  }

  return false;
}

async function maybeReopenAlreadyOpenTabs () {
  const tabsOnUpdated = (tabId, changeInfo, tab) => {
    if (changeInfo.url && tabsWaitingToLoad[tabId]) {
      // Tab we're waiting for switched it's url, maybe we reopen
      delete tabsWaitingToLoad[tabId];
      maybeReopenTab(tab.url, tab);
    }
    if (tab.status === "complete" && tabsWaitingToLoad[tabId]) {
      // Tab we're waiting for completed loading
      delete tabsWaitingToLoad[tabId];
    }
    if (!Object.keys(tabsWaitingToLoad).length) {
      // We're done waiting for tabs to load, remove event listener
      browser.tabs.onUpdated.removeListener(tabsOnUpdated);
    }
  };

  // Query for already open Tabs
  const tabs = await browser.tabs.query({});
  tabs.map(async tab => {
    if (tab.url === "about:blank") {
      if (tab.status !== "loading") {
        return;
      }
      // about:blank Tab is still loading, so we indicate that we wait for it to load
      // and register the event listener if we haven't yet.
      //
      // This is a workaround until platform support is implemented:
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1447551
      // https...
      tabsWaitingToLoad[tab.id] = true;
      if (!browser.tabs.onUpdated.hasListener(tabsOnUpdated)) {
        browser.tabs.onUpdated.addListener(tabsOnUpdated);
      }
    } else {
      // Tab already has an url, maybe we reopen
      maybeReopenTab(tab.url, tab);
    }
  });
}

function stripAzclid(url) {
  const strippedUrl = new URL(url);
  strippedUrl.searchParams.delete("azclid");
  return strippedUrl.href;
}

async function getActiveTab () {
  const [activeTab] = await browser.tabs.query({currentWindow: true, active: true});
  return activeTab;
}

async function windowFocusChangedListener (windowId) {
  if (windowId !== browser.windows.WINDOW_ID_NONE) {
    const activeTab = await getActiveTab();
    updateBrowserActionIcon(activeTab);
  }
}

function tabUpdateListener (tabId, changeInfo, tab) {
  updateBrowserActionIcon(tab);
}

async function updateBrowserActionIcon (tab) {

  browser.browserAction.setBadgeText({text: ""});

  const url = tab.url;
  const hasBeenAddedToAmazonContainer = await isAddedToAmazonContainer(url);

  if (isAmazonURL(url)) {
    browser.storage.local.set({"CURRENT_PANEL": "on-amazon"});
    browser.browserAction.setPopup({tabId: tab.id, popup: "./panel.html"});
  } else if (hasBeenAddedToAmazonContainer) {
    browser.storage.local.set({"CURRENT_PANEL": "in-azc"});
  } else {
    const tabState = tabStates[tab.id];
    const panelToShow = (tabState && tabState.trackersDetected) ? "trackers-detected" : "no-trackers";
    browser.storage.local.set({"CURRENT_PANEL": panelToShow});
    browser.browserAction.setPopup({tabId: tab.id, popup: "./panel.html"});
    browser.browserAction.setBadgeBackgroundColor({color: "#A44D00"});
    if ( panelToShow === "trackers-detected" ) {
      browser.browserAction.setBadgeText({text: "!"});
    }
  }
}

async function containAmazon (request) {
  if (tabsWaitingToLoad[request.tabId]) {
    // Cleanup just to make sure we don't get a race-condition with startup reopening
    delete tabsWaitingToLoad[request.tabId];
  }

  const tab = await browser.tabs.get(request.tabId);

  updateBrowserActionIcon(tab);

  const url = new URL(request.url);
  const urlSearchParm = new URLSearchParams(url.search);
  if (urlSearchParm.has("azclid")) {
    return {redirectUrl: stripAzclid(request.url)};
  }
  // Listen to requests and open Amazon into its Container,
  // open other sites into the default tab context
  if (request.tabId === -1) {
    // Request doesn't belong to a tab
    return;
  }

  return maybeReopenTab(request.url, tab, request);
}

// Lots of this is borrowed from old blok code:
// https://github.com/mozilla/blok/blob/master/src/js/background.js
async function blockAmazonSubResources (requestDetails) {
  if (requestDetails.type === "main_frame") {
    return {};
  }

  if (typeof requestDetails.originUrl === "undefined") {
    return {};
  }

  const urlIsAmazon = isAmazonURL(requestDetails.url);
  const originUrlIsAmazon = isAmazonURL(requestDetails.originUrl);

  if (!urlIsAmazon) {
    return {};
  }

  if (originUrlIsAmazon) {
    const message = {msg: "amazon-domain"};
    // Send the message to the content_script
    browser.tabs.sendMessage(requestDetails.tabId, message);
    return {};
  }

  const hasBeenAddedToAmazonContainer = await isAddedToAmazonContainer(requestDetails.originUrl);

  if (urlIsAmazon && !originUrlIsAmazon) {
    if (!hasBeenAddedToAmazonContainer ) {
      const message = {msg: "blocked-amazon-subresources"};
      // Send the message to the content_script
      browser.tabs.sendMessage(requestDetails.tabId, message);

      tabStates[requestDetails.tabId] = { trackersDetected: true };
      return {cancel: true};
    } else {
      const message = {msg: "allowed-amazon-subresources"};
      // Send the message to the content_script
      browser.tabs.sendMessage(requestDetails.tabId, message);
      return {};
    }
  }
  return {};
}

function setupWebRequestListeners() {
  browser.webRequest.onCompleted.addListener((options) => {
    if (canceledRequests[options.tabId]) {
      delete canceledRequests[options.tabId];
    }
  },{urls: ["<all_urls>"], types: ["main_frame"]});
  browser.webRequest.onErrorOccurred.addListener((options) => {
    if (canceledRequests[options.tabId]) {
      delete canceledRequests[options.tabId];
    }
  },{urls: ["<all_urls>"], types: ["main_frame"]});

  // Add the main_frame request listener
  browser.webRequest.onBeforeRequest.addListener(containAmazon, {urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"]);

  // Add the sub-resource request listener
  browser.webRequest.onBeforeRequest.addListener(blockAmazonSubResources, {urls: ["<all_urls>"]}, ["blocking"]);
}

function setupWindowsAndTabsListeners() {
  browser.tabs.onUpdated.addListener(tabUpdateListener);
  browser.tabs.onRemoved.addListener(tabId => delete tabStates[tabId] );
  browser.windows.onFocusChanged.addListener(windowFocusChangedListener);
}

(async function init () {
  await setupMACAddonListeners();
  macAddonEnabled = await isMACAddonEnabled();

  try {
    await setupContainer();
  } catch (error) {
    // TODO: Needs backup strategy
    // See ...
    // Sometimes this add-on is installed but doesn't get a amazonCookieStoreId ?
    // eslint-disable-next-line no-console
    console.log(error);
    return;
  }
  clearAmazonCookies();
  generateAmazonHostREs();
  setupWebRequestListeners();
  setupWindowsAndTabsListeners();

  browser.runtime.onMessage.addListener( (message, {url}) => {
    if (message === "what-sites-are-added") {
      return browser.storage.local.get().then(azcStorage => azcStorage.domainsAddedToAmazonContainer);
    } else if (message.removeDomain) {
      removeDomainFromAmazonContainer(message.removeDomain).then( results => results );
    } else {
      addDomainToAmazonContainer(url).then( results => results);
    }
  });

  maybeReopenAlreadyOpenTabs();

  const activeTab = await getActiveTab();
  updateBrowserActionIcon(activeTab);
})();
