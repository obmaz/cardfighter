import type { BaseColor } from '../types/game';

export function SkullEmblemSvg({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="skullBone" x1="16" y1="8" x2="48" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f8ede3" />
          <stop offset="55%" stopColor="#d6c5b3" />
          <stop offset="100%" stopColor="#8b7765" />
        </linearGradient>
      </defs>
      <path
        d="M32 6C17.5 6 8 16.5 8 29c0 8 4 14.2 9.5 17.8V53c0 2.8 2.2 5 5 5h19c2.8 0 5-2.2 5-5v-6.2C52 43.2 56 37 56 29 56 16.5 46.5 6 32 6Z"
        fill="url(#skullBone)"
        stroke="#1b1410"
        strokeWidth="3.5"
      />
      <ellipse cx="22.5" cy="30" rx="6" ry="7" fill="#1b1410" />
      <ellipse cx="41.5" cy="30" rx="6" ry="7" fill="#1b1410" />
      <circle cx="22.5" cy="29" r="2.2" fill="#ff5c5c" />
      <circle cx="41.5" cy="29" r="2.2" fill="#ff5c5c" />
      <path d="M32 35l-3.5 7h7L32 35Z" fill="#1b1410" />
      <path d="M23 50v6M29 50v6M35 50v6M41 50v6" stroke="#1b1410" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function GearEmblemSvg({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="gearSteel" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="55%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
      </defs>
      <path
        d="M21 5h6l1.3 4.8a15 15 0 0 1 3.9 1.6l4.4-2.4 4.2 4.2-2.4 4.4a15 15 0 0 1 1.6 3.9L45 21v6l-4.8 1.3a15 15 0 0 1-1.6 3.9l2.4 4.4-4.2 4.2-4.4-2.4a15 15 0 0 1-3.9 1.6L27 45h-6l-1.3-4.8a15 15 0 0 1-3.9-1.6l-4.4 2.4-4.2-4.2 2.4-4.4a15 15 0 0 1-1.6-3.9L3 27v-6l4.8-1.3a15 15 0 0 1 1.6-3.9l-2.4-4.4 4.2-4.2 4.4 2.4a15 15 0 0 1 3.9-1.6L21 5Z"
        fill="url(#gearSteel)"
        stroke="#0f172a"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="7.5" fill="#164e63" stroke="#0f172a" strokeWidth="2.6" />
    </svg>
  );
}

export function HourglassSvg({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="sandBlue" x1="28" y1="14" x2="28" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="10" y="5" width="36" height="6" rx="3" fill="#b45309" stroke="#1e120a" strokeWidth="2.5" />
      <rect x="10" y="53" width="36" height="6" rx="3" fill="#b45309" stroke="#1e120a" strokeWidth="2.5" />
      <path
        d="M15 11h26c0 10-7 16-10 19 3 3 10 9 10 23H15c0-14 7-20 10-23-3-3-10-9-10-19Z"
        fill="rgba(15, 23, 42, 0.72)"
        stroke="#cbd5e1"
        strokeWidth="2.4"
      />
      <path d="M19 20h18c-1.5 5-5.5 8-9 9.5C24.5 28 20.5 25 19 20Z" fill="url(#sandBlue)" />
      <path d="M17 51c1.5-8 6-12 11-15 5 3 9.5 7 11 15H17Z" fill="url(#sandBlue)" />
      <line x1="28" y1="30" x2="28" y2="42" stroke="#93c5fd" strokeWidth="2" />
    </svg>
  );
}

export function RubyHeartSvg({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="rubyGrad" x1="12" y1="10" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff7eb6" />
          <stop offset="45%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#9d174d" />
        </linearGradient>
      </defs>
      <path
        d="M32 56S8 41.5 8 22.5C8 14 14.5 8 22.2 8c4.6 0 8.2 2.4 9.8 5.2C33.6 10.4 37.2 8 41.8 8 49.5 8 56 14 56 22.5 56 41.5 32 56 32 56Z"
        fill="url(#rubyGrad)"
        stroke="#2d0a1a"
        strokeWidth="3.2"
      />
      <path d="M32 13L22 24l10 29 10-29-10-11Z" fill="rgba(255,255,255,0.16)" />
      <path d="M14 21l8 3-4-9-4 6Z" fill="rgba(255,255,255,0.34)" />
    </svg>
  );
}

export function ShieldCrestSvg({
  color,
  broken,
  size = 54,
}: {
  color: BaseColor;
  broken: boolean;
  size?: number;
}) {
  if (color === 'blue') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="arcaneOrb" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor={broken ? '#475569' : '#bae6fd'} />
            <stop offset="45%" stopColor={broken ? '#1e293b' : '#3b82f6'} />
            <stop offset="100%" stopColor={broken ? '#0f172a' : '#312e81'} />
          </radialGradient>
        </defs>
        <circle
          cx="32"
          cy="32"
          r="25"
          fill="url(#arcaneOrb)"
          stroke={broken ? '#64748b' : '#c7d2fe'}
          strokeWidth="3.2"
        />
        {!broken ? (
          <>
            <circle cx="32" cy="32" r="14" stroke="rgba(255,255,255,0.65)" strokeWidth="2" />
            <circle cx="32" cy="32" r="6" fill="#ffffff" />
          </>
        ) : (
          <path
            d="M17 19l12 11-7 10 14 8M45 16L33 29l9 9"
            stroke="#0f172a"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        )}
      </svg>
    );
  }

  const gradId = color === 'red' ? 'shieldRedGrad' : 'shieldGreenGrad';
  const topStop = broken ? '#475569' : color === 'red' ? '#f87171' : '#6ee7b7';
  const midStop = broken ? '#334155' : color === 'red' ? '#b91c1c' : '#059669';
  const botStop = broken ? '#1e293b' : color === 'red' ? '#450a0a' : '#064e3b';

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={topStop} />
          <stop offset="55%" stopColor={midStop} />
          <stop offset="100%" stopColor={botStop} />
        </linearGradient>
      </defs>
      {/* Horned/ornate top crown */}
      <path
        d="M11 14L6 6l12 5h28l12-5-5 8v18c0 14-10 23-21 27C21 55 11 46 11 32V14Z"
        fill={`url(#${gradId})`}
        stroke={broken ? '#64748b' : '#e2d4b7'}
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="M17 17h30v14c0 10-7 17-15 20-8-3-15-10-15-20V17Z"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1.8"
      />
      {broken && (
        <path
          d="M22 15l9 13-8 10 11 14M42 18l-8 11 7 8"
          stroke="#090d16"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function ElementEmblemSvg({ color, size = 24 }: { color: BaseColor; size?: number }) {
  if (color === 'red') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M24 5L12 17l3 3L27 8l-3-3ZM9 18l-4 4 3 5 4-4-3-5ZM10 14l8 8"
          stroke="#fecaca"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (color === 'green') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M7 23L22 8M11 26L26 11M16 27l10-10"
          stroke="#a7f3d0"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M17 4L7 18h8l-2 10 12-15h-8l0-9Z"
        fill="#bae6fd"
        stroke="#0284c7"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
