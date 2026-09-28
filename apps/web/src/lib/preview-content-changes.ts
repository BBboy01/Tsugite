import type { ProjectFile } from "@iris/shared";

export type PendingPreviewChange = {
  file: ProjectFile;
  revision: number;
};

export class PreviewContentChanges {
  private revision = 0;
  private readonly changes = new Map<string, PendingPreviewChange>();

  record(file: ProjectFile): void {
    this.revision += 1;
    this.changes.set(file.id, { file, revision: this.revision });
  }

  pending(): PendingPreviewChange[] {
    return [...this.changes.values()];
  }

  acknowledge(changes: PendingPreviewChange[]): void {
    for (const change of changes) {
      if (this.changes.get(change.file.id)?.revision === change.revision) {
        this.changes.delete(change.file.id);
      }
    }
  }
}
