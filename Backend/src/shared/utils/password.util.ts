import bcrypt from "bcrypt";
import { env } from "./env.js";

export function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, env.BCRYPT_SALT_ROUNDS);
}

export function comparePassword(plainTextPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
