import React, { useState } from "react";
import { rpcRequest } from "../vscode-api.js";

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
    <div className="welcome">
      <div className="welcome-logo">✦</div>
      <h2>Welcome to Fermi</h2>
      <p>
        Fermi isn't installed on this machine yet. Install it with one click
        to get started.
      </p>
      <button className="install-btn" onClick={handleInstall} disabled={installing}>
        {installing ? "Installing…" : "Install Fermi"}
      </button>
      <p className="welcome-hint">
        Downloads the latest release to <code>~/.fermi/bin</code>
      </p>
    </div>
  );
}

export function ErrorView({ message }: { message: string }) {
  return (
    <div className="welcome">
      <h2>Error</h2>
      <p>{message}</p>
    </div>
  );
}

export function LoadingView() {
  return (
    <div className="welcome">
      <h2>Fermi</h2>
      <p>Connecting...</p>
    </div>
  );
}
