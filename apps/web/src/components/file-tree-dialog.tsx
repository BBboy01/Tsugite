import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon, FilePlusIcon, Pencil1Icon, PlusIcon } from "@radix-ui/react-icons";
import { Button, IconButton } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";

import type { WorkspaceTheme } from "@iris/shared";

export type FileDialogMode = "create-file" | "create-folder" | "rename-file" | "rename-folder";

type FileTreeDialogProps = {
  mode: FileDialogMode | null;
  defaultPath: string;
  error?: string;
  theme: WorkspaceTheme;
  onOpenChange: (open: boolean) => void;
  onSubmit: (path: string) => void;
};

export function FileTreeDialog({
  mode,
  defaultPath,
  error,
  theme,
  onOpenChange,
  onSubmit,
}: FileTreeDialogProps) {
  const { t } = useTranslation();
  const [path, setPath] = useState(defaultPath);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode) {
      setPath(defaultPath);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [defaultPath, mode]);

  const isFolder = mode === "create-folder" || mode === "rename-folder";
  const isRename = mode === "rename-file" || mode === "rename-folder";
  const title = isRename
    ? isFolder
      ? t("dialog.renameFolder")
      : t("dialog.renameFile")
    : isFolder
      ? t("dialog.newFolder")
      : t("dialog.newFile");
  const Icon = isRename ? Pencil1Icon : isFolder ? PlusIcon : FilePlusIcon;

  return (
    <Dialog.Root open={mode !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="glass-overlay fixed inset-0 z-50" />
        <Dialog.Content
          className={`theme-${theme} glass-dialog fixed left-1/2 top-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-iris-divider bg-iris-preview p-5 text-iris-ink shadow-[0_20px_50px_rgba(65,66,45,0.2)] focus:outline-none`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]">
                <Icon width="16" height="16" />
              </span>
              <div>
                <Dialog.Title className="font-serif text-[19px] font-medium text-iris-strong">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="mt-1 font-iris-mono text-[10px] leading-tight text-iris-muted">
                  {t("dialog.description")}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                type="button"
                aria-label={t("dialog.close")}
                title={t("dialog.close")}
              >
                <Cross2Icon width="15" height="15" />
              </IconButton>
            </Dialog.Close>
          </div>

          <form
            className="mt-6 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(path);
            }}
          >
            <label
              className="grid gap-2 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted"
              htmlFor="file-tree-path"
            >
              {t("dialog.path")}
              <input
                ref={inputRef}
                id="file-tree-path"
                className="w-full rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2.5 font-iris-mono text-xs normal-case tracking-normal text-iris-ink outline-2 outline-[color-mix(in_srgb,var(--accent)_36%,transparent)] outline-offset-1 placeholder:text-iris-muted"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "file-tree-path-error" : undefined}
              />
            </label>
            {error && (
              <p
                id="file-tree-path-error"
                className="m-0 font-iris-mono text-[11px] leading-tight text-[#b7645d]"
                role="alert"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="soft" color="gray" size="2">
                  {t("dialog.cancel")}
                </Button>
              </Dialog.Close>
              <Button type="submit" color="blue" size="2">
                {isRename ? t("dialog.rename") : t("dialog.create")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
