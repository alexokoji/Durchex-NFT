export function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

export function rangeFromSeed(seed: number, min: number, max: number): number {
  const span = max - min;
  return min + (seed % 1000) / 1000 * span;
}
