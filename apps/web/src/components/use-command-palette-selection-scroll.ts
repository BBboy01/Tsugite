import { useEffect, useRef } from "react";

import type { PaletteCommand } from "@/lib/command-palette-model";

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

    const listBounds = commandList.getBoundingClientRect();
    const commandBounds = command.getBoundingClientRect();
    if (commandBounds.top < listBounds.top) {
      commandList.scrollTop -= listBounds.top - commandBounds.top;
    } else if (commandBounds.bottom > listBounds.bottom) {
      commandList.scrollTop += commandBounds.bottom - listBounds.bottom;
    }
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
