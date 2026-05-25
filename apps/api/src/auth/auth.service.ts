import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";

const DEV_SECRET = "wain-dev-secret-change-me";
const DEV_ADMIN_PASSWORD = "wain-admin";
const TTL_MS = 1000 * 60 * 60 * 12; // 12-hour sessions

@Injectable()
export class AuthService {
  private readonly secret: string;
  private readonly adminPassword: string;

  constructor() {
    const isProd = process.env.NODE_ENV === "production";
    const secret = process.env.AUTH_SECRET;
    const adminPassword = process.env.ADMIN_PASSWORD;

    // In production, refuse to boot with missing or known-default secrets — a
    // misconfigured deploy must fail loudly rather than ship guessable creds.
    if (isProd) {
      const bad: string[] = [];
      if (!secret || secret === DEV_SECRET) bad.push("AUTH_SECRET");
      if (!adminPassword || adminPassword === DEV_ADMIN_PASSWORD) bad.push("ADMIN_PASSWORD");
      if (bad.length) {
        throw new Error(
          `Refusing to start in production: ${bad.join(", ")} must be set to a strong, non-default value.`,
        );
      }
    }

    this.secret = secret || DEV_SECRET;
    this.adminPassword = adminPassword || DEV_ADMIN_PASSWORD;
  }

  private sign(expiry: number): string {
    return createHmac("sha256", this.secret).update(String(expiry)).digest("hex");
  }

  /** Validate the admin password and return a bearer token. */
  login(password: string): { token: string; expiresAt: number } {
    if (password !== this.adminPassword) {
      throw new UnauthorizedException("Incorrect password");
    }
    const expiry = Date.now() + TTL_MS;
    return { token: `${expiry}.${this.sign(expiry)}`, expiresAt: expiry };
  }

  /** Returns true if a bearer token is well-formed, unexpired, and signed. */
  verify(token: string | undefined): boolean {
    if (!token) return false;
    const [expRaw, sig] = token.split(".");
    const expiry = Number(expRaw);
    if (!expRaw || !sig || Number.isNaN(expiry) || expiry < Date.now()) return false;
    const expected = this.sign(expiry);
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
