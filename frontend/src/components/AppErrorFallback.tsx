import { isLazyChunkError } from "../utils/lazyChunkRecovery";

/**
 * Fallback of the root error boundary (main.tsx). Ordinary errors show exactly what they always did. A lazy-chunk fetch failure that the one-time
 * automatic reload (utils/lazyChunkRecovery.ts) could not cure — typically a deployment that replaced the page's files, or a lost connection —
 * gets a clear message and a manual Reload button, so the user is never left on a dead page and nothing reloads in a loop.
 */
export function AppErrorFallback({ error }: { error: unknown }) {
  if (!isLazyChunkError(error)) return <p>Something went wrong.</p>;
  return (
    <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-base font-semibold">This page could not be loaded.</p>
      <p className="text-sm max-w-md">The portal may have just been updated, or the connection was lost. Reload the page to get the latest version.</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        Reload page
      </button>
    </div>
  );
}

export default AppErrorFallback;
