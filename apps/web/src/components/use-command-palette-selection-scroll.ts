import { useEffect, useRef } from "react";

import type { PaletteCommand } from "@/lib/command-palette-model";
import { keepSelectionVisible } from "@/lib/selection-scroll";

export function useCommandPaletteSelectionScroll(
  commands: PaletteCommand[],
  selectedIndex: number,
) {
  const commandListRef = useRef<HTMLDivElement>(null);
  const commandRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const selectedCommand = commands[selectedIndex];
    const commandList = commandListRef.current;
    const command = selectedCommand && commandRefs.current.get(selectedCommand.id);
    if (!commandList || !command) {
      return;
    }

    keepSelectionVisible(
      commandList,
      command,
      selectedIndex > 0,
      selectedIndex < commands.length - 1,
    );
  }, [commands, selectedIndex]);

  return {
    commandListRef,
    registerCommand: (id: string, element: HTMLButtonElement | null) => {
      if (element) {
        commandRefs.current.set(id, element);
      } else {
        commandRefs.current.delete(id);
      }
    },
  };
}
