interface SystemStatusProps {
  status: "Online" | "Offline" | "Maintenance";
}

const COLOR_MAP = {
  Online: {
    stroke: "#22C55E",
    bgClass: "text-green-400",
  },
  Maintenance: {
    stroke: "#F59E0B",
    bgClass: "text-amber-400",
  },
  Offline: {
    stroke: "#EF4444",
    bgClass: "text-red-400",
  },
};

const SystemStatus = ({ status }: SystemStatusProps) => {
  const { stroke, bgClass } = COLOR_MAP[status] || COLOR_MAP.Online;

  return (
    <div className="flex items-center gap-3">
      {/* Heartbeat Animation Container (Wider than square for realistic ECG scan) */}
      <div className={`relative h-7 w-12 flex items-center justify-center ${bgClass}`}>
        <svg
          viewBox="0 0 48 32"
          className="h-full w-full"
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Background trace line */}
          <path
            d="M 2 16 L 16 16 L 18 14 L 20 16 L 22 16 L 23 18 L 25 4 L 27 28 L 28 16 L 30 16 L 32 13 L 34 16 L 46 16"
            className="opacity-20"
            strokeWidth="2.0"
          />
          {/* Animated glow line */}
          <path
            d="M 2 16 L 16 16 L 18 14 L 20 16 L 22 16 L 23 18 L 25 4 L 27 28 L 28 16 L 30 16 L 32 13 L 34 16 L 46 16"
            className="animate-ecg-heartbeat opacity-40"
            strokeWidth="6.0"
          />
          {/* Main animated sharp line */}
          <path
            d="M 2 16 L 16 16 L 18 14 L 20 16 L 22 16 L 23 18 L 25 4 L 27 28 L 28 16 L 30 16 L 32 13 L 34 16 L 46 16"
            className="animate-ecg-heartbeat"
            strokeWidth="3.0"
          />
        </svg>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-blue-200">
          System Status
        </p>
        <p className="font-semibold text-sm">
          {status}
        </p>
      </div>
    </div>
  );
};

export default SystemStatus;
