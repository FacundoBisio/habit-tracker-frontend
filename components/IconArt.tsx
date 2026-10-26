/**
 * Marca de la app (slime blanco con dos ojos sobre degradado verde) como SVG inline: sin fuentes,
 * apto para `ImageResponse`. Sin esquinas redondeadas: los PNG son a sangre (iOS y Android aplican su máscara).
 * La versión con esquinas redondeadas para la pestaña del navegador es `public/icon.svg`.
 */
export function IconArt({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1fa971" />
          <stop offset="1" stopColor="#0f6b45" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill="url(#bg)" />
      <ellipse cx="32" cy="52.5" rx="19" ry="2.6" fill="#000" opacity="0.2" />
      <path
        d="M11 47Q11 50 14 50H50Q53 50 53 47C53 31 44 18 32 18C20 18 11 31 11 47Z"
        fill="#fff"
      />
      <path d="M18.5 34C19.8 28.5 23.5 24.5 28 22.5" fill="none" stroke="#bff0d8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="25" cy="39" r="3.6" fill="#0a2a1c" />
      <circle cx="39" cy="39" r="3.6" fill="#0a2a1c" />
      <circle cx="26.2" cy="37.8" r="1.1" fill="#fff" />
      <circle cx="40.2" cy="37.8" r="1.1" fill="#fff" />
    </svg>
  );
}
