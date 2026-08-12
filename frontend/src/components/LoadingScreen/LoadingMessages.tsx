import { useEffect, useState } from "react";

const MESSAGES = [
  "Initializing Engineering Workspace...",
  "Loading Project Intelligence...",
  "Connecting Secure Database...",
  "Preparing PMO Dashboard...",
  "Synchronizing Project Repository...",
  "Loading Commercial Module...",
  "Loading Quantity Management...",
  "Loading Engineering Resources...",
  "Verifying User Permissions...",
  "Preparing Enterprise Environment...",
];

/** Fisher-Yates — shuffled once per mount so messages don't repeat in the same order every load. */
function shuffled(items: string[]): string[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface LoadingMessagesProps {
  reducedMotion: boolean;
}

export default function LoadingMessages({ reducedMotion }: LoadingMessagesProps) {
  const [order] = useState(() => shuffled(MESSAGES));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setIndex((i) => (i + 1) % order.length);
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [order.length]);

  return (
    <div className="h-6 flex items-center justify-center overflow-hidden">
      <p
        key={index}
        className={`text-xs sm:text-sm font-semibold text-blue-700 dark:text-cyan-200 tracking-wide ${
          reducedMotion ? "" : "ls-fade-slide-up"
        }`}
      >
        {order[index]}
      </p>
    </div>
  );
}
