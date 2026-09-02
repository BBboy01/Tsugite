import type { HoverInfo } from "@valtown/codemirror-ts";
import type { EditorView, TooltipView } from "@codemirror/view";

type DisplayPart = { text: string };

export const renderTypeScriptHover = (info: HoverInfo, _editorView: EditorView): TooltipView => {
  const dom = document.createElement("div");
  dom.className = "iris-ts-hover";

  if (info.quickInfo?.displayParts?.length) {
    const signature = document.createElement("code");
    signature.className = "iris-ts-hover-signature";
    signature.textContent = info.quickInfo.displayParts
      .map((part: DisplayPart) => part.text)
      .join("");
    dom.append(signature);
  }

  const documentation = info.quickInfo?.documentation
    ?.map((part: DisplayPart) => part.text)
    .join("")
    .trim();
  if (documentation) {
    const description = document.createElement("p");
    description.className = "iris-ts-hover-description";
    description.textContent = documentation;
    dom.append(description);
  }

  return { dom };
};
