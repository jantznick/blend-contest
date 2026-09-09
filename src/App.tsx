import { HardwareArmProvider } from "./context/HardwareArmContext";
import { ContestPage } from "./components/ContestPage";
import "./contest.css";

export default function App() {
  return (
    <HardwareArmProvider>
      <ContestPage />
    </HardwareArmProvider>
  );
}
