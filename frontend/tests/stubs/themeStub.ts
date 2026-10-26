// Test double for src/context/ThemeContext.tsx — SSR rendering only needs the hook shape (no provider, no DOM).
export const useTheme = () => ({ theme: "light", toggleTheme: () => undefined, setTheme: () => undefined });
