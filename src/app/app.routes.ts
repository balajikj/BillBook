import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { rootRedirect } from './core/guards/root-redirect.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [rootRedirect],
    children: []
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent),
    title: 'Sign in — BillEasy'
  },
  {
    path: 'super-admin/login',
    loadComponent: () => import('./features/super-admin/login/super-admin-login.component').then(m => m.SuperAdminLoginComponent),
    title: 'Super Admin Sign in — BillEasy'
  },
  {
    path: 'super-admin',
    canActivate: [authGuard, roleGuard(['super-admin'])],
    loadComponent: () => import('./features/super-admin/super-admin-shell.component').then(m => m.SuperAdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'companies' },
      {
        path: 'companies',
        loadComponent: () => import('./features/super-admin/companies/companies.component').then(m => m.CompaniesComponent),
        title: 'Companies — BillEasy Super Admin'
      }
    ]
  },
  {
    path: 'app',
    canActivate: [authGuard, roleGuard(['company-admin', 'company-user'])],
    loadComponent: () => import('./features/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'invoices' },
      {
        path: 'dashboard',
        canActivate: [roleGuard(['company-admin'])],
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
        title: 'Dashboard — BillEasy'
      },
      {
        path: 'invoices',
        loadComponent: () => import('./features/invoices/invoice-list.component').then(m => m.InvoiceListComponent),
        title: 'Invoices — BillEasy'
      },
      {
        path: 'invoices/new',
        loadComponent: () => import('./features/invoices/invoice-form.component').then(m => m.InvoiceFormComponent),
        title: 'New invoice — BillEasy'
      },
      {
        path: 'invoices/:id',
        loadComponent: () => import('./features/invoices/invoice-detail.component').then(m => m.InvoiceDetailComponent),
        title: 'Invoice — BillEasy'
      },
      {
        path: 'customers',
        canActivate: [roleGuard(['company-admin'])],
        loadComponent: () => import('./features/customers/customer-list.component').then(m => m.CustomerListComponent),
        title: 'Customers — BillEasy'
      },
      {
        path: 'products',
        canActivate: [roleGuard(['company-admin'])],
        loadComponent: () => import('./features/products/product-list.component').then(m => m.ProductListComponent),
        title: 'Products — BillEasy'
      },
      {
        path: 'users',
        canActivate: [roleGuard(['company-admin'])],
        loadComponent: () => import('./features/users/user-list.component').then(m => m.UserListComponent),
        title: 'Users — BillEasy'
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
