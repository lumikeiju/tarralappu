import { getAppSettings, saveAppSettings } from "../db/repo";
import { defaultAppSettings } from "../db/schema";
import type { AppSettings } from "../db/schema";

export const settings = $state<AppSettings>(defaultAppSettings());

/** In-memory only — NEVER written to IndexedDB */
export const auth = $state({ apiKey: null as string | null });

export async function initSettings(): Promise<void> {
  const stored = await getAppSettings();
  if (stored) {
    Object.assign(settings, stored);
  }
  // Restore key from storage if previously remembered
  if (settings.apiKeyRemembered) {
    const k = localStorage.getItem("tarralappu:key");
    if (k) auth.apiKey = k;
  } else {
    const k = sessionStorage.getItem("tarralappu:key");
    if (k) auth.apiKey = k;
  }
}

export function setApiKey(key: string | null, remember: boolean): void {
  auth.apiKey = key;
  settings.apiKeyRemembered = remember;
  if (remember) {
    if (key) localStorage.setItem("tarralappu:key", key);
    else localStorage.removeItem("tarralappu:key");
    sessionStorage.removeItem("tarralappu:key");
  } else {
    if (key) sessionStorage.setItem("tarralappu:key", key);
    else sessionStorage.removeItem("tarralappu:key");
    localStorage.removeItem("tarralappu:key");
  }
  void persistSettings();
}

export function clearApiKey(): void {
  setApiKey(null, false);
}

export function setTheme(theme: "light" | "dark" | null): void {
  settings.theme = theme;
  if (theme) {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
  void persistSettings();
}

export async function persistSettings(): Promise<void> {
  await saveAppSettings({ ...settings });
}
