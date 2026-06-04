import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import styles from "./styles/index.css";

const styleEl = document.createElement("style");
styleEl.textContent = styles;
document.head.appendChild(styleEl);

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
