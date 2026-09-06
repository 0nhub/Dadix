import { useEffect, useRef } from 'react';

const EMPTY_DEPS: unknown[] = [];

export function useEventHandler(
  eventName: string,
  handler: (_evnt: Event) => void,
  _dependencies: unknown[] = EMPTY_DEPS
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const wrapper = (e: Event) => handlerRef.current(e);
    window.addEventListener(eventName, wrapper);
    return () => window.removeEventListener(eventName, wrapper);
  }, [eventName]);
}
