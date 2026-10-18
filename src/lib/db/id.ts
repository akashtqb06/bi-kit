import { customAlphabet } from "nanoid";

/**
 * Generates a URL-safe, 21-character nanoid. Used as the `id` for all
 * domain entities stored in the app database.
 */
const alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const generate = customAlphabet(alphabet, 21);

export function newId(): string {
  return generate();
}

