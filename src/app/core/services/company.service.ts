import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, docData, getDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Company, CompanyStatus } from '../models/company';

function quote(value: string): string {
  if (!/[\s"']/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly db = inject(Firestore);

  async getGate(companyCode: string): Promise<Company | null> {
    const snap = await getDoc(doc(this.db, `companies/${companyCode}`));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Company, 'id'>) };
  }

  listAll$(): Observable<Company[]> {
    const col = collection(this.db, 'companies');
    return collectionData(col, { idField: 'id' }) as Observable<Company[]>;
  }

  get$(companyCode: string): Observable<Company | undefined> {
    return docData(doc(this.db, `companies/${companyCode}`), { idField: 'id' }) as Observable<Company | undefined>;
  }

  // ----- write paths: operator CLI commands -----
  //
  // Writing custom claims requires the Admin SDK. Until the project is on the
  // Blaze plan (and the setUserClaims Cloud Function is deployed), the super-admin
  // UI surfaces a copy-pasteable `admin-ops.mjs` command instead of mutating
  // directly. The operator runs it on a workstation with service-account.json.

  generateCreateCompanyCommand(args: {
    companyCode: string;
    companyName: string;
    defaultCurrency: string;
    adminEmail: string;
    adminDisplayName: string;
  }): string {
    return [
      'node admin-ops.mjs create-company',
      quote(args.companyCode),
      quote(args.companyName),
      quote(args.defaultCurrency),
      quote(args.adminEmail),
      quote(args.adminDisplayName)
    ].join(' ');
  }

  generateSetStatusCommand(companyCode: string, status: CompanyStatus): string {
    return `node admin-ops.mjs set-company-status ${quote(companyCode)} ${status}`;
  }

  generateCreateCompanyAdminCommand(args: {
    companyCode: string;
    email: string;
    displayName: string;
  }): string {
    return [
      'node admin-ops.mjs create-company-admin',
      quote(args.companyCode),
      quote(args.email),
      quote(args.displayName)
    ].join(' ');
  }
}
