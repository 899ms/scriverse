import { createMobileOfflineApi } from "/mobile-offline-api.js?v=20260922-mobile-offline-api-v1";
import { createMobileSyncClient } from "/mobile-sync-client.js?v=20260922-mobile-sync-client-v2";
import { MobileSyncStore } from "/mobile-sync-store.js?v=20260922-mobile-sync-store-v1";

const MOBILE_QUERY_KEY = "scriverseMobile";
const MOBILE_SESSION_KEY = "scriverse.mobile.session.v1";
const MOBILE_PROFILE_KEY = "scriverse.mobile.profile.v1";
const SYNC_PROTOCOL = { min: 1, max: 1 };
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MOBILE_LAUNCHER_URL = "https://localhost/?scriverseMobileLauncher=1&changeServer=1";

function isNativeMobileShell() {
  try { return globalThis.Capacitor?.isNativePlatform?.() === true; } catch { return false; }
}

function storageValue(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function writeStorageValue(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* 存储不可用时保留当前运行状态 */ }
}

function readJson(storage, key) {
  const raw = storageValue(storage, key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function newUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeUser(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isUuid(value.userId)) return null;
  return structuredClone(value);
}

function offlineSessionFromRecord(record) {
  const user = normalizeUser(record?.user);
  if (!user) return null;
  return {
    authenticated: true,
    user,
    csrfToken: null,
    registrationMode: record.registrationMode === "invite" || record.registrationMode === "open"
      ? record.registrationMode
      : "disabled",
    setupRequired: false,
    setupTokenRequired: false,
    bootId: "mobile-offline",
    offline: true
  };
}

export function isMobileAppRuntime(locationRef = globalThis.location) {
  try {
    return new URL(locationRef?.href ?? "https://scriverse.invalid/").searchParams.get(MOBILE_QUERY_KEY) === "1";
  } catch {
    return false;
  }
}

export function mobileOfflineHealth() {
  return {
    status: "ok",
    version: "mobile-offline",
    syncProtocol: SYNC_PROTOCOL,
    development: false
  };
}

export class MobileOfflineRuntime {
  constructor({
    fetchImpl = globalThis.fetch,
    locationRef = globalThis.location,
    storage = globalThis.localStorage
  } = {}) {
    this.fetchImpl = typeof fetchImpl === "function" ? fetchImpl.bind(globalThis) : null;
    this.location = locationRef;
    this.storage = storage;
    this.enabled = isMobileAppRuntime(locationRef);
    this.offline = false;
    this.session = null;
    this.csrfToken = null;
    this.profileId = this.readProfileId();
    this.store = null;
    this.client = null;
    this.api = null;
    this.clientPromise = null;
    this.onlineHandler = () => { void this.reconnect(); };
    if (this.enabled) {
      globalThis.addEventListener?.("online", this.onlineHandler);
      this.registerServiceWorker();
      this.installUi();
    }
  }

  readProfileId() {
    const stored = storageValue(this.storage, MOBILE_PROFILE_KEY);
    if (isUuid(stored)) return stored;
    const profileId = newUuid();
    writeStorageValue(this.storage, MOBILE_PROFILE_KEY, profileId);
    return profileId;
  }

  cachedSession() {
    return offlineSessionFromRecord(readJson(this.storage, MOBILE_SESSION_KEY));
  }

  async getOfflineSession() {
    if (!this.enabled) return null;
    const session = this.cachedSession();
    if (!session) return null;
    await this.activateOffline(session);
    return session;
  }

  setSession(session) {
    if (!this.enabled || session?.authenticated !== true) return;
    const user = normalizeUser(session.user);
    if (!user) return;
    if (this.session?.user?.userId && this.session.user.userId !== user.userId) {
      this.disposeClient();
    }
    this.session = { ...session, user };
    this.csrfToken = typeof session.csrfToken === "string" ? session.csrfToken : null;
    writeStorageValue(this.storage, MOBILE_SESSION_KEY, JSON.stringify({
      user,
      registrationMode: session.registrationMode,
      updatedAt: new Date().toISOString()
    }));
    void this.ensureClient();
  }

  async activateOffline(session = this.cachedSession()) {
    if (!this.enabled || !session?.user?.userId) return null;
    this.offline = true;
    this.setSession(session);
    await this.ensureClient();
    this.dispatchState("offline");
    return session;
  }

  async ensureClient() {
    if (!this.enabled || !this.session?.user?.userId) return null;
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = (async () => {
      if (!this.store || this.store.userId !== this.session.user.userId) {
        this.disposeClient();
        this.store = new MobileSyncStore({ profileId: this.profileId, userId: this.session.user.userId });
        await this.store.open();
        await this.store.recoverSyncing();
      }
      if (!this.client) {
        this.client = await createMobileSyncClient({
          user: this.session.user,
          store: this.store,
          csrfToken: () => this.csrfToken,
          fetchImpl: this.fetchImpl ?? globalThis.fetch
        });
        this.api = createMobileOfflineApi({ store: this.store, client: this.client });
        if (!this.offline && globalThis.navigator?.onLine !== false) {
          void this.client.syncAll().catch((error) => this.dispatchState("sync-failed", null, error));
        }
      }
      return this.client;
    })().finally(() => {
      this.clientPromise = null;
    });
    return this.clientPromise;
  }

  disposeClient() {
    this.client?.dispose?.();
    this.client = null;
    this.api = null;
    this.store?.close?.();
    this.store = null;
  }

  async request(path, options = {}) {
    if (!this.offline) return null;
    await this.ensureClient();
    if (path === "/api/health") return mobileOfflineHealth();
    if (path === "/api/ui-settings") return { toastPosition: "bottom-right", pageSizes: {}, galaxyFrameRate: 30 };
    if (!this.api) throw new Error("手机端离线数据库不可用");
    return this.api.request(path, options);
  }

  async requestOnline(path, options = {}) {
    if (!this.fetchImpl) throw new Error("当前环境不支持网络请求");
    const method = String(options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers ?? {});
    headers.set("Accept", "application/json");
    let body = options.body;
    if (body !== undefined && !(body instanceof FormData) && typeof body !== "string") {
      body = JSON.stringify(body);
      headers.set("Content-Type", "application/json");
    }
    if (body instanceof FormData) headers.delete("Content-Type");
    if (!SAFE_METHODS.has(method) && this.csrfToken) headers.set("X-CSRF-Token", this.csrfToken);
    const response = await this.fetchImpl(path, {
      ...options,
      method,
      headers,
      body,
      credentials: "include",
      redirect: "error",
      cache: "no-store"
    });
    let payload = null;
    if (response.status !== 204) payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message ?? `请求失败：${response.status}`);
      error.code = payload?.error?.code ?? `MOBILE_HTTP_${response.status}`;
      error.status = response.status;
      throw error;
    }
    return payload?.data ?? null;
  }

  async syncAll() {
    await this.ensureClient();
    if (!this.client || this.offline || globalThis.navigator?.onLine === false) return [];
    return this.client.syncAll();
  }

  async downloadWork(work) {
    if (this.offline) throw new Error("当前处于离线状态，请恢复连接后下载作品");
    await this.ensureClient();
    if (!this.client) throw new Error("手机端离线数据库不可用");
    const result = await this.client.downloadWork(work);
    this.dispatchState("downloaded", work.id);
    return result;
  }

  async syncWork(workId) {
    if (this.offline) throw new Error("当前处于离线状态，请恢复连接后同步");
    await this.ensureClient();
    if (!this.client) throw new Error("手机端离线数据库不可用");
    const result = await this.client.syncWork(workId);
    this.dispatchState("synced", workId);
    return result;
  }

  openServerSelector() {
    if (!isNativeMobileShell() || !this.location?.assign) return;
    this.location.assign(MOBILE_LAUNCHER_URL);
  }

  async aggregateStatus() {
    await this.ensureClient();
    if (!this.store) return { works: 0, pendingMutations: 0, conflicts: 0, rejected: 0 };
    const works = await this.store.listWorks();
    const summaries = await Promise.all(works.map((work) => this.store.statusSummary(work.workId)));
    return summaries.reduce((total, summary) => ({
      works: total.works + 1,
      pendingMutations: total.pendingMutations + summary.pending + summary.syncing,
      conflicts: total.conflicts + summary.conflicts,
      rejected: total.rejected + summary.rejected
    }), { works: 0, pendingMutations: 0, conflicts: 0, rejected: 0 });
  }

  async reconnect() {
    if (!this.enabled || !this.offline || globalThis.navigator?.onLine === false) return;
    try {
      const session = await this.requestOnline("/api/auth/session");
      if (session?.authenticated !== true || session.user?.userId !== this.session?.user?.userId) return;
      this.offline = false;
      this.setSession(session);
      await this.syncAll();
      const status = await this.aggregateStatus();
      this.dispatchState(status.conflicts > 0 || status.rejected > 0 ? "attention" : "online");
      if (status.conflicts === 0 && status.rejected === 0 && this.location?.reload) this.location.reload();
    } catch {
      this.offline = true;
      this.dispatchState("offline");
    }
  }

  dispatchState(status, workId = null, error = null) {
    globalThis.dispatchEvent?.(new CustomEvent("scriverse-mobile-sync-state", {
      detail: { status, workId, errorCode: error?.code ?? null }
    }));
    void this.updateUi();
  }

  registerServiceWorker() {
    if (!globalThis.navigator?.serviceWorker?.register) return;
    void globalThis.navigator.serviceWorker.register("/mobile-service-worker.js?v=20260922-mobile-service-worker-v1", { scope: "/" })
      .catch((error) => console.warn("Mobile service worker registration failed", error));
  }

  installUi() {
    const install = () => {
      const host = document.querySelector(".top-actions");
      if (!host || document.querySelector("#mobile-offline-button")) return;
      if (isNativeMobileShell()) {
        const serverButton = document.createElement("button");
        serverButton.id = "mobile-server-button";
        serverButton.className = "topbar-icon-button mobile-server-button";
        serverButton.type = "button";
        serverButton.textContent = "Server";
        serverButton.setAttribute("aria-label", "切换 Server");
        serverButton.title = "切换 Server";
        serverButton.addEventListener("click", () => this.openServerSelector());
        host.insertBefore(serverButton, host.querySelector("#theme-toggle") ?? null);
      }
      const button = document.createElement("button");
      button.id = "mobile-offline-button";
      button.className = "topbar-icon-button mobile-offline-button";
      button.type = "button";
      button.textContent = "离线";
      button.setAttribute("aria-label", "离线同步");
      button.title = "离线同步";
      button.addEventListener("click", () => { void this.openSyncDialog(); });
      host.insertBefore(button, host.querySelector("#theme-toggle") ?? null);
      this.ensureSyncDialog();
      void this.updateUi();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }

  ensureSyncDialog() {
    if (document.querySelector("#mobile-offline-dialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "mobile-offline-dialog";
    dialog.className = "dialog editor-dialog mobile-offline-dialog";
    dialog.setAttribute("aria-labelledby", "mobile-offline-title");
    const form = document.createElement("form");
    form.method = "dialog";
    form.className = "mobile-offline-dialog-form";
    const header = document.createElement("div");
    header.className = "dialog-header";
    const heading = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "手机端同步";
    const title = document.createElement("h2");
    title.id = "mobile-offline-title";
    title.textContent = "离线作品";
    const meta = document.createElement("p");
    meta.id = "mobile-offline-meta";
    meta.className = "dialog-header-meta";
    heading.append(eyebrow, title, meta);
    const close = document.createElement("button");
    close.className = "dialog-close";
    close.type = "submit";
    close.setAttribute("aria-label", "关闭离线同步");
    close.textContent = "×";
    header.append(heading, close);
    const content = document.createElement("div");
    content.id = "mobile-offline-content";
    content.className = "mobile-offline-content";
    form.append(header, content);
    dialog.append(form);
    document.body.append(dialog);
  }

  async openSyncDialog() {
    this.ensureSyncDialog();
    const dialog = document.querySelector("#mobile-offline-dialog");
    if (!(dialog instanceof HTMLDialogElement)) return;
    const content = dialog.querySelector("#mobile-offline-content");
    const meta = dialog.querySelector("#mobile-offline-meta");
    content.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "empty-copy";
    loading.textContent = "正在读取云端作品……";
    content.append(loading);
    if (!dialog.open) dialog.showModal();
    try {
      const works = this.offline
        ? (await this.store?.listWorks?.() ?? []).map((work) => ({ id: work.workId, title: work.title, offlineAccessEnabled: true }))
        : await this.loadOnlineWorks();
      const cached = new Map((await this.store?.listWorks?.() ?? []).map((work) => [work.workId, work]));
      meta.textContent = this.offline ? "当前无网络，已下载的作品仍可编辑；恢复连接后会自动同步。" : "下载获得离线编辑能力；手机端不创建本地工作区。";
      content.replaceChildren();
      if (works.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-copy";
        empty.textContent = "暂无可用作品";
        content.append(empty);
        return;
      }
      for (const work of works) content.append(this.createWorkRow(work, cached.get(work.id)));
    } catch (error) {
      content.replaceChildren();
      const failure = document.createElement("p");
      failure.className = "empty-copy";
      failure.textContent = error instanceof Error ? error.message : "离线同步信息读取失败";
      content.append(failure);
    }
  }

  async loadOnlineWorks() {
    const result = await this.requestOnline("/api/works?page=1&limit=100");
    return Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : [];
  }

  createWorkRow(work, cached) {
    const row = document.createElement("article");
    row.className = "mobile-offline-work-row settings-card";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = String(work.title ?? "未命名作品");
    const status = document.createElement("small");
    status.textContent = cached ? "已保存离线副本" : work.offlineAccessEnabled === true ? "可下载离线副本" : "所有者尚未允许离线访问";
    copy.append(title, status);
    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (!cached && work.offlineAccessEnabled === true && !this.offline) {
      const download = document.createElement("button");
      download.className = "primary-button";
      download.type = "button";
      download.textContent = "下载副本";
      download.addEventListener("click", async () => {
        download.disabled = true;
        try {
          await this.downloadWork(work);
          await this.openSyncDialog();
        } catch (error) {
          download.disabled = false;
          status.textContent = error instanceof Error ? error.message : "下载失败";
        }
      });
      actions.append(download);
    }
    if (cached) {
      const sync = document.createElement("button");
      sync.className = "ghost-button";
      sync.type = "button";
      sync.textContent = this.offline ? "等待联网" : "立即同步";
      sync.disabled = this.offline;
      sync.addEventListener("click", async () => {
        sync.disabled = true;
        try {
          await this.syncWork(work.id);
          await this.openSyncDialog();
        } catch (error) {
          sync.disabled = false;
          status.textContent = error instanceof Error ? error.message : "同步失败";
        }
      });
      actions.append(sync);
    }
    row.append(copy, actions);
    return row;
  }

  async updateUi() {
    const button = document.querySelector("#mobile-offline-button");
    if (!(button instanceof HTMLButtonElement)) return;
    const summary = await this.aggregateStatus();
    const label = this.offline
      ? summary.pendingMutations + summary.conflicts + summary.rejected > 0
        ? `待同步 ${summary.pendingMutations + summary.conflicts + summary.rejected}`
        : "离线"
      : summary.pendingMutations + summary.conflicts + summary.rejected > 0
        ? `同步 ${summary.pendingMutations + summary.conflicts + summary.rejected}`
        : "离线";
    button.textContent = label;
    button.title = this.offline ? "当前处于离线编辑模式" : "下载作品并管理离线同步";
    button.setAttribute("aria-label", button.title);
    button.dataset.status = summary.conflicts > 0 || summary.rejected > 0 ? "attention" : this.offline ? "offline" : "ready";
  }

  dispose() {
    globalThis.removeEventListener?.("online", this.onlineHandler);
    this.disposeClient();
  }
}

export const mobileOfflineRuntime = new MobileOfflineRuntime();
globalThis.scriverseMobileOfflineRuntime = mobileOfflineRuntime;
