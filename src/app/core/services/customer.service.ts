import { Injectable, inject } from '@angular/core';
import {
  Firestore, addDoc, collection, collectionData, deleteDoc, doc, docData,
  orderBy, query, serverTimestamp, updateDoc
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Customer } from '../models/customer';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);

  private path(): string {
    const cid = this.auth.companyId();
    if (!cid) throw new Error('No companyId on the current user');
    return `companies/${cid}/customers`;
  }

  list$(): Observable<Customer[]> {
    const q = query(collection(this.db, this.path()), orderBy('name', 'asc'));
    return collectionData(q, { idField: 'id' }) as Observable<Customer[]>;
  }

  get$(customerId: string): Observable<Customer | undefined> {
    return docData(doc(this.db, this.path(), customerId), { idField: 'id' }) as Observable<Customer | undefined>;
  }

  async create(input: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<string> {
    const ref = await addDoc(collection(this.db, this.path()), {
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: this.auth.user()!.uid
    });
    return ref.id;
  }

  async update(id: string, patch: Partial<Omit<Customer, 'id'>>): Promise<void> {
    await updateDoc(doc(this.db, this.path(), id), { ...patch, updatedAt: serverTimestamp() });
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(this.db, this.path(), id));
  }
}
