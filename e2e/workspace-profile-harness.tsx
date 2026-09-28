import { Profiler, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { AppShell } from "../apps/web/src/app-shell";
import "../apps/web/src/lib/i18n";
import "@radix-ui/themes/styles.css";
import "../apps/web/src/styles.css";

export type WorkspaceProfile = {
  commits: { phase: string; actualDuration: number; baseDuration: number }[];
  inputFrames: number[];
};

declare global {
  interface Window {
    workspaceProfile: WorkspaceProfile;
  }
}

window.workspaceProfile = { commits: [], inputFrames: [] };
document.addEventListener("beforeinput", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest(".cm-content")) return;
  const started = performance.now();
  requestAnimationFrame(() =>
    window.workspaceProfile.inputFrames.push(performance.now() - started),
  );
});

const roomId = decodeURIComponent(window.location.pathname.split("/")[2]);
createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <Profiler
        id="workspace"
        onRender={(_id, phase, actualDuration, baseDuration) => {
          window.workspaceProfile.commits.push({ phase, actualDuration, baseDuration });
        }}
      >
        <AppShell roomId={roomId} />
      </Profiler>
    </MotionConfig>
  </StrictMode>,
);
requestAnimationFrame(() => document.getElementById("app-boot")?.remove());
