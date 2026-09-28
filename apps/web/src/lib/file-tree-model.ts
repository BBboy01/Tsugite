import type { ProjectFile } from "@iris/shared";

export type FileTreeTarget =
  | { type: "file"; file: ProjectFile }
  | { type: "folder"; path: string }
  | null;

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

export type VisibleFileTreeRow =
  | {
      kind: "folder";
      key: string;
      node: Extract<FileTreeNode, { kind: "folder" }>;
      depth: number;
      positionInSet: number;
      setSize: number;
    }
  | {
      kind: "file";
      key: string;
      node: Extract<FileTreeNode, { kind: "file" }>;
      depth: number;
      positionInSet: number;
      setSize: number;
    }
  | { kind: "create"; key: string; depth: number };

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

export function flattenVisibleFileTree(
  nodes: FileTreeNode[],
  collapsedFolders: ReadonlySet<string>,
  createInputDirectory?: string,
): VisibleFileTreeRow[] {
  const rows: VisibleFileTreeRow[] = [];

  const visit = (items: FileTreeNode[], depth: number, parentPath: string) => {
    if (createInputDirectory === parentPath) {
      rows.push({ kind: "create", key: `create:${parentPath}`, depth });
    }

    items.forEach((node, index) => {
      if (node.kind === "file") {
        rows.push({
          kind: "file",
          key: node.file.path,
          node,
          depth,
          positionInSet: index + 1,
          setSize: items.length,
        });
        return;
      }

      rows.push({
        kind: "folder",
        key: node.path,
        node,
        depth,
        positionInSet: index + 1,
        setSize: items.length,
      });
      if (!collapsedFolders.has(node.path)) visit(node.children, depth + 1, node.path);
    });
  };

  visit(nodes, 0, "");
  return rows;
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
