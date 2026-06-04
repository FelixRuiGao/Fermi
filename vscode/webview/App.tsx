import React, { useEffect } from "react";
import { useStore } from "./store.js";
import { notifyReady } from "./vscode-api.js";
import { HeaderBar } from "./components/HeaderBar.js";
import { Transcript } from "./components/Transcript.js";
import { InputArea } from "./components/InputArea.js";
import { AskPanel } from "./components/AskPanel.js";
// StatusInfo removed — model + context are in InputArea's meta row
import { InitWizard } from "./components/InitWizard.js";
import { BinaryNotFound, ErrorView, LoadingView } from "./components/WelcomeView.js";

export function App() {
  const mode = useStore((s) => s.mode);
  const errorMessage = useStore((s) => s.errorMessage);
  const initialize = useStore((s) => s.initialize);

  useEffect(() => {
    initialize();
    notifyReady();
  }, []);

  if (mode === "loading") return <LoadingView />;
  if (mode === "binary-not-found") return <BinaryNotFound />;
  if (mode === "error") return <ErrorView message={errorMessage ?? "Unknown error"} />;
  if (mode === "init") return <InitWizard />;

  return (
    <>
      <HeaderBar />
      <Transcript />
      <AskPanel />
      <InputArea />
    </>
  );
}
