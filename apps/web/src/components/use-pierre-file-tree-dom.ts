import { useEffect, useRef, type RefObject } from "react";
import type { ContextMenuOpenContext } from "@pierre/trees";
import type { useFileTree } from "@pierre/trees/react";
import type { PierreDraft } from "../lib/pierre-file-tree-actions";

export const pierreFileTreeCSS = `
  [data-file-tree-search-container][data-open="false"] { display: none; }
  [data-file-tree-search-container] { block-size: 26px; flex-shrink: 0; margin-bottom: 8px; }
  [data-file-tree-search-input] { box-sizing: border-box; height: 26px; line-height: 24px; font-size: 11px; }
  [role="tree"]:has([data-file-tree-search-input]:focus:placeholder-shown)
    [data-item-focused="true"]:not(:focus-visible)::before { outline: none; }
`;

type Props = {
  wrapperRef: RefObject<HTMLDivElement | null>;
  model: ReturnType<typeof useFileTree>["model"];
  label: string;
  t: (key: string) => string;
  drafts: RefObject<Map<string, PierreDraft>>;
  commitDraftEdit: (value: string | null, path: string) => boolean;
  commitPathRename: (value: string, path: string) => void;
  onRootContext: (context: ContextMenuOpenContext | null) => void;
  callbacks: RefObject<{ onSelect: (path: string) => void }>;
};

export function usePierreFileTreeDom({
  wrapperRef,
  model,
  label,
  t,
  drafts,
  commitDraftEdit,
  commitPathRename,
  onRootContext,
  callbacks,
}: Props) {
  const pendingSearchRestoreRef = useRef<{ query: string } | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const openRootMenu = (event: MouseEvent) => {
      if (event.button !== 2) return;
      const path = event.composedPath();
      const treeHost = model.getFileTreeContainer();
      if (!treeHost || !path.includes(treeHost)) return;
      if (
        path.some(
          (target) =>
            target instanceof Element && target.closest('[role="treeitem"]'),
        )
      )
        return;
      if (
        path.some(
          (target) =>
            target instanceof Element && target.closest('[role="search"]'),
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onRootContext({
        anchorElement: wrapper,
        anchorRect: {
          left: event.clientX,
          top: event.clientY,
          right: event.clientX,
          bottom: event.clientY,
          width: 0,
          height: 0,
          x: event.clientX,
          y: event.clientY,
        },
        close: () => onRootContext(null),
        restoreFocus: () => wrapper.focus(),
      });
    };
    wrapper.addEventListener("contextmenu", openRootMenu, true);
    return () => wrapper.removeEventListener("contextmenu", openRootMenu, true);
  }, [model]);

  useEffect(() => {
    const observedRoots = new WeakSet<ShadowRoot>();
    const shadowObservers: MutationObserver[] = [];
    const renameRoots: ShadowRoot[] = [];
    const onBlur = (event: Event) => {
      const input = event.target;
      if (
        !(input instanceof HTMLInputElement) ||
        !input.hasAttribute("data-item-rename-input")
      )
        return;
      const path =
        input.closest<HTMLElement>("[data-item-path]")?.dataset.itemPath;
      if (!path) return;
      if (!drafts.current.has(path)) {
        if (input.value.includes("/")) {
          event.stopImmediatePropagation();
          commitPathRename(input.value, path);
        }
        return;
      }
      event.stopImmediatePropagation();
      if (!commitDraftEdit(input.value, path))
        queueMicrotask(() => input.focus());
    };
    const applyLabel = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const hosts = [wrapper, ...wrapper.querySelectorAll<HTMLElement>("*")];
      for (const host of hosts) {
        const root = host.shadowRoot;
        if (!root) continue;
        const tree = root.querySelector('[role="tree"]');
        tree?.setAttribute("aria-label", label);
        for (const item of root.querySelectorAll<HTMLElement>(
          '[role="treeitem"][data-item-type]',
        )) {
          const path = item.dataset.itemPath?.replace(/\/$/, "");
          const kind = item.dataset.itemType;
          if (!path || kind !== "folder") continue;
          item.setAttribute("aria-label", `${path} ${t("files.folder")}`);
        }
        if (!observedRoots.has(root)) {
          observedRoots.add(root);
          root.addEventListener("blur", onBlur, true);
          renameRoots.push(root);
          const shadowObserver = new MutationObserver(applyLabel);
          shadowObserver.observe(root, { childList: true, subtree: true });
          shadowObservers.push(shadowObserver);
        }
      }
    };
    const observer = new MutationObserver(applyLabel);
    if (wrapperRef.current)
      observer.observe(wrapperRef.current, { childList: true, subtree: true });
    applyLabel();
    return () => {
      observer.disconnect();
      for (const shadowObserver of shadowObservers) shadowObserver.disconnect();
      for (const root of renameRoots)
        root.removeEventListener("blur", onBlur, true);
    };
  }, [label, model, t]);

  useEffect(() => {
    const eventTarget = wrapperRef.current;
    if (!eventTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") pendingSearchRestoreRef.current = null;
      const input = event
        .composedPath()
        .find((target) => target instanceof HTMLInputElement);
      if (
        event.key === "Enter" &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        input instanceof HTMLInputElement &&
        input.hasAttribute("data-file-tree-search-input")
      ) {
        const path = model.getFocusedPath();
        if (path && !path.endsWith("/")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          pendingSearchRestoreRef.current = null;
          model.closeSearch();
          callbacks.current.onSelect(path);
          return;
        }
      }
      if (
        !(input instanceof HTMLInputElement) ||
        !input.hasAttribute("data-item-rename-input")
      )
        return;
      if (event.isComposing || event.keyCode === 229) return;
      const path = model.getFocusedPath();
      if (!path) return;
      const draft = drafts.current.get(path);
      if (!draft && event.key === "Enter" && input.value.includes("/")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        commitPathRename(input.value, path);
        return;
      }
      if (!draft) return;
      if (event.key === "Enter" && commitDraftEdit(input.value, path)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value = draft.defaultName;
        input.dispatchEvent(
          new Event("input", { bubbles: true, composed: true }),
        );
        commitDraftEdit(input.value, path);
      } else if (event.key === "Enter" && !input.value.trim()) {
        input.value = draft.defaultName;
        input.dispatchEvent(
          new Event("input", { bubbles: true, composed: true }),
        );
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      pendingSearchRestoreRef.current = null;
      const searchQuery = model.getSearchValue();
      if (!model.isSearchOpen() || !searchQuery) return;
      if (
        event
          .composedPath()
          .some(
            (target) =>
              target instanceof Element && target.closest('[role="treeitem"]'),
          )
      ) {
        pendingSearchRestoreRef.current = { query: searchQuery };
      }
    };
    const clearPendingSearch = () => {
      pendingSearchRestoreRef.current = null;
    };
    const onClick = (event: MouseEvent) => {
      const restore = pendingSearchRestoreRef.current;
      if (!restore) return;
      if (
        event
          .composedPath()
          .some(
            (target) =>
              target instanceof Element && target.closest('[role="treeitem"]'),
          )
      ) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (pendingSearchRestoreRef.current !== restore) return;
            pendingSearchRestoreRef.current = null;
            model.openSearch(restore.query);
          });
        });
      }
    };
    eventTarget.addEventListener("keydown", onKeyDown, true);
    eventTarget.addEventListener("pointerdown", onPointerDown, true);
    eventTarget.addEventListener("pointercancel", clearPendingSearch, true);
    eventTarget.addEventListener("dragstart", clearPendingSearch, true);
    eventTarget.addEventListener("click", onClick, true);
    return () => {
      pendingSearchRestoreRef.current = null;
      eventTarget.removeEventListener("keydown", onKeyDown, true);
      eventTarget.removeEventListener("pointerdown", onPointerDown, true);
      eventTarget.removeEventListener(
        "pointercancel",
        clearPendingSearch,
        true,
      );
      eventTarget.removeEventListener("dragstart", clearPendingSearch, true);
      eventTarget.removeEventListener("click", onClick, true);
    };
  }, [callbacks, model]);

  const finishActiveEdit = () => {
    const container = model.getFileTreeContainer();
    const input = container ? findInlineRenameInput(container) : null;
    const path =
      input?.closest<HTMLElement>("[data-item-path]")?.dataset.itemPath ??
      [...drafts.current.keys()][0];
    if (
      path &&
      drafts.current.has(path) &&
      commitDraftEdit(input?.value ?? null, path)
    )
      return true;
    input?.blur();
    return true;
  };

  return { finishActiveEdit };
}

function findInlineRenameInput(
  root: Document | ShadowRoot | Element,
): HTMLInputElement | null {
  const input = root.querySelector<HTMLInputElement>(
    "[data-item-rename-input]",
  );
  if (input) return input;
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (!element.shadowRoot) continue;
    const nestedInput = findInlineRenameInput(element.shadowRoot);
    if (nestedInput) return nestedInput;
  }
  return null;
}
