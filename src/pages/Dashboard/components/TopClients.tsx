import { Trophy, ChevronDown } from "lucide-react";
import { getTopClients } from "../../../services/dashboardService";

const TopClients = () => {
  const clients = getTopClients();

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 min-h-[420px] flex flex-col">

      {/* Header */}
      <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">

        <div className="flex items-center gap-3">

          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">

            <Trophy
              size={20}
              className="text-amber-600"
            />

          </div>

          <div>

            <h2 className="text-lg font-semibold text-slate-800">
              Top Clients
            </h2>

            <p className="text-xs text-gray-500">
              Ranked by Work Order Value
            </p>

          </div>

        </div>

        <button
          className="
            flex
            items-center
            gap-1
            px-3
            py-1.5
            text-xs
            border
            border-gray-200
            rounded-lg
            hover:bg-gray-50
            transition
          "
        >
          By WO Value

          <ChevronDown size={14} />

        </button>

      </div>

      {/* Body */}

      <div className="flex-1 px-6 py-5">

        {clients.length === 0 ? (

          <div className="h-full flex items-center justify-center text-gray-400">
            No Client Data
          </div>

        ) : (

          <div className="space-y-4">

            {clients.map((client, index) => (

              <div
                key={client.client}
                className="
                  flex
                  justify-between
                  items-center
                  rounded-xl
                  px-3
                  py-3
                  hover:bg-slate-50
                  transition-all
                  duration-200
                "
              >

                <div className="flex items-center gap-3">

                  <div
                    className="
                      w-9
                      h-9
                      rounded-full
                      bg-slate-100
                      flex
                      items-center
                      justify-center
                      font-semibold
                      text-slate-700
                      text-sm
                    "
                  >
                    {index + 1}
                  </div>

                  <div>

                    <p className="font-medium text-slate-800">
                      {client.client}
                    </p>

                    <p className="text-xs text-gray-500">
                      Rank #{index + 1}
                    </p>

                  </div>

                </div>

                <div className="text-right">

                  <p className="font-bold text-slate-800">
                    ₹{" "}
                    {client.workOrderValue.toLocaleString(
                      "en-IN"
                    )}
                  </p>

                  <p className="text-xs text-green-600">
                    Work Order Value
                  </p>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

      {/* Footer */}

      <div className="px-6 pb-5 mt-auto">

        <button
          className="
            w-full
            py-3
            rounded-xl
            bg-slate-50
            border
            border-gray-200
            text-blue-600
            font-medium
            hover:bg-blue-50
            transition
          "
        >
          View All Clients
        </button>

      </div>

    </div>
  );
};

export default TopClients;