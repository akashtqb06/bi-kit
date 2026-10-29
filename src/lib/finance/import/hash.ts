/**
 * Duplicate detection hash generator based on CONTRACT.md and S6c specification:
 * importHash = deterministic hash of (date + amount + normalized description)
 */

export function normalizeDescription(description: string): string {
  if (!description) return '';
  return description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

/**
 * Lightweight, synchronous SHA-256 implementation in pure TypeScript.
 * Works uniformly in browser UI, Web Workers, Node.js, and Edge runtimes.
 */
function sha256(str: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = str[lengthProperty] * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  str += '\x80';
  while ((str[lengthProperty] % 64) - 56) str += '\x00';
  for (i = 0; i < str[lengthProperty]; i++) {
    j = str.charCodeAt(i);
    if (j >> 8) return ''; // ASCII only
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const s0 = i < 16 ? w[i] : (w[i] =
        ((w[i - 16] +
          (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
          w[i - 7] +
          (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
          0));
      const s1 =
        rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const ch = (hash[0] & hash[1]) ^ (~hash[0] & hash[2]);
      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ((hash[4] & hash[5]) ^ (~hash[4] & hash[6])) +
        k[i] +
        s0;
      const temp2 = s1 + ch;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (b * 8)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

/**
 * Generates the deterministic import hash for a statement transaction.
 * @param date ISO date string (YYYY-MM-DD)
 * @param amountPaise Integer amount in minor units (paise)
 * @param description Raw or normalized description
 */
export function generateImportHash(
  date: string,
  amountPaise: number,
  description: string
): string {
  const normDesc = normalizeDescription(description);
  const rawInput = `${date}|${amountPaise}|${normDesc}`;
  const digest = sha256(rawInput);
  return digest ? `hsh_${digest.slice(0, 32)}` : `hsh_${normDesc.slice(0, 20)}_${date}_${amountPaise}`;
}
