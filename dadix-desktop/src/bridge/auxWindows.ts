import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type AuxWindowPayload = {
  kind: string;
  title: string;
  hash: string;
};

function auxLabel(kind: string) {
  return `aux-${kind.replace(/[^a-z0-9-]/gi, "-")}`;
}

export async function openAuxWindow(payload: AuxWindowPayload) {
  const label = auxLabel(payload.kind);
  const hash = payload.hash.startsWith("#") ? payload.hash : `#${payload.hash}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.emit("dadix-aux-navigate", hash);
    await existing.setFocus();
    return;
  }
  const url = `index.html${hash}`;
  const webview = new WebviewWindow(label, {
    url,
    title: payload.title,
    width: 820,
    height: 720,
    minWidth: 520,
    minHeight: 420,
    hiddenTitle: true,
    titleBarStyle: "Overlay",
    center: true,
    focus: true,
  });
  await new Promise<void>((resolve, reject) => {
    const ok = webview.once("tauri://created", () => resolve());
    const fail = webview.once("tauri://error", (event) => {
      reject(new Error(String(event.payload ?? `Failed to open ${label} (${url})`)));
    });
    void ok;
    void fail;
    window.setTimeout(() => resolve(), 1500);
  });
}

export function installAuxWindowOpener() {
  (
    window as Window & {
      __dadixOpenAuxWindow?: (payload: AuxWindowPayload) => void;
    }
  ).__dadixOpenAuxWindow = (payload) => {
    void openAuxWindow(payload);
  };
}

export function installAuxWindowNavigation() {
  return listen<string>("dadix-aux-navigate", (event) => {
    const next = event.payload.startsWith("#") ? event.payload : `#${event.payload}`;
    if (window.location.hash !== next) {
      window.location.hash = next;
    }
  });
}

export async function notifyAuxWindowClosed(detail: Record<string, string>) {
  await emit("dadix-aux-closed", detail);
}

export function isAuxWindow() {
  try {
    return getCurrentWindow().label.startsWith("aux-");
  } catch {
    return false;
  }
}
