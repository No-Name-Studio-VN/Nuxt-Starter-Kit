/**
 * Converts any CSS colour the browser understands (oklch, color-mix(), named…)
 * to a `#rrggbb` hex string for consumers that only take sRGB hex, like WebGL
 * uniforms. Painting one pixel lets the browser do the colour-space conversion.
 * Returns undefined outside the browser or when the value is not a colour.
 */
export function cssColorToHex(color: string): string | undefined {
  if (!import.meta.client || !CSS.supports('color', color)) {
    return undefined;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return undefined;
  }

  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
