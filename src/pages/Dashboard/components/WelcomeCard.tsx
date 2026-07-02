import {
  CalendarDays,
  Clock3,
  UserCircle2,
} from "lucide-react";

const WelcomeCard = () => {
  const now = new Date();

  const formattedDate = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const formattedTime = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 rounded-3xl shadow-xl p-8 text-white">

      <div className="flex justify-between items-center">

        {/* Left Side */}
        <div>

          <h1 className="text-4xl font-bold">
            Welcome back, Administrator 👋
          </h1>

          <p className="mt-3 text-blue-100 text-lg">
            Engineering Project Management & Operations Dashboard
          </p>

          <div className="flex gap-8 mt-6">

            <div className="flex items-center gap-2">

              <CalendarDays size={20} />

              <span className="text-blue-100">
                {formattedDate}
              </span>

            </div>

            <div className="flex items-center gap-2">

              <Clock3 size={20} />

              <span className="text-blue-100">
                {formattedTime}
              </span>

            </div>

          </div>

        </div>

        {/* Right Side */}
        <div className="text-center">

          <UserCircle2
            size={75}
            className="mx-auto mb-3"
          />

          <h2 className="text-2xl font-semibold">
            Administrator
          </h2>

          <p className="text-blue-100">
            PMO Team
          </p>

        </div>

      </div>

    </div>
  );
};

export default WelcomeCard;