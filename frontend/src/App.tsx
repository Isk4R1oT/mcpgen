import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ChatPage } from "./pages/ChatPage";
import { ResultPage } from "./pages/ResultPage";
import { SandboxPage } from "./pages/SandboxPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/result/:jobId" element={<ResultPage />} />
        <Route path="/sandbox/:jobId" element={<SandboxPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
