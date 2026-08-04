import type { User } from "../types/UserModel";

export interface UserRepository {
  getAll(): User[];
  saveAll(users: User[]): void;
}

/**
 * Pure in-memory repository — deliberately NOT localStorage. Holds its own
 * mutable copy of the seed dataset for the lifetime of the browser tab; a
 * page refresh resets back to the original mock data in mockUsers.ts. This
 * is intentional: User Management is frontend-only mock data by design (see
 * the module doc in userManagementService.ts), so nothing here should look
 * persistent across sessions.
 *
 * Swapping to a real backend later means writing a RestUserRepository that
 * implements this same interface (getAll/saveAll) against a PostgreSQL-backed
 * API — userStore.ts and everything above it never needs to change.
 */
export class InMemoryUserRepository implements UserRepository {
  private data: User[];

  constructor(seed: User[]) {
    // Defensive copy so mutating the returned arrays can never reach back
    // into the original mockUsers.ts module-level array.
    this.data = seed.map((user) => ({ ...user }));
  }

  getAll(): User[] {
    return this.data.map((user) => ({ ...user }));
  }

  saveAll(users: User[]): void {
    this.data = users.map((user) => ({ ...user }));
  }
}
