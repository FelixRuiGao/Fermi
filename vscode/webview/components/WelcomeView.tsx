import React from "react";

export function BinaryNotFound() {
  return (
    <div className="welcome">
      <h2>Fermi Not Found</h2>
      <p>
        The <code>fermi</code> binary was not found on this machine.
        Install it first, then reopen this panel.
      </p>
      <pre style={{ fontSize: "0.85em", opacity: 0.8, textAlign: "left" }}>
        curl -fsSL https://fermi.sh/install | sh
      </pre>
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
