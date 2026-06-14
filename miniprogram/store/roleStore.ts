import { getRole as getRoleFromStorage, setRole as setRoleToStorage } from '../utils/auth';
import type { UserRole } from '../shared/roles';

type Listener = (role: UserRole) => void;

class RoleStore {
  private role: UserRole = getRoleFromStorage();
  private listeners = new Set<Listener>();

  getState(): { role: UserRole } {
    return { role: this.role };
  }

  setRole(role: UserRole) {
    if (role === this.role) return;
    this.role = role;
    setRoleToStorage(role);
    this.listeners.forEach((l) => l(role));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.role);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const roleStore = new RoleStore();

