import { hoverTooltip, ViewPlugin, type TooltipView } from "@codemirror/view";
import {
  createIntelligenceRequestId,
  type EditorIntelligence,
  type IntelligenceSignatureHelp,
} from "./editor-intelligence";
import { LatestIntelligenceRequest } from "./editor-navigation";

function signatureDom(help: IntelligenceSignatureHelp): TooltipView {
  const signature = help.signatures[help.activeSignature];
  const dom = document.createElement("div");
  dom.className = "iris-ts-signature";
  if (!signature) return { dom };
  const text = document.createElement("code");
  text.textContent = `${signature.prefix}${signature.parameters.map((item) => item.label).join(signature.separator)}${signature.suffix}`;
  dom.append(text);
  const active = signature.parameters[help.activeParameter];
  if (active?.documentation) {
    const details = document.createElement("p");
    details.textContent = active.documentation;
    dom.append(details);
  }
  return { dom };
}

export function typeScriptSignatureHelp(intelligence: EditorIntelligence, path: string) {
  const requests = new LatestIntelligenceRequest();
  let activeRequestId: string | undefined;
  const cancelActive = () => {
    requests.invalidate();
    if (activeRequestId) intelligence.cancel(activeRequestId);
    activeRequestId = undefined;
  };
  return [
    ViewPlugin.define(() => ({ destroy: cancelActive })),
    hoverTooltip(
      async (view, position) => {
        cancelActive();
        const isCurrent = requests.begin();
        const requestId = createIntelligenceRequestId("signature");
        activeRequestId = requestId;
        return querySignatureHelp(intelligence, path, view, position, {
          requestId,
          isCurrent,
          finish: () => {
            if (activeRequestId === requestId) activeRequestId = undefined;
          },
        });
      },
      {
        hideOn: (tr) => {
          if (tr.docChanged || tr.selection !== undefined) {
            cancelActive();
            return true;
          }
          return false;
        },
      },
    ),
  ];
}

type SignatureRequest = {
  requestId?: string;
  isCurrent?: () => boolean;
  finish?: () => void;
};

export async function querySignatureHelp(
  intelligence: EditorIntelligence,
  path: string,
  view: import("@codemirror/view").EditorView,
  position: number,
  request: SignatureRequest = {},
) {
  const doc = view.state.doc;
  const selection = view.state.selection;
  const workspaceVersion = intelligence.workspaceVersion;
  let result: Awaited<ReturnType<EditorIntelligence["signatureHelp"]>>;
  try {
    result = await intelligence.signatureHelp({
      path,
      position,
      requestId: request.requestId,
      timeoutMs: 2000,
    });
  } catch {
    return null;
  } finally {
    request.finish?.();
  }
  if (
    result.status !== "ok" ||
    request.isCurrent?.() === false ||
    view.state.doc !== doc ||
    view.state.selection !== selection ||
    intelligence.workspaceVersion !== workspaceVersion
  )
    return null;
  return {
    pos: position,
    above: true,
    strictSide: true,
    create: () => signatureDom(result.value),
  };
}
