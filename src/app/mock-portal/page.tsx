import PortalForm from './PortalForm';
import styles from './portal.module.css';

export const metadata = {
  title: { absolute: 'New Expense Report — ASUC Portal (Mock)' },
};

export const dynamic = 'force-dynamic';

export default function MockPortalPage() {
  return (
    <div className={styles.pageWrapper}>
      <div className={styles.mockBanner}>
        MOCK SYSTEM — for the Fronted demo. Not affiliated with ASUC or UC Berkeley.
      </div>

      <div className={styles.headerBar}>
        <h1 className={styles.headerText}>ASUC Financial Services · Student Organization Portal</h1>
      </div>

      <div className={styles.breadcrumb}>
        Home › Finance › Expense Reports › New
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
          <div className={styles.formContainer}>
            <PortalForm />
          </div>
        </main>
      </div>
    </div>
  );
}
