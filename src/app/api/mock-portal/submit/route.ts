/**
 * POST /api/mock-portal/submit
 * Handles expense report submission to the mock ASUC portal.
 * Parses multipart/form-data, validates, checks for duplicates, saves receipt, and stores in DB.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { validateSubmission } from '@/lib/mockPortal/validate';
import { insertSubmission, findByExternalRef } from '@/lib/mockPortal/store';
import { PORTAL_ERRORS } from '@/lib/mockPortal/fields';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

interface ErrorResponse {
  ok: false;
  errors: Record<string, string>;
  summary: string;
  duplicateOf?: string;
}

interface SuccessResponse {
  ok: true;
  confirmationId: string;
  externalRef: string;
}

export async function POST(request: Request): Promise<Response> {
  // Add artificial delay for legacy system feel
  const delay = process.env.MOCK_PORTAL_FAST !== '1' ? 600 : 0;
  if (delay > 0) {
    await new Promise((r) => setTimeout(r, delay));
  }

  try {
    // Parse form data
    const formData = await request.formData();
    const fields: Record<string, string> = {};
    let receipt: { name: string; type: string; size: number } | null = null;

    // Extract string fields and receipt file
    for (const [key, value] of formData.entries()) {
      if (key === 'receipt' && value instanceof File) {
        if (value.size > 0) {
          receipt = {
            name: value.name,
            type: value.type,
            size: value.size,
          };
        }
      } else if (typeof value === 'string') {
        fields[key] = value.trim();
      }
    }

    // Validate
    const errors = validateSubmission(fields, receipt);

    if (Object.keys(errors).length > 0) {
      return Response.json(
        {
          ok: false,
          errors,
          summary: PORTAL_ERRORS.summary,
        } as ErrorResponse,
        { status: 422 },
      );
    }

    // Check for duplicate external_ref
    const externalRef = fields.external_ref || '';
    if (externalRef) {
      const existing = findByExternalRef(externalRef);
      if (existing) {
        return Response.json(
          {
            ok: false,
            errors: {
              external_ref: PORTAL_ERRORS.duplicate(existing.confirmationId),
            },
            summary: PORTAL_ERRORS.summary,
            duplicateOf: existing.confirmationId,
          } as ErrorResponse,
          { status: 409 },
        );
      }
    }

    // If no external_ref provided, generate one
    let finalExternalRef = externalRef;
    if (!finalExternalRef) {
      finalExternalRef = `PORTAL-${Date.now()}-${randomUUID()}`;
    }

    // Save receipt file
    let receiptFileName: string | null = null;
    if (receipt) {
      const uploadDir = join(cwd(), 'data/uploads/portal');
      mkdirSync(uploadDir, { recursive: true });

      const fileData = await (formData.get('receipt') as File).arrayBuffer();
      const sanitizedName = receipt.name.replace(/[^a-z0-9.-]/gi, '_');
      const uuid = randomUUID();
      receiptFileName = `${uuid}-${sanitizedName}`;
      const filePath = join(uploadDir, receiptFileName);

      writeFileSync(filePath, Buffer.from(fileData));
    }

    // Insert submission
    const confirmationId = insertSubmission('v1', finalExternalRef, fields, receiptFileName || null);

    return Response.json(
      {
        ok: true,
        confirmationId,
        externalRef: finalExternalRef,
      } as SuccessResponse,
      { status: 200 },
    );
  } catch (err) {
    console.error('Error in /api/mock-portal/submit:', err);
    return Response.json(
      {
        ok: false,
        errors: { _server: 'Internal server error' },
        summary: 'An error occurred while processing your submission.',
      } as ErrorResponse,
      { status: 500 },
    );
  }
}
