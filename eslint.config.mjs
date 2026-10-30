import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          { group: ['*/testdata/*', '*/testdata'], message: 'Test data must not be imported in production components. Use API endpoints instead.' },
          { group: ['*/mock-service/*', '*/mock-service'], message: 'Mock service must not be imported in production components.' },
          { group: ['*/fixtures', '*/fixtures.ts'], message: 'Import only types from fixtures.ts, not FIXTURE_ constants. Those are removed.', allowTypeImports: true },
        ],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
