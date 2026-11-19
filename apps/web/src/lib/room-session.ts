import { RoomClient, type RoomClientOptions } from "./room-client";
import type { DocumentChangeFlags } from "./room-document";
import { RoomTypeScriptIntelligence } from "./room-typescript-intelligence";
import { createRoomTypeScriptSource } from "./room-typescript-source";
import type { EditorIntelligence, IntelligenceFile } from "./editor-intelligence";

export type RoomSessionOptions = RoomClientOptions & {
  createEditorIntelligence?: (files: readonly IntelligenceFile[]) => EditorIntelligence;
};

export class RoomSession {
  readonly client: RoomClient;
  readonly typeScript: RoomTypeScriptIntelligence;
  private disposalTimer?: ReturnType<typeof setTimeout>;
  private mounts = 0;
  private disposed = false;

  constructor(options: RoomSessionOptions) {
    this.client = new RoomClient(options);
    this.typeScript = new RoomTypeScriptIntelligence(createRoomTypeScriptSource(this.client.doc), {
      createIntelligence: options.createEditorIntelligence,
      deferSourceSubscription: true,
    });
  }

  mount(onDocumentChange: (changes: DocumentChangeFlags) => void): () => void {
    if (this.disposed) return () => {};
    if (this.disposalTimer) clearTimeout(this.disposalTimer);
    this.disposalTimer = undefined;
    this.mounts++;
    const unsubscribe = this.client.subscribe((event) => {
      if (event.type === "document") onDocumentChange(event.changes);
    });
    this.typeScript.start();
    this.client.connect();
    let mounted = true;
    return () => {
      if (!mounted) return;
      mounted = false;
      unsubscribe();
      if (--this.mounts > 0) return;
      // React StrictMode reattaches effects before this deferred release runs.
      this.disposalTimer = setTimeout(() => {
        this.disposalTimer = undefined;
        this.disposed = true;
        this.client.dispose();
        this.typeScript.dispose();
      }, 0);
    };
  }
}
