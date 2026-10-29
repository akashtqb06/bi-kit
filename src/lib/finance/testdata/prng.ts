/**
 * Deterministic Pseudo-Random Number Generator (Mulberry32 + MurmurHash3 seed hashing).
 * Guarantees identical output across runs given the same seed.
 */
export class PRNG {
  private state: number;

  constructor(seed: number | string = 42) {
    if (typeof seed === 'string') {
      this.state = PRNG.hashString(seed);
    } else {
      this.state = Math.floor(seed) >>> 0;
    }
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  /**
   * Hashes an arbitrary string seed into a 32-bit unsigned integer.
   */
  private static hashString(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  /**
   * Returns a float in [0, 1).
   */
  nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns an integer between min and max (inclusive).
   */
  nextInt(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(this.nextFloat() * (hi - lo + 1)) + lo;
  }

  /**
   * Returns true with given probability [0, 1] (default 0.5).
   */
  nextBoolean(probability = 0.5): boolean {
    return this.nextFloat() < probability;
  }

  /**
   * Picks a random element from an array.
   */
  pickOne<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    const idx = this.nextInt(0, items.length - 1);
    return items[idx];
  }

  /**
   * Picks N distinct random elements from an array.
   */
  pickSome<T>(items: readonly T[], count: number): T[] {
    const copy = [...items];
    const result: T[] = [];
    const n = Math.min(count, items.length);
    for (let i = 0; i < n; i++) {
      const idx = this.nextInt(0, copy.length - 1);
      result.push(copy[idx]);
      copy.splice(idx, 1);
    }
    return result;
  }

  /**
   * Shuffles an array in place deterministically using Fisher-Yates.
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  /**
   * Generates a deterministic ID with the given prefix.
   */
  nextId(prefix = 'id'): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let str = '';
    for (let i = 0; i < 16; i++) {
      str += chars[this.nextInt(0, chars.length - 1)];
    }
    return `${prefix}_${str}`;
  }

  /**
   * Generates a date string YYYY-MM-DD between two date strings (inclusive).
   */
  dateBetween(startDate: string, endDate: string): string {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (isNaN(start) || isNaN(end) || start > end) {
      throw new Error(`Invalid date range: ${startDate} to ${endDate}`);
    }
    const target = start + this.nextFloat() * (end - start);
    const d = new Date(target);
    return d.toISOString().slice(0, 10);
  }
}

