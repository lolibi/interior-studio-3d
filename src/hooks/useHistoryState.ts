import { useCallback, useRef, useState } from 'react';

interface HistoryBuckets<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useHistoryState<T>(
  initialPresent: T,
  options?: {
    maxHistory?: number;
    coalesceMs?: number;
  }
) {
  const maxHistory = options?.maxHistory ?? 50;
  const coalesceMs = options?.coalesceMs ?? 450;

  const [history, setHistory] = useState<HistoryBuckets<T>>({
    past: [],
    present: initialPresent,
    future: [],
  });

  const lastCommitTimeRef = useRef<number>(0);

  const set = useCallback(
    (updater: T | ((prev: T) => T), forceNewStep = false) => {
      const now = Date.now();
      const shouldCoalesce =
        !forceNewStep && now - lastCommitTimeRef.current < coalesceMs;
      lastCommitTimeRef.current = now;

      setHistory((curr) => {
        const nextPresent =
          typeof updater === 'function'
            ? (updater as (prev: T) => T)(curr.present)
            : updater;

        if (Object.is(nextPresent, curr.present)) {
          return curr;
        }

        // Ако промяната е част от текущо влачене (drag), обновяваме present без нова стъпка
        if (shouldCoalesce && curr.past.length > 0) {
          return {
            past: curr.past,
            present: nextPresent,
            future: [],
          };
        }

        const nextPast = [...curr.past, curr.present];
        if (nextPast.length > maxHistory) {
          nextPast.shift();
        }

        return {
          past: nextPast,
          present: nextPresent,
          future: [],
        };
      });
    },
    [coalesceMs, maxHistory]
  );

  const undo = useCallback(() => {
    lastCommitTimeRef.current = 0;
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    lastCommitTimeRef.current = 0;
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;
      const next = curr.future[0];
      const newFuture = curr.future.slice(1);
      return {
        past: [...curr.past, curr.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  const resetHistory = useCallback((nextPresent: T) => {
    lastCommitTimeRef.current = 0;
    setHistory({
      past: [],
      present: nextPresent,
      future: [],
    });
  }, []);

  return {
    state: history.present,
    set,
    undo,
    redo,
    resetHistory,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}