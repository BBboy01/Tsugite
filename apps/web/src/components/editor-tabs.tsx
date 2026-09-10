import type { ReactNode } from "react";

type EditorTabsProps = {
  label: string;
  children: ReactNode;
};

export function EditorTabs({ label, children }: EditorTabsProps) {
  return (
    <div className="editor-toolbar glass-toolbar flex h-12 min-w-0 flex-none items-center px-4 max-[760px]:h-11 max-[760px]:px-3">
      <div
        className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={label}
      >
        <div className="flex min-w-max items-center gap-1">{children}</div>
      </div>
    </div>
  );
}
