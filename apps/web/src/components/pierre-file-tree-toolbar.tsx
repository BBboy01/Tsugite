import { FilePlus2, FolderPlus, Search } from "lucide-react";
import { Tooltip } from "@radix-ui/themes";
import { useEffect, useRef } from "react";

export function PierreFileTreeToolbar({
  label,
  title,
  searchOpen,
  onSearch,
  onCreate,
  newFileLabel,
  newFolderLabel,
}: {
  label: string;
  title: string;
  searchOpen: boolean;
  onSearch: () => void;
  onCreate: (action: "new-file" | "new-folder") => void;
  newFileLabel: string;
  newFolderLabel: string;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const buttons = [...toolbar.querySelectorAll("button")];
    buttons.forEach((button, index) => {
      button.tabIndex = index === 0 ? 0 : -1;
    });
    const onFocus = (event: FocusEvent) => {
      buttons.forEach((button) => {
        button.tabIndex = button === event.target ? 0 : -1;
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const current = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const rtl = getComputedStyle(toolbar).direction === "rtl";
      const step =
        event.key === "ArrowRight"
          ? rtl
            ? -1
            : 1
          : event.key === "ArrowLeft"
            ? rtl
              ? 1
              : -1
            : 0;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : step
              ? (current + step + buttons.length) % buttons.length
              : -1;
      if (next < 0) return;
      event.preventDefault();
      event.stopPropagation();
      buttons[next]?.focus();
    };
    toolbar.addEventListener("focusin", onFocus);
    toolbar.addEventListener("keydown", onKeyDown);
    return () => {
      toolbar.removeEventListener("focusin", onFocus);
      toolbar.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  const buttonClass =
    "flex size-6 shrink-0 items-center justify-center rounded text-iris-muted hover:bg-[var(--hover-surface)] hover:text-iris-strong focus-visible:outline-2 focus-visible:outline-iris-accent";
  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label={label}
      className="flex items-center justify-end gap-1 px-4 pt-1 pb-2"
    >
      <h2 className="mr-auto min-w-0 truncate text-xs font-normal text-iris-muted">
        {title}
      </h2>
      <Tooltip content="Search">
        <button
          type="button"
          className={buttonClass}
          aria-label="Search"
          aria-expanded={searchOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onSearch}
        >
          <Search size={14} aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip content={newFileLabel}>
        <button
          type="button"
          className={buttonClass}
          aria-label={newFileLabel}
          onClick={() => onCreate("new-file")}
        >
          <FilePlus2 size={14} aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip content={newFolderLabel}>
        <button
          type="button"
          className={buttonClass}
          aria-label={newFolderLabel}
          onClick={() => onCreate("new-folder")}
        >
          <FolderPlus size={14} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}
