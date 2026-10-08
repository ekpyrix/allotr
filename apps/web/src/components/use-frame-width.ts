import { createContext, useContext } from 'react';

// The width of the nearest app frame in CSS px, provided by Frame.
export const FrameWidthContext = createContext<number | null>(null);

export function useFrameWidth(): number {
  const width = useContext(FrameWidthContext);
  if (width !== null) return width;
  return typeof window === 'undefined' ? 1024 : window.innerWidth;
}
