// MSAL wrapper: public client / SPA flow, redirect-based
// (popups are unreliable on mobile browsers). msal-browser is
// loaded as a UMD script in index.html -> window.msal.

import { store } from "./store.js";
import { MS_CLIENT_ID, MS_REDIRECT_URI } from "./config.js";

const SCOPES = ["Tasks.ReadWrite", "User.Read"];

let pcaPromise = null;
let pcaInstance = null;

export function msalSettings() {
  const s = store.getSettings();
  const clientId = s?.msal?.clientId?.trim() || MS_CLIENT_ID;
  const redirectUri =
    s?.msal?.redirectUri?.trim() ||
    MS_REDIRECT_URI ||
    window.location.origin + window.location.pathname;
  return { clientId, redirectUri };
}

export function isConfigured() {
  return Boolean(msalSettings().clientId) && Boolean(window.msal);
}

function getPca() {
  if (!pcaPromise) {
    const { clientId, redirectUri } = msalSettings();
    if (!clientId) throw new Error("No Microsoft client ID configured.");
    if (!window.msal) throw new Error("MSAL library failed to load.");
    pcaPromise = (async () => {
      const pca = new window.msal.PublicClientApplication({
        auth: {
          clientId,
          authority: "https://login.microsoftonline.com/common",
          redirectUri,
        },
        cache: { cacheLocation: "localStorage" },
      });
      await pca.initialize();
      pcaInstance = pca;
      return pca;
    })();
  }
  return pcaPromise;
}

/** Call once on app start. Resolves the redirect (if returning from
 *  sign-in) and restores a cached account. Returns account or null. */
export async function initAuth() {
  if (!isConfigured()) return null;
  const pca = await getPca();
  try {
    const result = await pca.handleRedirectPromise();
    if (result?.account) pca.setActiveAccount(result.account);
  } catch (e) {
    console.warn("MSAL redirect handling failed:", e);
  }
  if (!pca.getActiveAccount()) {
    const accounts = pca.getAllAccounts();
    if (accounts.length) pca.setActiveAccount(accounts[0]);
  }
  return pca.getActiveAccount();
}

export function getAccount() {
  return pcaInstance?.getActiveAccount() ?? null;
}

export async function signIn() {
  const pca = await getPca();
  await pca.loginRedirect({ scopes: SCOPES, prompt: "select_account" });
}

export async function signOut() {
  const pca = await getPca();
  await pca.logoutRedirect({ account: pca.getActiveAccount() });
}

/** Access token for Graph; silently refreshes, falls back to a
 *  redirect (page navigates away and back). */
export async function getToken() {
  const pca = await getPca();
  const account = pca.getActiveAccount();
  if (!account) throw new Error("Not signed in.");
  try {
    const result = await pca.acquireTokenSilent({ scopes: SCOPES, account });
    return result.accessToken;
  } catch (e) {
    if (e instanceof window.msal.InteractionRequiredAuthError) {
      await pca.acquireTokenRedirect({ scopes: SCOPES, account });
      // Unreachable: the page navigates to the sign-in flow.
      return new Promise(() => {});
    }
    throw e;
  }
}
