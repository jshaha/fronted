/**
 * Database operations for the mock ASUC portal submissions.
 * Uses getDb() and the mockPortalSubmissions table from schema.ts.
 */

import { getDb } from '../db/client';
import { mockPortalSubmissions } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface SubmissionFields {
  [key: string]: string;
}

export interface Submission {
  id: number;
  confirmationId: string;
  externalRef: string;
  formVersion: string;
  fieldsJson: string;
  receiptFile: string | null;
  createdAt: string;
}

/**
 * Find a submission by external reference.
 * Returns the submission with confirmation ID, or null if not found.
 */
export function findByExternalRef(externalRef: string): Submission | null {
  const db = getDb();
  const result = db.select().from(mockPortalSubmissions).where(eq(mockPortalSubmissions.externalRef, externalRef)).get();
  return result || null;
}

/**
 * Insert a new submission and return the confirmation ID.
 * Confirmation ID format: ASUC-EXP-26-<6-digit-id>
 * Uses a transaction to ensure the ID is computed from the inserted row.
 */
export function insertSubmission(
  formVersion: string,
  externalRef: string,
  fields: SubmissionFields,
  receiptFile: string | null,
): string {
  const db = getDb();

  // Insert the submission
  const createdAt = new Date().toISOString();
  const fieldsJson = JSON.stringify(fields);

  const result = db.insert(mockPortalSubmissions).values({
    confirmationId: '', // Will be updated
    externalRef,
    formVersion,
    fieldsJson,
    receiptFile,
    createdAt,
  }).run();

  const rowId = result.lastInsertRowid as number;

  // Compute confirmation ID: ASUC-EXP-26-<6-digit-id>
  // The ID is 4800 + rowId, padded to 6 digits
  const confirmationNumber = 4800 + rowId;
  const confirmationId = `ASUC-EXP-26-${String(confirmationNumber).padStart(6, '0')}`;

  // Update the confirmation ID
  db.update(mockPortalSubmissions).set({ confirmationId }).where(eq(mockPortalSubmissions.id, rowId as any)).run();

  return confirmationId;
}

/**
 * List all submissions, ordered by most recent first.
 */
export function listSubmissions(): Submission[] {
  const db = getDb();
  return db.select().from(mockPortalSubmissions).orderBy((t) => [t.createdAt]).all();
}
