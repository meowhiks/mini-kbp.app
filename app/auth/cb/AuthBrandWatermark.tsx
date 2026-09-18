/** Фоновый бренд справа внизу на auth-страницах. */
export default function AuthBrandWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-0 right-0 z-[1] select-none whitespace-nowrap pb-4 pr-4 text-[clamp(3.5rem,14vw,9rem)] font-semibold leading-none tracking-tight text-gray-900/[0.05]"
    >
      Мини КБиП
    </div>
  );
}
