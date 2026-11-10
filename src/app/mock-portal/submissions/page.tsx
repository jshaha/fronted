import { listSubmissions } from '@/lib/mockPortal/store';
import styles from '../portal.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: { absolute: 'Submitted Expense Reports — ASUC Portal (Mock)' },
};

export default function SubmissionsPage() {
  const submissions = listSubmissions();

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.mockBanner}>
        MOCK SYSTEM — for the Fronted demo. Not affiliated with ASUC or UC Berkeley.
      </div>

      <div className={styles.headerBar}>
        <h1 className={styles.headerText}>ASUC Financial Services · Student Organization Portal</h1>
      </div>

      <div className={styles.breadcrumb}>
        Home › Finance › Expense Reports › Submitted
      </div>

      <div className={styles.container}>
        <nav className={styles.sidebar}>
          <ul className={styles.sidebarNav}>
            <li className={styles.sidebarNavItem}>
              <a href="#home">Home</a>
            </li>
            <li className={styles.sidebarNavItem}>
              <a href="#finance">Finance</a>
            </li>
            <li className={styles.sidebarNavItem}>
              <a href="#reports">Expense Reports</a>
            </li>
            <li className={styles.sidebarNavItem}>
              <a href="#settings">Settings</a>
            </li>
            <li className={styles.sidebarNavItem}>
              <a href="#help">Help & Support</a>
            </li>
          </ul>
        </nav>

        <main className={styles.main}>
          <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: 'bold' }}>
            Submitted Expense Reports (Mock)
          </h2>

          {submissions.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>
              No expense reports submitted yet.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '1px solid var(--border-grey, #d0d0d0)',
                  backgroundColor: '#fff',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #d0d0d0' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderRight: '1px solid #d0d0d0' }}>
                      Confirmation ID
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderRight: '1px solid #d0d0d0' }}>
                      External Reference
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderRight: '1px solid #d0d0d0' }}>
                      Payment Method
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderRight: '1px solid #d0d0d0' }}>
                      Amount
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', borderRight: '1px solid #d0d0d0' }}>
                      Vendor
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                      Date Submitted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => {
                    const fields = JSON.parse(sub.fieldsJson);
                    const createdDate = new Date(sub.createdAt);
                    const formattedDate = createdDate.toLocaleString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <tr key={sub.id} style={{ borderBottom: '1px solid #d0d0d0' }}>
                        <td style={{ padding: '12px', borderRight: '1px solid #d0d0d0', fontFamily: "'Courier New', monospace", fontSize: '14px' }}>
                          {sub.confirmationId}
                        </td>
                        <td style={{ padding: '12px', borderRight: '1px solid #d0d0d0' }}>
                          {sub.externalRef}
                        </td>
                        <td style={{ padding: '12px', borderRight: '1px solid #d0d0d0' }}>
                          {fields.payment_method || '—'}
                        </td>
                        <td style={{ padding: '12px', borderRight: '1px solid #d0d0d0' }}>
                          ${fields.amount || '0.00'}
                        </td>
                        <td style={{ padding: '12px', borderRight: '1px solid #d0d0d0' }}>
                          {fields.vendor || '—'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {formattedDate}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: '24px' }}>
            <a href="/mock-portal" style={{ color: '#1f3a68', textDecoration: 'underline' }}>
              ← Back to new report
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
