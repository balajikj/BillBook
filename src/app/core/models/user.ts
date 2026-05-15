import { Timestamp } from '@angular/fire/firestore';
import { Role } from './role';

// User directory entry at /companies/{cid}/users/{uid}. The Cloud Function
// writes these documents alongside setting custom claims on the auth user.
export interface CompanyUser {
  uid: string;
  email: string;
  displayName: string;
  role: Exclude<Role, 'super-admin'>;
  createdAt?: Timestamp;
  createdBy?: string;
}
