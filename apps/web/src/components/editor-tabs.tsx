import { useLayoutEffect, useRef, type ReactNode } from "react";

type EditorTabsProps = {
  label: string;
  activeValue?: string;
  children: ReactNode;
};

export function EditorTabs({ label, activeValue, children }: EditorTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    listRef.current
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.parentElement?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      });
  }, [activeValue]);
  return (
    <div className="editor-toolbar glass-toolbar flex h-12 min-w-0 flex-none items-center px-4 max-[760px]:h-11 max-[760px]:px-3">
      <div
        ref={listRef}
        className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={label}
        onKeyDown={(event) => {
          const tabs = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          );
          const index = tabs.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          let next: number;
          if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
          else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault();
          tabs[next]?.focus({ preventScroll: true });
          tabs[next]?.parentElement?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: "instant",
          });
        }}
      >
        <div className="flex min-w-max items-center gap-1">{children}</div>
      </div>
    </div>
  );
}
