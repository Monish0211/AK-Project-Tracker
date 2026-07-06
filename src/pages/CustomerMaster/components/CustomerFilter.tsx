import { Search } from "lucide-react";

interface Props {
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
}

const CustomerFilter = ({
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
          placeholder="Search Customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="
            w-full
            pl-12
            pr-4
            py-3
            rounded-xl
            border
            border-gray-300
            focus:ring-2
            focus:ring-blue-500
            focus:border-blue-500
            outline-none
            transition
          "
        />

      </div>

    </div>
  );
};

export default CustomerFilter;