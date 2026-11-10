'use client';

import { useState, useRef, useEffect } from 'react';
import { PORTAL_FIELDS, PORTAL_SECTIONS, SUBMIT_BUTTON_LABEL, SAVE_DRAFT_BUTTON_LABEL, visibleFields, PORTAL_ERRORS } from '@/lib/mockPortal/fields';
import styles from './portal.module.css';

interface FormErrors {
  [fieldName: string]: string;
}

interface SubmissionSuccess {
  confirmationId: string;
  externalRef: string;
}

export default function PortalForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<SubmissionSuccess | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHydrated(true), 0);
    return () => clearTimeout(t);
  }, []);
  const paymentMethod = formData.payment_method || '';

  // Get visible fields based on payment method
  const visibleFieldSet = visibleFields(paymentMethod);

  // Handle field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === 'checkbox' ? ((e.target as HTMLInputElement).checked ? 'on' : '') : value;
    setFormData((prev) => ({ ...prev, [name]: newValue }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSubmitting(true);
    setErrors({});

    try {
      // Build FormData from the form element
      const formDataToSend = new FormData(formRef.current!);

      // Ensure all form fields are included
      for (const [key, value] of Object.entries(formData)) {
        if (!formDataToSend.has(key)) {
          formDataToSend.set(key, value);
        }
      }

      const response = await fetch('/api/mock-portal/submit', {
        method: 'POST',
        body: formDataToSend,
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle error response
        if (data.errors) {
          setErrors(data.errors);

          // Focus first error field
          const firstErrorField = Object.keys(data.errors)[0];
          if (firstErrorField) {
            const element = formRef.current?.querySelector(`[name="${firstErrorField}"]`) as HTMLElement;
            if (element) {
              setTimeout(() => element.focus(), 0);
            }
          }
        }
      } else {
        // Success
        setSuccess({
          confirmationId: data.confirmationId,
          externalRef: data.externalRef,
        });
      }
    } catch (err) {
      console.error('Submission error:', err);
      setErrors({ _server: 'An error occurred while submitting your form.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle draft save
  const handleSaveDraft = () => {
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  };

  if (success) {
    return (
      <div className={styles.confirmationPanel} role="status">
        <h2 className={styles.confirmationHeading}>Expense Report Submitted</h2>
        <p className={styles.confirmationText}>Your confirmation number is <strong className={styles.confirmationId} id="confirmation-number" data-confirmation-id={success.confirmationId}>{success.confirmationId}</strong></p>
        {success.externalRef && (
          <p className={styles.confirmationText}>Reference: <strong>{success.externalRef}</strong></p>
        )}
        <a href="/mock-portal" className={styles.confirmationLink}>
          File another report
        </a>
      </div>
    );
  }

  const hasErrors = Object.keys(errors).some((key) => errors[key]);
  const errorList = Object.entries(errors)
    .filter(([_, msg]) => msg)
    .map(([key, msg]) => ({ key, msg }));

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      data-portal-form="v1"
      data-hydrated={hydrated ? 'true' : undefined}
      aria-describedby={hasErrors ? 'error-summary' : undefined}
      className={styles.control}
    >
      {hasErrors && (
        <div className={styles.errorSummary} id="error-summary" role="alert">
          <p className={styles.errorSummaryTitle}>{PORTAL_ERRORS.summary}</p>
          <ul className={styles.errorSummaryList}>
            {errorList.map(({ key, msg }) => (
              <li key={key}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {PORTAL_SECTIONS.map((section) => {
        const sectionFields = visibleFieldSet.filter((f) => f.section === section.id);
        if (sectionFields.length === 0) return null;

        return (
          <fieldset key={section.id} className={styles.section}>
            <legend className={styles.sectionLegend}>{section.title}</legend>
            <div className={styles.sectionContent}>
              {sectionFields.map((field) => {
                const fieldError = errors[field.name] || '';
                const helpId = field.help ? `help-${field.name}` : undefined;
                const errorId = fieldError ? `error-${field.name}` : undefined;
                const ariaDescribedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

                if (field.kind === 'checkbox') {
                  return (
                    <div key={field.name} className={styles.fieldGroup}>
                      <div className={styles.control}>
                        <div className={styles.checkboxGroup}>
                          <input
                            type="checkbox"
                            id={`field-${field.name}`}
                            name={field.name}
                            checked={formData[field.name] === 'on'}
                            onChange={handleChange}
                            aria-required={field.required}
                            aria-invalid={!!fieldError}
                            aria-describedby={ariaDescribedBy}
                          />
                          <label htmlFor={`field-${field.name}`} className={styles.checkboxLabel}>
                            {field.label}
                          </label>
                        </div>
                        {fieldError && (
                          <span id={`error-${field.name}`} className={styles.error}>
                            {fieldError}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                if (field.kind === 'file') {
                  return (
                    <div key={field.name} className={styles.fieldGroup}>
                      <div className={styles.label}>
                        <label htmlFor={`field-${field.name}`}>{field.label}</label>
                        {field.required && <span aria-hidden="true" className={styles.required}>*</span>}
                      </div>
                      <div className={styles.control}>
                        <input
                          type="file"
                          id={`field-${field.name}`}
                          name={field.name}
                          accept="image/png,image/jpeg"
                          aria-required={field.required}
                          aria-invalid={!!fieldError}
                          aria-describedby={ariaDescribedBy}
                        />
                        {field.help && (
                          <small id={helpId} className={styles.help}>
                            {field.help}
                          </small>
                        )}
                        {fieldError && (
                          <span id={`error-${field.name}`} className={styles.error}>
                            {fieldError}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                if (field.kind === 'select') {
                  return (
                    <div key={field.name} className={styles.fieldGroup}>
                      <div className={styles.label}>
                        <label htmlFor={`field-${field.name}`}>{field.label}</label>
                        {field.required && <span aria-hidden="true" className={styles.required}>*</span>}
                      </div>
                      <div className={styles.control}>
                        <select
                          id={`field-${field.name}`}
                          name={field.name}
                          value={formData[field.name] || ''}
                          onChange={handleChange}
                          aria-required={field.required}
                          aria-invalid={!!fieldError}
                          aria-describedby={ariaDescribedBy}
                        >
                          {field.options?.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        {field.help && (
                          <small id={helpId} className={styles.help}>
                            {field.help}
                          </small>
                        )}
                        {fieldError && (
                          <span id={`error-${field.name}`} className={styles.error}>
                            {fieldError}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                if (field.kind === 'textarea') {
                  return (
                    <div key={field.name} className={styles.fieldGroup}>
                      <div className={styles.label}>
                        <label htmlFor={`field-${field.name}`}>{field.label}</label>
                        {field.required && <span aria-hidden="true" className={styles.required}>*</span>}
                      </div>
                      <div className={styles.control}>
                        <textarea
                          id={`field-${field.name}`}
                          name={field.name}
                          value={formData[field.name] || ''}
                          onChange={handleChange}
                          rows={3}
                          aria-required={field.required}
                          aria-invalid={!!fieldError}
                          aria-describedby={ariaDescribedBy}
                        />
                        {field.help && (
                          <small id={helpId} className={styles.help}>
                            {field.help}
                          </small>
                        )}
                        {fieldError && (
                          <span id={`error-${field.name}`} className={styles.error}>
                            {fieldError}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                // Default: text input
                return (
                  <div key={field.name} className={styles.fieldGroup}>
                      <div className={styles.label}>
                      <label htmlFor={`field-${field.name}`}>{field.label}</label>
                      {field.required && <span aria-hidden="true" className={styles.required}>*</span>}
                    </div>
                    <div className={styles.control}>
                      <input
                        type="text"
                        id={`field-${field.name}`}
                        name={field.name}
                        value={formData[field.name] || ''}
                        onChange={handleChange}
                        aria-required={field.required}
                        aria-invalid={!!fieldError}
                        aria-describedby={ariaDescribedBy}
                      />
                      {field.help && (
                        <small id={helpId} className={styles.help}>
                          {field.help}
                        </small>
                      )}
                      {fieldError && (
                        <span id={`error-${field.name}`} className={styles.error}>
                          {fieldError}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className={styles.buttons}>
        <button
          className={styles.submitButton}
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting && <span className={styles.spinner} aria-hidden="true" />}
          {SUBMIT_BUTTON_LABEL}
        </button>
        <button
          className={styles.draftButton}
          type="button"
          onClick={handleSaveDraft}
        >
          {SAVE_DRAFT_BUTTON_LABEL}
        </button>
        <a href="/mock-portal" className={styles.buttonLink}>
          Cancel
        </a>
      </div>

      {draftSaved && (
        <div className={`${styles.draftStatus} ${styles.show}`} role="status" aria-live="polite">
          Draft saved (not submitted).
        </div>
      )}
    </form>
  );
}
