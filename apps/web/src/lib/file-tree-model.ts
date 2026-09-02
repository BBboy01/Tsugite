import type { ProjectFile } from "@iris/shared";

export type FileTreeNode =
  | {
      kind: "folder";
      path: string;
      name: string;
      children: FileTreeNode[];
    }
  | {
      kind: "file";
      file: ProjectFile;
      name: string;
    };

export function buildFileTree(files: ProjectFile[], folders: string[]): FileTreeNode[] {
  const roots: FileTreeNode[] = [];
  const folderNodes = new Map<string, Extract<FileTreeNode, { kind: "folder" }>>();

  const ensureFolder = (path: string) => {
    if (!path) return;
    const segments = path.split("/");
    let parent: Extract<FileTreeNode, { kind: "folder" }> | undefined;
    for (let index = 0; index < segments.length; index += 1) {
      const folderPath = segments.slice(0, index + 1).join("/");
      let folder = folderNodes.get(folderPath);
      if (!folder) {
        folder = { kind: "folder", path: folderPath, name: segments[index], children: [] };
        folderNodes.set(folderPath, folder);
        if (parent) parent.children.push(folder);
        else roots.push(folder);
      }
      parent = folder;
    }
  };

  for (const folder of folders) ensureFolder(folder);

  for (const file of files) {
    const parentPath = file.path.split("/").slice(0, -1).join("/");
    if (parentPath) ensureFolder(parentPath);
    const node: FileTreeNode = {
      kind: "file",
      file,
      name: file.path.split("/").at(-1) ?? file.path,
    };
    const parentFolder = folderNodes.get(parentPath);
    if (parentFolder) parentFolder.children.push(node);
    else roots.push(node);
  }

  sortNodes(roots);
  return roots;
}

export function folderAncestors(path: string): string[] {
  const segments = path.split("/").slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function sortNodes(nodes: FileTreeNode[]): void {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  for (const node of nodes) {
    if (node.kind === "folder") sortNodes(node.children);
  }
}
