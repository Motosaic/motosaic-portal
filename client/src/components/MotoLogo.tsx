import logoUrl from "/logo/43_Motosaic_Logo_LU_LINEAR_HERO_LT.png";

interface MotoLogoProps { className?: string; height?: number; }

/**
 * MotoLogoFull — uses the real transparent PNG logo asset.
 * The PNG has a transparent background and renders cleanly on any dark surface.
 * Native aspect ratio is 5522×1080, so we size by height and let width scale.
 */
export function MotoLogoFull({ className = "", height = 40 }: MotoLogoProps) {
  // Native aspect ratio: 5522 / 1080 ≈ 5.11
  const width = Math.round(height * 5.11);
  return (
    <img
      src={logoUrl}
      alt="Motosaic"
      height={height}
      width={width}
      className={className}
      style={{ height, width: "auto", maxWidth: "100%", display: "block", flexShrink: 0 }}
    />
  );
}

// Compact M-mark only
export function MotoLogo({ className = "", height = 40 }: MotoLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height={height}
      viewBox="0 0 220 120"
      className={className}
      aria-label="Motosaic"
      style={{ height, width: "auto", display: "block" }}
    >
      <path d="M10 60 Q10 8 55 8 Q100 8 100 60" fill="#1FC3EF"/>
      <path d="M55 60 Q55 8 100 8 Q145 8 145 60" fill="#1FC3EF"/>
      <path d="M100 60 Q100 8 145 8 Q190 8 190 60" fill="#1FC3EF"/>
      <rect x="10" y="58" width="180" height="4" fill="white"/>
      <path d="M10 60 Q10 112 55 112 Q100 112 100 60" fill="#0d6b8a"/>
      <path d="M55 60 Q55 112 100 112 Q145 112 145 60" fill="#0d6b8a"/>
      <path d="M100 60 Q100 112 145 112 Q190 112 190 60" fill="#0d6b8a"/>
      <path d="M200 35 L203 24 L206 35 L217 38 L206 41 L203 52 L200 41 L189 38 Z" fill="#ADF029"/>
    </svg>
  );
}
