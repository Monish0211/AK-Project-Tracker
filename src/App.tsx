import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import AddProjectPreviewApp from "./preview/AddProject/AddProjectPreviewApp";
import PreviewEntryHint from "./preview/AddProject/PreviewEntryHint";

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* Temporary Add Project wizard redesign preview — isolated, does not affect the production page below */}
        <Route path="/preview/projects/add" element={<AddProjectPreviewApp />} />
        <Route path="/*" element={<MainLayout />} />
      </Routes>
      <PreviewEntryHint />
    </BrowserRouter>
  );
}

export default App;
