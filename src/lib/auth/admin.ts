import 'server-only';
import { isAdmin } from '@/actions/auth';

export class AdminRequiredError extends Error {
  readonly status = 401;
  constructor() {
    super('Admin authorization required');
  }
}

/**
 * Throws AdminRequiredError unless the current request belongs to an admin.
 * Call at the top of every route handler / server action that writes data.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new AdminRequiredError();
}
