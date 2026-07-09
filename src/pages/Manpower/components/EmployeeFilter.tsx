import { Search } from "lucide-react";

interface Props {
  search: string;
  setSearch: (value: string) => void;
}

const EmployeeFilter = ({
  search,
  setSearch,
}: Props) => {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5">

      <div className="relative">

        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
        />

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Employee No, Name, Designation, Department, Manager, Location, Grade..."
          className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

      </div>

    </div>
  );
};

export default EmployeeFilter;