import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateSubmission } from '@/lib/mockPortal/validate';
import { insertSubmission, findByExternalRef, listSubmissions } from '@/lib/mockPortal/store';
import { useFreshDb, closeDb } from '@/lib/db/client';
import { PORTAL_ERRORS } from '@/lib/mockPortal/fields';

describe('Mock Portal Validation', () => {
  describe('validateSubmission', () => {
    it('accepts a fully valid card submission', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '5678',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors).toEqual({});
    });

    it('rejects ISO date format (2026-11-15)', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '5678',
        vendor: 'Pizza Place',
        transaction_date: '2026-11-15',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors.transaction_date).toBe(PORTAL_ERRORS.dateFormat);
    });

    it('requires payee fields for personal funds', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'Personal Funds (Reimbursement)',
        payee_name: '',
        payee_email: '',
        payee_student_id: '',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);

      expect(errors.payee_name).toBe(PORTAL_ERRORS.required('Payee Full Name'));
      expect(errors.payee_email).toBe(PORTAL_ERRORS.required('Payee Email'));
      expect(errors.payee_student_id).toBe(PORTAL_ERRORS.required('Payee Student ID (SID)'));
      // card_last4 should NOT be required for personal funds
      expect(errors.card_last4).toBeUndefined();
    });

    it('requires card_last4 for program card', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors.card_last4).toBe(PORTAL_ERRORS.required('Card Last 4 Digits'));
    });

    it('requires attendee count for Food & Events', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '5678',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors.attendee_count).toBe(PORTAL_ERRORS.attendeesRequiredForFood);
    });

    it('requires receipt and certify', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '5678',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: '',
      };

      const errors = validateSubmission(fields, null);
      expect(errors.receipt).toBe(PORTAL_ERRORS.required('Itemized Receipt'));
      expect(errors.certify).toBe(PORTAL_ERRORS.certify);
    });

    it('validates email format', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'not-an-email',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '5678',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors.submitter_email).toBe(PORTAL_ERRORS.emailFormat('Submitter Email'));
    });

    it('validates account format', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'INVALID',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '5678',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors.org_account).toBe(PORTAL_ERRORS.accountFormat);
    });

    it('validates amount format', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '5678',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors.amount).toBe(PORTAL_ERRORS.amountFormat);
    });

    it('validates last4 format', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '56789',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors.card_last4).toBe(PORTAL_ERRORS.last4Format);
    });

    it('validates receipt file type', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '5678',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Team building meeting with the whole organization to discuss upcoming projects',
        certify: 'on',
      };

      const receipt = { name: 'receipt.pdf', type: 'application/pdf', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors.receipt).toBe(PORTAL_ERRORS.receiptType);
    });

    it('validates business purpose length', () => {
      const fields = {
        org_name: 'Test Org',
        org_account: 'ASUC-ORG-1234',
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
        external_ref: 'REF-001',
        payment_method: 'ASUC Program Card',
        card_last4: '5678',
        vendor: 'Pizza Place',
        transaction_date: '11/15/2026',
        amount: '50.00',
        budget_line: 'Food & Events',
        attendee_count: '12',
        event_name: 'Team Lunch',
        attendees: 'Department team',
        business_purpose: 'Too short',
        certify: 'on',
      };

      const receipt = { name: 'receipt.png', type: 'image/png', size: 50000 };
      const errors = validateSubmission(fields, receipt);
      expect(errors.business_purpose).toBe(PORTAL_ERRORS.purposeTooShort);
    });
  });
});

describe('Mock Portal Store', () => {
  beforeEach(() => {
    useFreshDb(':memory:');
  });

  afterEach(() => {
    closeDb();
  });

  it('inserts and retrieves a submission by external_ref', () => {
    const externalRef = 'EXT-REF-001';
    const fields = { org_name: 'Test Org', amount: '50.00' };

    const confirmationId = insertSubmission('v1', externalRef, fields, null);

    expect(confirmationId).toMatch(/^ASUC-EXP-26-\d{6}$/);

    const found = findByExternalRef(externalRef);
    expect(found).not.toBeNull();
    expect(found?.confirmationId).toBe(confirmationId);
    expect(found?.externalRef).toBe(externalRef);
    expect(JSON.parse(found?.fieldsJson || '{}')).toEqual(fields);
  });

  it('confirmation ID is computed from row ID: ASUC-EXP-26-(4800+id)', () => {
    const confirmationId = insertSubmission('v1', 'EXT-001', {}, null);
    // First row should have ID 1, so confirmation ID = 4800 + 1 = 4801
    expect(confirmationId).toBe('ASUC-EXP-26-004801');
  });

  it('returns null when external_ref not found', () => {
    const found = findByExternalRef('NONEXISTENT');
    expect(found).toBeNull();
  });

  it('lists all submissions', () => {
    insertSubmission('v1', 'EXT-001', { org_name: 'Org 1' }, null);
    insertSubmission('v1', 'EXT-002', { org_name: 'Org 2' }, null);

    const submissions = listSubmissions();
    expect(submissions).toHaveLength(2);
  });

  it('enforces unique external_ref constraint', () => {
    insertSubmission('v1', 'DUPLICATE', { org_name: 'Org 1' }, null);

    // Attempting to insert with the same external_ref should throw
    expect(() => {
      insertSubmission('v1', 'DUPLICATE', { org_name: 'Org 2' }, null);
    }).toThrow();
  });
});

describe('afterEach', () => {
  it('cleanup', () => {
    closeDb();
  });
});
