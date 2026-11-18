// Better Auth reads any path in its base URL as the place it lives. So BETTER_AUTH_URL=https://app.com/sign-in
// would make it answer at /sign-in/* instead of /api/auth/*, and every auth request would 404.
// We only ever want the origin (scheme + host + port), so throw away everything else.
export function authBaseURL(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined; // Better Auth falls back to the request's own origin

  const withScheme = /^https?:\/\//i.test(value)
    ? value
    : `${/^(localhost|127\.|\[::1\])/i.test(value) ? "http" : "https"}://${value}`;

  try {
    return new URL(withScheme).origin;
  } catch {
    throw new Error(`BETTER_AUTH_URL is not a valid URL: "${value}". Expected something like https://ledgerline.vercel.app`);
  }
}
