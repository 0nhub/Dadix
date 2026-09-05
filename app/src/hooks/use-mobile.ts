import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * True only for real touch/phone layouts.
 * Narrow desktop Safari/Chrome windows must NOT switch to the mobile Sheet
 * (that made sidebar bars huge and broke click navigation).
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const widthQuery = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
    );
    const coarseQuery = window.matchMedia('(pointer: coarse)');

    const update = () => {
      setIsMobile(widthQuery.matches && coarseQuery.matches);
    };

    update();
    widthQuery.addEventListener('change', update);
    coarseQuery.addEventListener('change', update);
    return () => {
      widthQuery.removeEventListener('change', update);
      coarseQuery.removeEventListener('change', update);
    };
  }, []);

  return isMobile;
}
