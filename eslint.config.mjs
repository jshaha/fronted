import next from 'eslint-config-next';
export default [...next, { rules: { '@next/next/no-img-element': 'off' } }, { files: ['src/lib/**', 'scripts/**', 'tests/**', 'worker/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } }, { ignores: ['.next/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] }];
