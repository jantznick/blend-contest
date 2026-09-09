import { HardwareArmProvider } from "./context/HardwareArmContext";
import { ContestPage } from "./components/ContestPage";
import "./contest.css";
import "./dj-booth.css";
import "./dj-mobile.css";

export default function App() {
  return (
    <HardwareArmProvider>
      <ContestPage />
    </HardwareArmProvider>
  );
}
