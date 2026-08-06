import { useEffect, useRef } from 'react'

// Guarantees a socket-style subscription is registered inside useEffect and its
// unsubscribe function is returned for cleanup. In React StrictMode dev mode,
// effects run twice (mount -> cleanup -> mount); if a consumer fails to return
// the unsubscribe, the callback is registered twice and terminal input/output
// events double-fire. Routing every subscription through this hook makes the
// cleanup structural instead of convention-based.
export default function useSocketEvent<T>(
  subscribe: (cb: (data: T) => void) => () => void,
  handler: (data: T) => void,
  deps: readonly unknown[],
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const unsub = subscribe((data: T) => handlerRef.current(data))
    return () => {
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}