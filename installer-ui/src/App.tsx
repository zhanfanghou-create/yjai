import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { InstallerWindow } from "./components/InstallerWindow";
import { StepSidebar } from "./components/StepSidebar";
import { Welcome } from "./pages/Welcome";
import { License } from "./pages/License";
import { InstallMode } from "./pages/InstallMode";
import { Directory } from "./pages/Directory";
import { Installing } from "./pages/Installing";
import { Finish } from "./pages/Finish";
import type { StepKey } from "./steps";

const DEFAULT_PATH_WIN = "C:\\Users\\<user>\\AppData\\Local\\Programs\\艺镜AI-正式版";

export default function App() {
  const [step, setStep] = useState<StepKey>("welcome");
  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [targetPath, setTargetPath] = useState<string>(DEFAULT_PATH_WIN);
  const [meta, setMeta] = useState<{ version: string; licenseText: string; defaultPath: string } | null>(null);
  const [installResult, setInstallResult] = useState<{ ok: boolean; reason?: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (!window.installer) return;
      const m = await window.installer.getMeta();
      setMeta({ version: m.version, licenseText: m.licenseText, defaultPath: m.defaultPath });
      setTargetPath(m.defaultPath);
    })();
  }, []);

  return (
    <InstallerWindow onClose={() => window.installer?.quit()} onMinimize={() => window.installer?.minimize()}>
      <StepSidebar current={step} />
      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <div key="welcome" className="absolute inset-0">
              <Welcome
                version={meta?.version || "1.1.0"}
                onNext={() => setStep("license")}
              />
            </div>
          )}
          {step === "license" && (
            <div key="license" className="absolute inset-0">
              <License
                version={meta?.version || "1.1.0"}
                licenseText={meta?.licenseText}
                onBack={() => setStep("welcome")}
                onNext={() => setStep("mode")}
              />
            </div>
          )}
          {step === "mode" && (
            <div key="mode" className="absolute inset-0">
              <InstallMode
                defaultPath={meta?.defaultPath || targetPath}
                onBack={() => setStep("license")}
                onNext={(m) => {
                  setMode(m);
                  if (m === "quick") {
                    setTargetPath(meta?.defaultPath || targetPath);
                    setStep("installing");
                  } else {
                    setStep("directory");
                  }
                }}
              />
            </div>
          )}
          {step === "directory" && (
            <div key="directory" className="absolute inset-0">
              <Directory
                value={targetPath}
                onBack={() => setStep("mode")}
                onNext={(p) => { setTargetPath(p); setStep("installing"); }}
              />
            </div>
          )}
          {step === "installing" && (
            <div key="installing" className="absolute inset-0">
              <Installing
                targetPath={targetPath}
                onDone={(res) => { setInstallResult(res); setStep("finish"); }}
              />
            </div>
          )}
          {step === "finish" && (
            <div key="finish" className="absolute inset-0">
              <Finish
                version={meta?.version || "1.1.0"}
                targetPath={targetPath}
                result={installResult}
                onLaunch={() => window.installer?.launchApp(targetPath).then(() => window.installer?.quit())}
                onOpenDir={() => window.installer?.openPath(targetPath)}
                onClose={() => window.installer?.quit()}
              />
            </div>
          )}
        </AnimatePresence>
      </main>
    </InstallerWindow>
  );
}