import bcrypt from "bcryptjs";
import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { Db } from "../db/db.js";
import { forbidden, unauthorized } from "./http.js";

export type Role = "resident" | "worker" | "admin";
export type AuthUser = { id: string; role: Role };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const hashPassword = (password: string) => bcrypt.hash(password, config.bcryptRounds);
export const checkPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export function signToken(user: AuthUser) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.tokenTtl as jwt.SignOptions["expiresIn"],
  });
}

/** Reads the `Authorization: Bearer <token>` header and loads the (still active) user. */
export function requireAuth(db: Db): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Bearer ")) throw unauthorized();

    let userId: string;
    try {
      userId = jwt.verify(header.slice(7), config.jwtSecret).sub as string;
    } catch {
      throw unauthorized("Your session has expired, please log in again");
    }

    const [user] = await db.query("SELECT id, role FROM users WHERE id = $1 AND is_active", [userId]);
    if (!user) throw unauthorized("This account is no longer active");
    req.user = user;
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** The logged-in user. Only call behind requireAuth. */
export function me(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
