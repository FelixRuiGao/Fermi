import React, { useState } from "react";
import { rpcRequest } from "../vscode-api.js";
import { IconSparkle } from "./icons.js";

export function BinaryNotFound() {
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await rpcRequest("__ext.installFermi");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="state-view">
      <IconSparkle size={22} style={{ color: "var(--f-accent)" }} />
      <h2>Welcome to Fermi</h2>
      <p>Fermi isn't installed on this machine yet. Install it with one click to get started.</p>
      <button className="primary-btn" onClick={handleInstall} disabled={installing}>
        {installing ? "Installing…" : "Install Fermi"}
      </button>
      <p className="hint">
        Downloads the latest release to <code>~/.fermi/bin</code>
      </p>
    </div>
  );
}

export function ErrorView({ message }: { message: string }) {
  return (
    <div className="state-view">
      <h2>Something went wrong</h2>
      <p>{message}</p>
    </div>
  );
}

export function LoadingView() {
  return (
    <div className="state-view">
      <p>Connecting to Fermi…</p>
    </div>
  );
}
