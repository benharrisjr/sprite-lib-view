export type RGBA = [number, number, number, number];

export interface PickedColor {
  hex: string;
  rgba: RGBA;
}

const hex2 = (v: number) => v.toString(16).padStart(2, "0");

export function toHex([r, g, b, a]: RGBA): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 255 ? hex2(a) : ""}`;
}

export function toRgbaString([r, g, b, a]: RGBA): string {
  return a < 255 ? `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})` : `rgb(${r}, ${g}, ${b})`;
}
