import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../models/role';

export function roleGuard(allowed: Role[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.waitForReady();
    const role = auth.role();
    if (!role || !allowed.includes(role)) {
      // Send them somewhere they CAN see, or to login.
      if (role === 'super-admin') return router.createUrlTree(['/super-admin/companies']);
      if (role === 'company-admin') return router.createUrlTree(['/app/dashboard']);
      if (role === 'company-user') return router.createUrlTree(['/app/invoices']);
      return router.createUrlTree(['/login']);
    }
    return true;
  };
}
