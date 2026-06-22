import { getRole as getRoleFromStorage, setRole as setRoleToStorage } from '../utils/auth';
class RoleStore {
    constructor() {
        this.role = getRoleFromStorage();
        this.listeners = new Set();
    }
    getState() {
        return { role: this.role };
    }
    setRole(role) {
        if (role === this.role)
            return;
        this.role = role;
        setRoleToStorage(role);
        this.listeners.forEach((l) => l(role));
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.role);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
export const roleStore = new RoleStore();
