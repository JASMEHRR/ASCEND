/**
 * Firestore layer for custom modules — one generic collection per user plus
 * one generic entries subcollection per module, since every kind (tracker,
 * list, counter, chart) shares the same CustomEntry shape.
 *
 *   users/{uid}/customModules/{moduleId}
 *   users/{uid}/customModules/{moduleId}/entries/{entryId}
 *
 * Both are covered by the existing blanket users/{userId}/{document=**} rule
 * — no firestore.rules change needed for this feature.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { CustomEntry, CustomModule, CustomModuleKind } from './types';

const KINDS: CustomModuleKind[] = ['tracker', 'list', 'counter', 'chart'];

/** Guards against a malformed kind ever reaching Firestore, from Jarvis or otherwise. */
export function isValidKind(kind: unknown): kind is CustomModuleKind {
  return typeof kind === 'string' && (KINDS as string[]).includes(kind);
}

export const modulesPath = (uid: string) => `users/${uid}/customModules`;
export const entriesPath = (uid: string, moduleId: string) => `${modulesPath(uid)}/${moduleId}/entries`;

export async function createModule(
  uid: string,
  data: Omit<CustomModule, 'id' | 'createdAt'>,
): Promise<CustomModule> {
  const ref = doc(collection(db, modulesPath(uid)));
  const body = { ...data, createdAt: new Date().toISOString() };
  await setDoc(ref, body);
  return { id: ref.id, ...body };
}

export async function deleteModule(uid: string, moduleId: string): Promise<void> {
  await deleteDoc(doc(db, modulesPath(uid), moduleId));
}

export function subscribeModules(uid: string, cb: (modules: CustomModule[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, modulesPath(uid)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomModule, 'id'>) }))),
    () => cb([]),
  );
}

export async function addEntry(uid: string, moduleId: string, entry: Omit<CustomEntry, 'id'>): Promise<void> {
  await addDoc(collection(db, entriesPath(uid, moduleId)), entry);
}

export async function deleteEntry(uid: string, moduleId: string, entryId: string): Promise<void> {
  await deleteDoc(doc(db, entriesPath(uid, moduleId), entryId));
}

export async function updateEntry(
  uid: string,
  moduleId: string,
  entryId: string,
  fields: Partial<CustomEntry>,
): Promise<void> {
  await setDoc(doc(db, entriesPath(uid, moduleId), entryId), fields, { merge: true });
}

export function subscribeEntries(uid: string, moduleId: string, cb: (entries: CustomEntry[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, entriesPath(uid, moduleId)), orderBy('at', 'desc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomEntry, 'id'>) }))),
    () => cb([]),
  );
}

export async function listEntries(uid: string, moduleId: string): Promise<CustomEntry[]> {
  const snap = await getDocs(query(collection(db, entriesPath(uid, moduleId)), orderBy('at', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomEntry, 'id'>) }));
}
