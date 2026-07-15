import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

/** Only surfaces on the real Add Project page — invisible everywhere else. */
const PreviewEntryHint = () => {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname !== "/projects/add") return null;

  return (
    <button
      onClick={() => navigate("/preview/projects/add")}
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-xl transition-transform hover:scale-105"
      title="Preview the redesigned Add Project wizard (mockup only — this page is unaffected)"
    >
      <Sparkles size={16} className="text-cyan-300" />
      Preview New Design
    </button>
  );
};

export default PreviewEntryHint;
