import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, orderBy, query } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { CompanyUser } from '../models/user';
import { AuthService } from './auth.service';

function quote(value: string): string {
  if (!/[\s"']/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);

  list$(): Observable<CompanyUser[]> {
    const cid = this.auth.companyId();
    if (!cid) throw new Error('No companyId');
    const q = query(collection(this.db, `companies/${cid}/users`), orderBy('createdAt', 'desc'));
    return collectionData(q) as Observable<CompanyUser[]>;
  }

  // ----- write paths: operator CLI commands -----
  // See company.service.ts for the rationale (no Cloud Function deployed).

  generateCreateUserCommand(input: { email: string; displayName: string }): string {
    const cid = this.auth.companyId();
    if (!cid) throw new Error('No companyId');
    return [
      'node admin-ops.mjs create-company-user',
      quote(cid),
      quote(input.email),
      quote(input.displayName)
    ].join(' ');
  }

  generateRemoveUserCommand(uid: string): string {
    const cid = this.auth.companyId();
    if (!cid) throw new Error('No companyId');
    return `node admin-ops.mjs remove-company-user ${quote(cid)} ${quote(uid)}`;
  }
}
