import { BrowserRouter } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <MainLayout />
    </BrowserRouter>
  );
}

export default App;