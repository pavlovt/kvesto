import { httpStorage, localStorageStorage } from "@kvesto/core";

/**
 * Storage is configuration. Set VITE_KVESTO_API (e.g. http://localhost:3000)
 * to use the Kvesto server; leave it unset to keep everything in this browser.
 */
const api = import.meta.env.VITE_KVESTO_API as string | undefined;
/** Admin key for a server started with KVESTO_API_KEYS. */
const apiKey = import.meta.env.VITE_KVESTO_API_KEY as string | undefined;

export const storage = api
  ? httpStorage({ baseUrl: api, ...(apiKey ? { headers: { authorization: `Bearer ${apiKey}` } } : {}) })
  : localStorageStorage();
export const storageLabel = api ? `API at ${api}` : "this browser (localStorage)";
