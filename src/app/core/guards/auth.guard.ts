import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitForReady();
  if (!auth.isSignedIn()) {
    // Decide which login page to redirect to based on the requested path.
    const target = state.url.startsWith('/super-admin') ? '/super-admin/login' : '/login';
    return router.createUrlTree([target], { queryParams: { returnTo: state.url } });
  }
  return true;
};
