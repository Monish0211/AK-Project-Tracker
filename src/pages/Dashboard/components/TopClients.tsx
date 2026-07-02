import { Trophy } from "lucide-react";
import { getTopClients } from "../../../services/dashboardService";

const TopClients = () => {
  const clients = getTopClients();

  return (
    <div className="bg-white rounded-2xl shadow-md p-6">

      {/* Header */}

      <div className="flex justify-between items-center mb-6">

        <h2 className="text-xl font-semibold">
          Top Clients
        </h2>

        <Trophy
          size={22}
          className="text-yellow-500"
        />

      </div>

      {clients.length === 0 ? (

        <div className="h-64 flex items-center justify-center text-gray-500">
          No Client Data
        </div>

      ) : (

        <div className="space-y-4">

          {clients.map((client, index) => (

            <div
              key={client.client}
              className="flex justify-between items-center border-b pb-3 last:border-none"
            >

              <div className="flex items-center gap-3">

                <div
                  className="
                    w-8
                    h-8
                    rounded-full
                    bg-blue-100
                    text-blue-700
                    flex
                    items-center
                    justify-center
                    font-semibold
                  "
                >
                  {index + 1}
                </div>

                <div>

                  <p className="font-medium text-slate-800">
                    {client.client}
                  </p>

                  <p className="text-xs text-gray-500">
                    Work Order Value
                  </p>

                </div>

              </div>

              <span className="font-semibold text-green-700">
                ₹{" "}
                {client.value.toLocaleString("en-IN")}
              </span>

            </div>

          ))}

        </div>

      )}

      <button
        className="
          w-full
          mt-8
          py-2
          rounded-xl
          bg-blue-50
          text-blue-600
          font-semibold
          hover:bg-blue-100
          transition
        "
      >
        View All Clients →
      </button>

    </div>
  );
};

export default TopClients;