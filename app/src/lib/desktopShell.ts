export function isDadixDesktopShell() {
  if (typeof document === 'undefined') return false;
  return Boolean(document.documentElement.dataset.dadixOs);
}

export function resolveExternalHref(raw: string): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
    return `mailto:${value}`;
  }
  if (/^(mailto|tel):/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (/^(www\.|[\w-]+(\.[\w-]+)+)([/:?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }
  return null;
}

export function openExternalUrl(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const href = resolveExternalHref(url);
  if (!href) return false;
  const opener = (
    window as Window & {
      __dadixOpenExternalUrl?: (href: string) => void | Promise<void>;
    }
  ).__dadixOpenExternalUrl;
  if (opener) {
    void opener(href);
    return true;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}

export function openDesktopAuxWindow(options: {
  kind: string;
  title: string;
  hash: string;
}): boolean {
  if (typeof window === 'undefined' || !isDadixDesktopShell()) return false;
  const opener = (
    window as Window & {
      __dadixOpenAuxWindow?: (payload: {
        kind: string;
        title: string;
        hash: string;
      }) => void;
    }
  ).__dadixOpenAuxWindow;
  if (!opener) return false;
  opener(options);
  return true;
}
