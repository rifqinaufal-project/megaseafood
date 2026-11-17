export type AuthAccount = {
  id: string;
  username: string;
  salt: string;
  hash: string;
  iterations: number;
  createdAt: string;
};

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

/** Username tidak peka huruf besar/kecil. */
export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export function validateUsername(value: string): string | null {
  const username = normalizeUsername(value);
  if (!username) return "Username wajib diisi.";
  if (!USERNAME_PATTERN.test(username))
    return "Username 3–32 karakter: huruf, angka, titik, garis bawah, atau strip.";
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Password wajib diisi.";
  if (value.length < MIN_PASSWORD_LENGTH)
    return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  if (value.length > MAX_PASSWORD_LENGTH)
    return `Password maksimal ${MAX_PASSWORD_LENGTH} karakter.`;
  return null;
}

export const validateRegistration = (username: string, password: string) =>
  validateUsername(username) ?? validatePassword(password);
