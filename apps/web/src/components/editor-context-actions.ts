import {
  Copy,
  Scissors,
  ClipboardPaste,
  Undo2,
  Redo2,
  TextSelect,
  ArrowRightToLine,
  Eye,
  List,
  FileCode2,
} from "lucide-react";
import type { NavigationKind } from "../lib/editor-navigation";

export const navigationItems = [
  { id: "definition", kind: "definition", icon: ArrowRightToLine },
  { id: "typeDefinition", kind: "type", icon: FileCode2 },
  { id: "implementation", kind: "implementation", icon: FileCode2 },
  { id: "references", kind: "references", icon: List, peek: true },
  { id: "peekDefinition", kind: "definition", icon: Eye, peek: true },
  { id: "peekReferences", kind: "references", icon: Eye, peek: true },
] satisfies { id: string; kind: NavigationKind; icon: typeof Eye; peek?: boolean }[];

export const editItems = [
  { id: "undo", icon: Undo2 },
  { id: "redo", icon: Redo2 },
  { id: "cut", icon: Scissors },
  { id: "copy", icon: Copy },
  { id: "paste", icon: ClipboardPaste },
  { id: "selectAll", icon: TextSelect },
] as const;
