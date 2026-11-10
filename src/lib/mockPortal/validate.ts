/**
 * Pure server-side validation for the mock ASUC portal submission.
 * No database access; returns {fieldName: errorMessage} or empty object for valid.
 */

import { PORTAL_ERRORS, PORTAL_FIELDS, visibleFields } from './fields';

export interface ValidationResult {
  [fieldName: string]: string;
}

export function validateSubmission(
  fields: Record<string, string>,
  receipt: { name: string; type: string; size: number } | null,
): ValidationResult {
  const errors: ValidationResult = {};
  const paymentMethod = fields.payment_method?.trim() || '';

  // Get visible fields based on payment method
  const visibleFieldSet = visibleFields(paymentMethod);

  // Check each visible required field
  for (const field of visibleFieldSet) {
    if (!field.required) continue;

    const value = fields[field.name]?.trim() || '';

    // Special handling for checkboxes and file inputs
    if (field.kind === 'checkbox') {
      if (value !== 'on') {
        errors[field.name] = field.name === 'certify' ? PORTAL_ERRORS.certify : PORTAL_ERRORS.required(field.label);
      }
      continue;
    }

    if (field.kind === 'file') {
      if (!receipt) {
        errors[field.name] = PORTAL_ERRORS.required(field.label);
      }
      continue;
    }

    // All other required visible fields
    if (!value) {
      errors[field.name] = PORTAL_ERRORS.required(field.label);
    }
  }

  // Format-specific validations (for non-empty fields)

  // org_account: ASUC-ORG-####
  if (fields.org_account && fields.org_account.trim()) {
    if (!/^ASUC-ORG-\d{4}$/.test(fields.org_account.trim())) {
      errors.org_account = PORTAL_ERRORS.accountFormat;
    }
  }

  // submitter_email: email format
  if (fields.submitter_email && fields.submitter_email.trim()) {
    if (!isValidEmail(fields.submitter_email.trim())) {
      errors.submitter_email = PORTAL_ERRORS.emailFormat('Submitter Email');
    }
  }

  // payee_email: email format (if visible and non-empty)
  if (visibleFieldSet.some((f) => f.name === 'payee_email') && fields.payee_email && fields.payee_email.trim()) {
    if (!isValidEmail(fields.payee_email.trim())) {
      errors.payee_email = PORTAL_ERRORS.emailFormat('Payee Email');
    }
  }

  // transaction_date: MM/DD/YYYY
  if (fields.transaction_date && fields.transaction_date.trim()) {
    if (!/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(fields.transaction_date.trim())) {
      errors.transaction_date = PORTAL_ERRORS.dateFormat;
    }
  }

  // amount: #.##
  if (fields.amount && fields.amount.trim()) {
    if (!/^\d+\.\d{2}$/.test(fields.amount.trim())) {
      errors.amount = PORTAL_ERRORS.amountFormat;
    }
  }

  // card_last4: exactly 4 digits (if visible and non-empty)
  if (visibleFieldSet.some((f) => f.name === 'card_last4') && fields.card_last4 && fields.card_last4.trim()) {
    if (!/^\d{4}$/.test(fields.card_last4.trim())) {
      errors.card_last4 = PORTAL_ERRORS.last4Format;
    }
  }

  // payee_student_id: 8-10 digits (if visible and non-empty)
  if (visibleFieldSet.some((f) => f.name === 'payee_student_id') && fields.payee_student_id && fields.payee_student_id.trim()) {
    if (!/^\d{8,10}$/.test(fields.payee_student_id.trim())) {
      errors.payee_student_id = PORTAL_ERRORS.sidFormat;
    }
  }

  // Food & Events requires attendee count
  if (fields.budget_line?.trim() === 'Food & Events' && !fields.attendee_count?.trim()) {
    errors.attendee_count = PORTAL_ERRORS.attendeesRequiredForFood;
  }

  // attendee_count: must be digits if non-empty
  if (fields.attendee_count && fields.attendee_count.trim()) {
    if (!/^\d+$/.test(fields.attendee_count.trim())) {
      errors.attendee_count = PORTAL_ERRORS.attendeeCountFormat;
    }
  }

  // business_purpose: minimum 20 characters
  if (fields.business_purpose && fields.business_purpose.trim()) {
    if (fields.business_purpose.trim().length < 20) {
      errors.business_purpose = PORTAL_ERRORS.purposeTooShort;
    }
  }

  // receipt file type
  if (receipt && receipt.type && !['image/png', 'image/jpeg'].includes(receipt.type)) {
    errors.receipt = PORTAL_ERRORS.receiptType;
  }

  return errors;
}

function isValidEmail(email: string): boolean {
  // Simple email validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
