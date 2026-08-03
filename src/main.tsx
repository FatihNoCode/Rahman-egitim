
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { applyPlatformClasses } from "./lib/native";
  import { applyStoredTheme } from "./lib/theme";
  import { installDeviceLog } from "./lib/deviceLog";

  applyPlatformClasses();
  // Before render: a dark-mode device must not get a white frame on launch.
  applyStoredTheme();
  // Installed before render so a crash during boot is captured too.
  installDeviceLog();

  createRoot(document.getElementById("root")!).render(<App />);
  