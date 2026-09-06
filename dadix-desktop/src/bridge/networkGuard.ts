import { callApi } from "./callApi";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

declare global {
  interface Window {
    __dadixPathname: () => string;
    __dadixAssignHref: (value: string) => void;
    __dadixDesktopGuards?: boolean;
  }
}

function isBlockedBrowserUrl(url: string) {
  return /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

export function shouldBridgeHttp(url: string) {
  return (
    /api\.dadix\.net|localhost:6127|localhost:6128|127\.0\.0\.1:6127|127\.0\.0\.1:6128/i.test(url) ||
    /\/(record|table|view|column|project|user|tag|ai|api|auth)\b/.test(url)
  );
}

export function dadixPathname() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash ? hash.split("?")[0] || "/" : "/";
}

export function dadixAssignHref(value: unknown) {
  const href = String(value ?? "");
  if (!href || isBlockedBrowserUrl(href)) return;
  if (href.startsWith("#")) {
    window.location.hash = href;
    return;
  }
  if (href.startsWith("/") && !href.startsWith("//")) {
    const path = href.startsWith("/index.html")
      ? `${dadixPathname()}${href.slice(href.indexOf("?"))}`
      : href;
    window.location.hash = path.startsWith("#") ? path : `#${path}`;
    return;
  }
}

function installLocationHelpers() {
  window.__dadixPathname = dadixPathname;
  window.__dadixAssignHref = dadixAssignHref;
  try {
    const hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, "href");
    if (hrefDesc?.get && hrefDesc?.set) {
      Object.defineProperty(window.location, "href", {
        configurable: true,
        get() {
          return hrefDesc.get!.call(window.location);
        },
        set(value: string) {
          if (typeof value === "string" && (value.startsWith("/") || value.startsWith("#") || isBlockedBrowserUrl(value))) {
            dadixAssignHref(value);
            return;
          }
          hrefDesc.set!.call(window.location, value);
        },
      });
    }
    Object.defineProperty(window.location, "pathname", {
      configurable: true,
      get() {
        return dadixPathname();
      },
    });
  } catch {
    /* location is sealed on some webviews — Vite rewrite uses __dadixPathname */
  }
}

function installFetchGuard() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (shouldBridgeHttp(url)) {
      let data: unknown;
      if (init?.body) {
        try {
          data = JSON.parse(String(init.body));
        } catch {
          data = init.body;
        }
      }
      try {
        const result = await callApi(url.replace(/^https?:\/\/[^/]+/, ""), {
          method: method as Method,
          data,
        });
        if (url.includes("/record/all") && Array.isArray(result.data)) {
          const chunk = `${JSON.stringify(result.data)}--end-data-chunk--`;
          return new Response(chunk, { status: result.status });
        }
        return new Response(JSON.stringify(result.data), {
          status: result.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ message, error: message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    if (isBlockedBrowserUrl(url)) {
      return new Response(JSON.stringify({ message: "LOCAL_ONLY" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };
}

function installXhrGuard() {
  const Original = window.XMLHttpRequest;
  function BridgedXHR(this: XMLHttpRequest) {
    const xhr = new Original();
    let method = "GET";
    let url = "";
    const open = xhr.open.bind(xhr);
    xhr.open = ((m: string, u: string | URL, async?: boolean, user?: string | null, password?: string | null) => {
      method = m;
      url = String(u);
      return open(m, u, async ?? true, user, password);
    }) as XMLHttpRequest["open"];
    const send = xhr.send.bind(xhr);
    xhr.send = ((body?: Document | XMLHttpRequestBodyInit | null) => {
      if (!shouldBridgeHttp(url)) {
        return send(body);
      }
      void (async () => {
        let data: unknown;
        if (typeof body === "string") {
          try {
            data = JSON.parse(body);
          } catch {
            data = body;
          }
        }
        try {
          const result = await callApi(url.replace(/^https?:\/\/[^/]+/, ""), {
            method: method.toUpperCase() as Method,
            data,
          });
          const text = JSON.stringify(result.data);
          Object.defineProperty(xhr, "readyState", { configurable: true, value: 4 });
          Object.defineProperty(xhr, "status", { configurable: true, value: result.status });
          Object.defineProperty(xhr, "statusText", { configurable: true, value: result.statusText });
          Object.defineProperty(xhr, "responseText", { configurable: true, value: text });
          Object.defineProperty(xhr, "response", { configurable: true, value: text });
          xhr.dispatchEvent(new Event("readystatechange"));
          xhr.onreadystatechange?.(new Event("readystatechange"));
          xhr.dispatchEvent(new Event("load"));
          xhr.onload?.(new ProgressEvent("load"));
          xhr.dispatchEvent(new Event("loadend"));
          xhr.onloadend?.(new ProgressEvent("loadend"));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const text = JSON.stringify({ message, error: message });
          Object.defineProperty(xhr, "readyState", { configurable: true, value: 4 });
          Object.defineProperty(xhr, "status", { configurable: true, value: 400 });
          Object.defineProperty(xhr, "statusText", { configurable: true, value: "Bad Request" });
          Object.defineProperty(xhr, "responseText", { configurable: true, value: text });
          Object.defineProperty(xhr, "response", { configurable: true, value: text });
          xhr.dispatchEvent(new Event("readystatechange"));
          xhr.onreadystatechange?.(new Event("readystatechange"));
          xhr.dispatchEvent(new Event("load"));
          xhr.onload?.(new ProgressEvent("load"));
          xhr.dispatchEvent(new Event("loadend"));
          xhr.onloadend?.(new ProgressEvent("loadend"));
        }
      })();
    }) as XMLHttpRequest["send"];
    return xhr;
  }
  BridgedXHR.prototype = Original.prototype;
  window.XMLHttpRequest = BridgedXHR as unknown as typeof XMLHttpRequest;
}

function installOpenGuard() {
  const originalOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url == null ? "" : String(url);
    if (isBlockedBrowserUrl(href)) return null;
    if (!href || href.startsWith("#") || href.startsWith("/")) return null;
    const opener = (
      window as Window & {
        __dadixOpenExternalUrl?: (value: string) => void | Promise<void>;
      }
    ).__dadixOpenExternalUrl;
    if (opener) {
      void opener(href);
      return null;
    }
    return originalOpen(url, target, features);
  }) as typeof window.open;
}

export function installDesktopGuards() {
  if (window.__dadixDesktopGuards) return;
  window.__dadixDesktopGuards = true;
  installLocationHelpers();
  installFetchGuard();
  installXhrGuard();
  installOpenGuard();
}
