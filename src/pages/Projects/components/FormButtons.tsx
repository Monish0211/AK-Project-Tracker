const FormButtons = () => {
  return (
    <div className="flex justify-end gap-4">

      <button className="px-6 py-3 bg-gray-300 rounded-lg">
        Cancel
      </button>

      <button className="px-6 py-3 bg-blue-600 text-white rounded-lg">
        Save Project
      </button>

    </div>
  );
};

export default FormButtons;