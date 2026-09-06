import {
  useNavigate,
  useLocation,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";

function currentHashPath() {
  const helper = (window as Window & { __dadixPathname?: () => string }).__dadixPathname;
  if (helper) return helper();
  const hash = window.location.hash.replace(/^#/, "");
  return hash ? hash.split("?")[0] || "/" : "/";
}

function desktopHref(href: string) {
  if (href.startsWith("/?") || href.startsWith("?") || /^\/index\.html(\?|$)/.test(href) || href === "/") {
    const current = currentHashPath();
    if (href === "/") return current || "/dashboard";
    const query = href.includes("?") ? href.slice(href.indexOf("?")) : href.startsWith("?") ? href : "";
    return `${current}${query.startsWith("?") ? query : query ? `?${query}` : ""}`;
  }
  return href;
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => navigate(desktopHref(href)),
    replace: (href: string) => navigate(desktopHref(href), { replace: true }),
    back: () => navigate(-1),
    prefetch: async () => undefined,
    refresh: () => undefined,
  };
}

export function usePathname() {
  return useLocation().pathname;
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>() {
  return useRouterParams() as T;
}

export function useSearchParams() {
  const [params] = useRouterSearchParams();
  return params;
}

export function redirect(href: string) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(href)) return;
  if (href.startsWith("/")) {
    window.location.hash = `#${href}`;
    return;
  }
  window.location.hash = href.startsWith("#") ? href : `#${href}`;
}

export function notFound() {
  throw new Error("not found");
}
