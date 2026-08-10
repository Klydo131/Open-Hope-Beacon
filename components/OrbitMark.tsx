// The Orbit's mark.
//
// Inline SVG rather than a file in public/: it costs no extra request, it
// inherits the surrounding colour, and it cannot be blocked by the CSP or lost
// by a cache. It also scales to any size without a second asset, which matters
// because it appears at 28px beside a heading and at 14px in an attribution
// line.
//
// The shape is the name: a body with a ring around it and a satellite on the
// ring. Drawn on a 24x24 grid so it lines up with the emoji and icons already
// used elsewhere.
export function OrbitMark({
  size = 24,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      // Decorative: the words next to it already say what this is, so a screen
      // reader announcing "Orbit logo, The Orbit" would just be an echo.
      aria-hidden="true"
      focusable="false"
    >
      {/* The orbit path, tilted, so the mark reads as motion rather than a
          target. Stroke only, so it stays legible when very small. */}
      <ellipse
        cx="12"
        cy="12"
        rx="10.5"
        ry="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.55"
        transform="rotate(-28 12 12)"
      />
      {/* The body. */}
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      {/* The satellite, sitting on the ring rather than floating beside it. */}
      <circle cx="20.2" cy="7.9" r="1.9" fill="currentColor" />
    </svg>
  );
}
