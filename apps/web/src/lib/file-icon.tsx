import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";
import type { SVGProps } from "react";

export function getFileIconName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function getFolderIconName(path: string): string {
  return getFileIconName(path);
}

export function FileTypeIcon({ path, ...props }: { path: string } & SVGProps<SVGSVGElement>) {
  return <FileIcon fileName={getFileIconName(path)} autoAssign aria-hidden="true" {...props} />;
}

export function FolderTypeIcon({ path, ...props }: { path: string } & SVGProps<SVGSVGElement>) {
  return <FolderIcon folderName={getFolderIconName(path)} aria-hidden="true" {...props} />;
}
