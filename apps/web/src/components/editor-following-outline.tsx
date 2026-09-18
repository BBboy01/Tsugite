import { useLayoutEffect, useRef } from "react";

export function EditorFollowingOutline() {
  const outlineRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const outline = outlineRef.current;
    const container = outline?.parentElement;
    if (!outline || !container) return;
    let gutter: Element | null = null;
    const measure = () => {
      const next = container.querySelector(".cm-gutters");
      if (next !== gutter) {
        if (gutter) resize.unobserve(gutter);
        gutter = next;
        if (gutter) resize.observe(gutter);
      }
      const left = gutter
        ? Math.max(0, gutter.getBoundingClientRect().right - container.getBoundingClientRect().left)
        : 0;
      outline.style.left = `${left}px`;
      outline.style.visibility = gutter ? "visible" : "hidden";
    };
    const resize = new ResizeObserver(measure);
    const mutation = new MutationObserver(measure);
    resize.observe(container);
    mutation.observe(container, { childList: true, subtree: true });
    measure();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);
  return (
    <div
      ref={outlineRef}
      className="pointer-events-none absolute inset-y-0 right-0 z-10 border border-solid transition-[border-color,box-shadow] duration-200"
      data-editor-following="true"
      style={{
        borderColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
        boxShadow: [
          "0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent)",
          "inset 0 0 10px 1px color-mix(in srgb, var(--accent) 22%, transparent)",
          "inset 0 0 26px 3px color-mix(in srgb, var(--accent) 11%, transparent)",
        ].join(", "),
      }}
    />
  );
}
