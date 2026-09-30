import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentProps,
} from 'react';

// A sheet whose code, and Motion with it, stays out of the screen's first
// load (Today's waterfall). It is fetched once the browser is idle, so the
// first tap does not wait for it, and mounted on first open; it then stays
// mounted, so closing still animates out.

const load = () => import('./sheet.tsx');
const Sheet = lazy(() => load().then((module) => ({ default: module.Sheet })));

function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 3000 });
    return () => {
      cancelIdleCallback(id);
    };
  }
  const id = setTimeout(run, 1000);
  return () => {
    clearTimeout(id);
  };
}

export function LazySheet(props: ComponentProps<typeof Sheet>) {
  const [opened, setOpened] = useState(props.open);
  if (props.open && !opened) setOpened(true);
  useEffect(
    () =>
      whenIdle(() => {
        // The sheet, and the Motion features it animates with.
        void load();
        void import('./features.ts');
      }),
    [],
  );
  if (!opened) return null;
  return (
    <Suspense fallback={null}>
      <Sheet {...props} />
    </Suspense>
  );
}
