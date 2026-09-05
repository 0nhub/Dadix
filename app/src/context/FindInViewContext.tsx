'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface FindInViewContextValue {
  findQuery: string;
  setFindQuery: (_q: string) => void;
  matchCount: number;
  currentMatchIndex: number;
  setMatchCount: (_n: number) => void;
  setCurrentMatchIndex: (_n: number | ((_prev: number) => number)) => void;
  onPrevRef: React.MutableRefObject<(() => void) | null>;
  onNextRef: React.MutableRefObject<(() => void) | null>;
}

const FindInViewContext = createContext<FindInViewContextValue | null>(null);

export function FindInViewProvider({ children }: { children: React.ReactNode }) {
  const [findQuery, setFindQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndexState] = useState(0);
  const setCurrentMatchIndex = useCallback((n: number | ((prev: number) => number)) => {
    setCurrentMatchIndexState((prev) => (typeof n === 'function' ? n(prev) : n));
  }, []);
  const onPrevRef = useRef<(() => void) | null>(null);
  const onNextRef = useRef<(() => void) | null>(null);

  const value: FindInViewContextValue = {
    findQuery,
    setFindQuery,
    matchCount,
    currentMatchIndex,
    setMatchCount,
    setCurrentMatchIndex,
    onPrevRef,
    onNextRef,
  };

  return (
    <FindInViewContext.Provider value={value}>
      {children}
    </FindInViewContext.Provider>
  );
}

export function useFindInView() {
  const ctx = useContext(FindInViewContext);
  return ctx;
}

export function useFindInViewOptional() {
  return useContext(FindInViewContext);
}
