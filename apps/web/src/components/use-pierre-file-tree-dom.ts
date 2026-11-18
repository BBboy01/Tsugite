import { useEffect, type RefObject } from "react";
import type { useFileTree } from "@pierre/trees/react";

type Props = {
  wrapperRef: RefObject<HTMLDivElement | null>;
  model: ReturnType<typeof useFileTree>["model"];
  label: string;
  t: (key: string) => string;
  drafts: RefObject<Map<string, { kind: "file" | "folder"; defaultName: string }>>;
  commitDraftEdit: (input: HTMLInputElement | null, path: string) => boolean;
  commitPathRename: (input: HTMLInputElement, path: string) => void;
  pendingSearchRestoreRef: RefObject<string | null>;
};

export function usePierreFileTreeDom({
  wrapperRef,
  model,
  label,
  t,
  drafts,
  commitDraftEdit,
  commitPathRename,
  pendingSearchRestoreRef,
}: Props) {
  useEffect(() => {
    const observedRoots = new WeakSet<ShadowRoot>();
    const shadowObservers: MutationObserver[] = [];
    const renameRoots: ShadowRoot[] = [];
    const onBlur = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.hasAttribute("data-item-rename-input"))
        return;
      const path = input.closest<HTMLElement>("[data-item-path]")?.dataset.itemPath;
      if (!path) return;
      if (!drafts.current.has(path)) {
        if (input.value.includes("/")) {
          event.stopImmediatePropagation();
          commitPathRename(input, path);
        }
        return;
      }
      event.stopImmediatePropagation();
      if (!commitDraftEdit(input, path)) queueMicrotask(() => input.focus());
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
      for (const root of renameRoots) root.removeEventListener("blur", onBlur, true);
    };
  }, [label, model, t]);

  useEffect(() => {
    const eventTarget = wrapperRef.current;
    if (!eventTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const input = event.composedPath().find((target) => target instanceof HTMLInputElement);
      if (!(input instanceof HTMLInputElement) || !input.hasAttribute("data-item-rename-input"))
        return;
      if (event.isComposing || event.keyCode === 229) return;
      const path = model.getFocusedPath();
      if (!path) return;
      const draft = drafts.current.get(path);
      if (!draft && event.key === "Enter" && input.value.includes("/")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        commitPathRename(input, path);
        return;
      }
      if (!draft) return;
      if (event.key === "Enter" && commitDraftEdit(input, path)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value = draft.defaultName;
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        commitDraftEdit(input, path);
      } else if (event.key === "Enter" && !input.value.trim()) {
        input.value = draft.defaultName;
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      pendingSearchRestoreRef.current = null;
      const searchQuery = model.getSearchValue();
      if (!model.isSearchOpen() || !searchQuery) return;
      if (
        event
          .composedPath()
          .some((target) => target instanceof Element && target.closest('[role="treeitem"]'))
      ) {
        pendingSearchRestoreRef.current = searchQuery;
      }
    };
    const clearPendingSearch = () => {
      pendingSearchRestoreRef.current = null;
    };
    const onClick = (event: MouseEvent) => {
      const searchQuery = pendingSearchRestoreRef.current;
      if (!searchQuery) return;
      if (
        event
          .composedPath()
          .some((target) => target instanceof Element && target.closest('[role="treeitem"]'))
      ) {
        pendingSearchRestoreRef.current = null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => model.openSearch(searchQuery));
        });
      }
    };
    eventTarget.addEventListener("keydown", onKeyDown, true);
    eventTarget.addEventListener("pointerdown", onPointerDown, true);
    eventTarget.addEventListener("pointercancel", clearPendingSearch, true);
    eventTarget.addEventListener("dragstart", clearPendingSearch, true);
    eventTarget.addEventListener("click", onClick, true);
    return () => {
      eventTarget.removeEventListener("keydown", onKeyDown, true);
      eventTarget.removeEventListener("pointerdown", onPointerDown, true);
      eventTarget.removeEventListener("pointercancel", clearPendingSearch, true);
      eventTarget.removeEventListener("dragstart", clearPendingSearch, true);
      eventTarget.removeEventListener("click", onClick, true);
    };
  }, [model]);
}
