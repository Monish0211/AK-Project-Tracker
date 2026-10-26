// Test double for src/components/ui/usePmoToast.ts — the real provider needs a DOM (document); SSR rendering only needs the hook shape.
export const usePmoToast = () => ({ showToast: () => undefined, dismissToast: () => undefined });
