/* Flat editorial placeholder for school photography.
   Swap for real imagery later — the aspect ratio and treatment stay. */
export default function SchoolPhoto({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <div
      aria-hidden
      className={`bg-fill flex items-center justify-center aspect-[4/3] ${className}`}
    >
      <span className="text-[2.5rem] font-semibold text-gray-mid/50 tracking-tight select-none">
        {initials}
      </span>
    </div>
  );
}
