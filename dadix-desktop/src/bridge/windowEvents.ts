import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { dadixEvents } from "@/constants/events";

const CHANNEL = "dadix-window-event";
const AUX_COMMAND = "dadix-aux-command";
const REMOTE_FLAG = "__dadixFromWindow";

type WindowEventPayload = {
  name: string;
  detail: unknown;
  source: string;
};

function collectEventNames(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      collectEventNames(child, out);
    }
  }
  return out;
}

function cloneDetail(detail: unknown): unknown {
  if (detail == null || typeof detail !== "object") return detail ?? null;
  try {
    return JSON.parse(JSON.stringify(detail));
  } catch {
    return null;
  }
}

function currentLabel() {
  try {
    return getCurrentWindow().label;
  } catch {
    return "window";
  }
}

export async function dispatchInAuxWindow(name: string, detail?: unknown) {
  await emit(AUX_COMMAND, { name, detail: detail ?? {} });
}

export function installWindowEventBridge() {
  const source = currentLabel();
  const names = [...new Set(collectEventNames(dadixEvents))];

  const onLocal = (name: string) => (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail && typeof detail === "object" && REMOTE_FLAG in detail) return;
    void emit(CHANNEL, { name, detail: cloneDetail(detail), source }).catch(() => undefined);
  };

  const cleanup = names.map((name) => {
    const handler = onLocal(name);
    window.addEventListener(name, handler);
    return () => window.removeEventListener(name, handler);
  });

  const unlistenEvents = listen<WindowEventPayload>(CHANNEL, (event) => {
    const payload = event.payload;
    if (!payload?.name || payload.source === source) return;
    const detail =
      payload.detail && typeof payload.detail === "object"
        ? { ...(payload.detail as Record<string, unknown>), [REMOTE_FLAG]: payload.source }
        : payload.detail == null
          ? { [REMOTE_FLAG]: payload.source }
          : { value: payload.detail, [REMOTE_FLAG]: payload.source };
    window.dispatchEvent(new CustomEvent(payload.name, { detail }));
  });

  const unlistenCommand = source.startsWith("aux-")
    ? listen<{ name?: string; detail?: unknown }>(AUX_COMMAND, (event) => {
        const name = event.payload?.name;
        if (!name) return;
        window.dispatchEvent(
          new CustomEvent(name, {
            detail: event.payload.detail ?? {},
          })
        );
      })
    : Promise.resolve(() => undefined);

  return () => {
    cleanup.forEach((off) => off());
    void unlistenEvents.then((fn) => fn());
    void unlistenCommand.then((fn) => fn());
  };
}
