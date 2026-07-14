import {
  CalendarDays,
  Clock3,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";
import SystemStatus from "../../../components/Dashboard/SystemStatus";

const WelcomeCard = () => {
  const now = new Date();

  const currentDate = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const currentTime = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-700 rounded-2xl shadow-xl px-8 py-6 text-white">

      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-6">

        {/* Left Section */}
        <div className="flex-1">

          <h1 className="text-3xl font-bold">
            Welcome
          </h1>

          <h2 className="text-xl font-semibold mt-2">
            iFluids Engineering Project Management Dashboard
          </h2>

          <p className="text-blue-100 mt-3 max-w-3xl text-sm leading-6">
            Monitor project execution, commercial performance,
            billing, profitability and operational status.
          </p>

          {/* Status */}
          <div className="flex flex-wrap gap-8 mt-6">

            <SystemStatus status="Online" />

            <div className="flex items-center gap-3">

              <CalendarDays
                size={18}
                className="text-yellow-300"
              />

              <div>

                <p className="text-[11px] uppercase tracking-wider text-blue-200">
                  Today
                </p>

                <p className="font-semibold text-sm">
                  {currentDate}
                </p>

              </div>

            </div>

            <div className="flex items-center gap-3">

              <Clock3
                size={18}
                className="text-cyan-300"
              />

              <div>

                <p className="text-[11px] uppercase tracking-wider text-blue-200">
                  Last Updated
                </p>

                <p className="font-semibold text-sm">
                  {currentTime}
                </p>

              </div>

            </div>

          </div>

        </div>

        {/* Right Section */}
        <div className="flex justify-end">

          <Link
            to="/projects/add"
            className="
              flex
              items-center
              gap-2
              bg-blue-600
              hover:bg-blue-700
              px-6
              py-3
              rounded-xl
              font-semibold
              shadow-lg
              transition
            "
          >
            <Plus size={18} />

            Add Project

          </Link>

        </div>

      </div>

    </div>
  );
};

export default WelcomeCard;