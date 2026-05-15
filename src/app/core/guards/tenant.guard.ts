import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Stub: in MVP, tenant binding is implicit in the user's claim — there are
// no routes with an explicit companyId segment. Reserved for future super-admin
// "view as company" deep-links.
export const tenantGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const routeCompanyId = route.paramMap.get('companyId');
  if (!routeCompanyId) return true;
  const claim = auth.companyId();
  if (claim && claim === routeCompanyId) return true;
  return router.createUrlTree(['/']);
};
