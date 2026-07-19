import { useState, useCallback, useRef } from 'react';

// Small undo/redo history over an immutable draft state. Every `set` pushes a
// snapshot; undo/redo walk the stack (capped so a long editing session can't
// grow unbounded).
export function useHistory<T>(initial: T, cap = 50) {
  const [state, setState] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, bump] = useState(0);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => {
      past.current.push(prev);
      if (past.current.length > cap) past.current.shift();
      future.current = [];
      bump((n) => n + 1);
      return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    });
  }, [cap]);

  const undo = useCallback(() => {
    setState((prev) => {
      const last = past.current.pop();
      if (last === undefined) return prev;
      future.current.push(prev);
      bump((n) => n + 1);
      return last;
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      const next = future.current.pop();
      if (next === undefined) return prev;
      past.current.push(prev);
      bump((n) => n + 1);
      return next;
    });
  }, []);

  const reset = useCallback((value: T) => {
    past.current = [];
    future.current = [];
    setState(value);
    bump((n) => n + 1);
  }, []);

  return { state, set, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
