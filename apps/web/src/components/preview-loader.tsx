export function PreviewLoader({ label }: { label: string }) {
  return (
    <div className="flex w-[min(220px,72%)] flex-col items-center gap-2.5">
      <div
        className="motion-safe:animate-spin h-10 w-10 rounded-full border-[3px] border-[color-mix(in_srgb,var(--accent-deep)_18%,transparent)] border-r-[var(--accent-deep)] border-t-[var(--accent-deep)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent-deep)_32%,transparent)]"
        aria-hidden="true"
      />
      <span className="font-iris-mono text-[9px] leading-none text-[var(--accent-deep)]">
        {label}
      </span>
    </div>
  );
}
