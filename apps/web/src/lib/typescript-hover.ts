import { hoverTooltip, ViewPlugin, type TooltipView } from "@codemirror/view";
import type { EditorIntelligence, IntelligenceHover } from "./editor-intelligence";
import { LatestIntelligenceRequest } from "./editor-navigation";

export const renderTypeScriptHover = (info: IntelligenceHover): TooltipView => {
  const dom = document.createElement("div");
  dom.className = "iris-ts-hover";
  if (info.signature) {
    const signature = document.createElement("code");
    signature.className = "iris-ts-hover-signature";
    signature.textContent = info.signature;
    dom.append(signature);
  }
  if (info.documentation) {
    const description = document.createElement("p");
    description.className = "iris-ts-hover-description";
    description.textContent = info.documentation;
    dom.append(description);
  }
  return { dom };
};

export function typeScriptHover(intelligence: EditorIntelligence, path: string) {
  const requests = new LatestIntelligenceRequest();
  return [
    ViewPlugin.define(() => ({ destroy: () => requests.invalidate() })),
    hoverTooltip(async (view, position) => {
      const isCurrent = requests.begin();
      const doc = view.state.doc;
      const workspaceVersion = intelligence.workspaceVersion;
      try {
        const result = await intelligence.hover({ path, position });
        if (
          !isCurrent() ||
          view.state.doc !== doc ||
          workspaceVersion !== intelligence.workspaceVersion ||
          result.status !== "ok"
        )
          return null;
        return {
          pos: result.value.from,
          end: result.value.to,
          create: () => renderTypeScriptHover(result.value),
        };
      } catch {
        return null;
      }
    }),
  ];
}
