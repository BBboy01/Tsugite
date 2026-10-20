import type { EditorStatus } from "../lib/editor-status";

type Props = {
  status: EditorStatus;
  mode?: string;
};

export function EditorStatusBar({ status, mode }: Props) {
  return (
    <div className="iris-editor-statusbar" data-editor-status aria-label="Editor status">
      <div className="iris-editor-status-group iris-editor-status-leading">
        {mode && (
          <span className="iris-editor-status-mode" data-status-mode>
            --{mode}--
          </span>
        )}
        <span className="iris-editor-status-path" data-status-path title={status.path}>
          {status.path}
        </span>
      </div>
      <div className="iris-editor-status-group iris-editor-status-trailing">
        <span className="iris-editor-status-position" data-status-position>
          {status.position}
        </span>
        <span className="iris-editor-status-progress" data-status-progress>
          {status.progress}
        </span>
      </div>
    </div>
  );
}
