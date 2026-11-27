import type { BaseColor } from '../types/game';

/** Painted UI sprite components backed by /public/assets/ui PNGs */

export function SkullEmblemSvg({ size = 34 }: { size?: number }) {
  return (
    <img
      src="./assets/ui/skull.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="fantasy-ui-img"
      draggable={false}
    />
  );
}

export function GearEmblemSvg({ size = 48 }: { size?: number }) {
  return (
    <img
      src="./assets/ui/gear.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="fantasy-ui-img"
      draggable={false}
    />
  );
}

export function HourglassSvg({ size = 40 }: { size?: number }) {
  return (
    <img
      src="./assets/ui/hourglass.png"
      alt=""
      aria-hidden="true"
      height={size}
      style={{ height: size, width: 'auto' }}
      className="fantasy-ui-img"
      draggable={false}
    />
  );
}

export function RubyHeartSvg({ size = 42 }: { size?: number }) {
  return (
    <img
      src="./assets/ui/heart.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="fantasy-ui-img"
      draggable={false}
    />
  );
}

export function ShieldCrestSvg({
  color,
  broken,
  size = 56,
}: {
  color: BaseColor;
  broken: boolean;
  size?: number;
}) {
  const src = `./assets/ui/shield_${color}${broken ? '_broken' : ''}.png`;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="fantasy-ui-img"
      draggable={false}
    />
  );
}

export function ElementEmblemSvg({
  color,
  size = 34,
}: {
  color: BaseColor;
  size?: number;
}) {
  return (
    <img
      src={`./assets/ui/icon_${color}.png`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="fantasy-ui-img fantasy-emblem-img"
      draggable={false}
    />
  );
}
