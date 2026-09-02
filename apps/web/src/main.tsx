import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";

import { AppShell } from "./app-shell";
import "./lib/i18n";
import "@radix-ui/themes/styles.css";
import "./styles.css";

function getRoomId(): string {
  const match = window.location.pathname.match(/^\/room\/([^/]+)/);
  return decodeURIComponent(match?.[1] ?? "demo");
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AppShell roomId={getRoomId()} />
    </MotionConfig>
  </StrictMode>,
);

requestAnimationFrame(() => document.getElementById("app-boot")?.remove());
