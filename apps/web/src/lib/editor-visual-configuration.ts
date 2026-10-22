import { Compartment, type StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { ProjectSettings } from "@iris/shared";

import { editorLineNumbers } from "./editor-basic-setup";
import type { EditorLanguage } from "./editor-language";
import { editorTheme } from "./editor-theme";
import { highlightsHighlight, setHighlightsTheme } from "./highlights-highlighting";

export class EditorVisualConfiguration {
  private readonly lineNumbers = new Compartment();
  private readonly theme = new Compartment();
  private readonly wordWrap = new Compartment();
  private readonly highlighting = new Compartment();
  readonly extensions;

  constructor(
    private readonly language: EditorLanguage,
    private settings: ProjectSettings,
    private readonly onHighlightReady?: () => void,
  ) {
    this.extensions = {
      lineNumbers: this.lineNumbers.of(editorLineNumbers(settings.relativeLineNumbers)),
      theme: this.theme.of(editorTheme(settings)),
      wordWrap: this.wordWrap.of(settings.wordWrap ? EditorView.lineWrapping : []),
      highlighting: this.highlighting.of(
        highlightsHighlight(language, settings.theme, onHighlightReady),
      ),
    };
  }

  reconfigure(settings: ProjectSettings): StateEffect<unknown>[] {
    const previous = this.settings;
    const effects: StateEffect<unknown>[] = [];
    if (
      settings.theme !== previous.theme ||
      settings.fontFamily !== previous.fontFamily ||
      settings.fontSize !== previous.fontSize
    ) {
      effects.push(this.theme.reconfigure(editorTheme(settings)));
    }
    if (settings.wordWrap !== previous.wordWrap) {
      effects.push(this.wordWrap.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []));
    }
    if (settings.theme !== previous.theme) {
      effects.push(setHighlightsTheme.of(settings.theme));
    }
    if (settings.relativeLineNumbers !== previous.relativeLineNumbers) {
      effects.push(this.lineNumbers.reconfigure(editorLineNumbers(settings.relativeLineNumbers)));
    }
    this.settings = settings;
    return effects;
  }
}
