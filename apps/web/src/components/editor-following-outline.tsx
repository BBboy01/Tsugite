export function EditorFollowingOutline() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-14 right-0 z-10 border border-solid transition-[border-color,box-shadow] duration-200"
      data-editor-following="true"
      style={{
        borderColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
        boxShadow: [
          "0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent)",
          "inset 0 0 10px 1px color-mix(in srgb, var(--accent) 22%, transparent)",
          "inset 0 0 26px 3px color-mix(in srgb, var(--accent) 11%, transparent)",
        ].join(", "),
      }}
    />
  );
}
