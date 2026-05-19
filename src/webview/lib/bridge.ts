// Wraps acquireVsCodeApi() for type-safe postMessage / state persistence.
// Must be imported by webview entry points only (not extension host).

type VsCodeApi = {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

let _api: VsCodeApi | undefined;

function api(): VsCodeApi {
  if (!_api) { _api = acquireVsCodeApi(); }
  return _api;
}

export function postMessage(msg: unknown): void {
  api().postMessage(msg);
}

type MessageHandler = (msg: unknown) => void;

export function onHostMessage(handler: MessageHandler): () => void {
  const listener = (event: MessageEvent) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export function getPersistedUi(): unknown {
  return api().getState();
}

export function setPersistedUi(state: unknown): void {
  api().setState(state);
}
