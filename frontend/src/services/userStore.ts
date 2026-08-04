import type { User, AccountStatus } from "../types/UserModel";
import type { UserRepository } from "./userRepository";

/**
 * Reactive in-memory user store — mirrors the notifications module's
 * repository/store/service split (see notifications/notificationStore.ts)
 * so User Management gets the same "swap the repository later without
 * touching the UI" seam, but backed purely by memory instead of
 * localStorage per this feature's requirements.
 */
export class UserStore {
  private users: User[];
  private repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
    this.users = this.repo.getAll();
  }

  getAll(): User[] {
    return [...this.users];
  }

  getById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  create(user: User): void {
    this.users = [user, ...this.users];
    this.persistAndEmit();
  }

  update(id: string, patch: Partial<User>): User | undefined {
    let updated: User | undefined;
    this.users = this.users.map((user) => {
      if (user.id !== id) return user;
      updated = { ...user, ...patch, lastModifiedAt: new Date().toISOString() };
      return updated;
    });
    this.persistAndEmit();
    return updated;
  }

  remove(id: string): void {
    this.users = this.users.filter((u) => u.id !== id);
    this.persistAndEmit();
  }

  setStatus(id: string, status: AccountStatus): void {
    this.update(id, { status });
  }

  private persistAndEmit() {
    this.repo.saveAll(this.users);
    // Reuses the app-wide "pmo:data-changed" event (Projects/Customers/etc.
    // all dispatch the same one) rather than inventing a users-only event,
    // so User Management stays consistent with every other module's
    // live-refresh wiring.
    window.dispatchEvent(new Event("pmo:data-changed"));
  }
}
