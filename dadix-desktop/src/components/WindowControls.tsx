import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./WindowControls.css";

function desktopOs() {
  if (typeof navigator === "undefined") return "macos";
  if (/Windows/i.test(navigator.userAgent)) return "windows";
  if (/Mac/i.test(navigator.userAgent)) return "macos";
  return "linux";
}

function isTitlebarControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "button, input, textarea, select, a, [role='button'], [role='menuitem'], [data-no-drag]"
    )
  );
}

function MacTrafficLights() {
  const [focused, setFocused] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    void win.isFocused().then(setFocused);
    const unlisten = win.onFocusChanged((event) => setFocused(event.payload));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const win = () => getCurrentWindow();

  return (
    <div className="dadix-macos-lights" aria-hidden={false}>
      <div
        className="dadix-macos-lights-cluster"
        data-no-drag
        data-focused={focused ? "true" : "false"}
        data-hovered={hovered ? "true" : "false"}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          type="button"
          aria-label="Close"
          className="dadix-macos-light dadix-macos-light-close"
          onClick={() => void win().close()}
        />
        <button
          type="button"
          aria-label="Minimize"
          className="dadix-macos-light dadix-macos-light-min"
          onClick={() => void win().minimize()}
        />
        <button
          type="button"
          aria-label="Zoom"
          className="dadix-macos-light dadix-macos-light-zoom"
          onClick={() => void win().toggleMaximize()}
        />
      </div>
    </div>
  );
}

export function WindowControls() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [os, setOs] = useState(desktopOs);

  useEffect(() => {
    const next = desktopOs();
    document.documentElement.dataset.dadixOs = next;
    setOs(next);
    const attach = () => setSlot(document.getElementById("dadix-window-controls-slot"));
    attach();
    const timer = window.setInterval(attach, 400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (os !== "macos") return;
    void invoke("dadix_pin_traffic_lights").catch(() => undefined);
  }, [os]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.closest(".dadix-app-titlebar")) return;
      if (isTitlebarControl(target)) return;
      event.preventDefault();
      void getCurrentWindow().startDragging();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  if (os === "macos") {
    return <MacTrafficLights />;
  }

  if (!slot) return null;

  const win = () => getCurrentWindow();
  return createPortal(
    <>
      <button
        type="button"
        aria-label="Minimize"
        className="flex h-full w-11 items-center justify-center border-l border-border text-foreground/70 hover:bg-foreground/8"
        onClick={() => void win().minimize()}
      >
        <span className="block h-px w-2.5 bg-current" />
      </button>
      <button
        type="button"
        aria-label="Maximize"
        className="flex h-full w-11 items-center justify-center border-l border-border text-foreground/70 hover:bg-foreground/8"
        onClick={() => void win().toggleMaximize()}
      >
        <span className="block size-2.5 border border-current" />
      </button>
      <button
        type="button"
        aria-label="Close"
        className="flex h-full w-11 items-center justify-center border-l border-border text-foreground/70 hover:bg-destructive hover:text-white"
        onClick={() => void win().close()}
      >
        <span className="relative block size-2.5">
          <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 rotate-45 bg-current" />
          <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 -rotate-45 bg-current" />
        </span>
      </button>
    </>,
    slot
  );
}
