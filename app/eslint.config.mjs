// Import necessary plugins and configurations
import globals from 'globals'; // For browser and Node.js global variables
import pluginJs from '@eslint/js'; // ESLint's core recommended rules
import tseslint from 'typescript-eslint'; // TypeScript specific ESLint plugins and parser

// Directly import the react plugin object
import pluginReact from 'eslint-plugin-react'; // React plugin for direct flat config use

import prettierPlugin from 'eslint-plugin-prettier'; // Runs Prettier as an ESLint rule
import prettierConfig from 'eslint-config-prettier'; // Disables ESLint rules that conflict with Prettier
// import tailwindPlugin from 'eslint-plugin-tailwindcss'; // ESLint rules for Tailwind CSS
import nextPlugin from '@next/eslint-plugin-next'; // ESLint rules for Next.js specific features
import hooksPlugin from 'eslint-plugin-react-hooks'; // Rules for React Hooks
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y'; // Accessibility rules for JSX
import promisePlugin from 'eslint-plugin-promise'; // Rules for better Promises and async/await

export default tseslint.config(
  {
    // Global ignores: Files and directories that ESLint should not process.
    // This typically includes build outputs, dependency directories, etc.
    ignores: ['node_modules/', 'dist/', '.next/', 'out/'],
  },
  {
    // Apply ESLint's recommended base JavaScript rules.
    ...pluginJs.configs.recommended,
  },
  {
    // Configuration specifically for TypeScript files.
    files: ['**/*.{ts,tsx}'], // Apply these rules only to .ts and .tsx files
    extends: [
      ...tseslint.configs.recommended, // Recommended TypeScript-specific rules
      ...tseslint.configs.stylistic, // Additional stylistic rules for TypeScript
    ],
    languageOptions: {
      // Configure the TypeScript parser for ESLint.
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json', // Path to your tsconfig.json file for type-aware linting
        ecmaFeatures: {
          jsx: true, // Enable JSX parsing
        },
      },
      // Define global variables available in the environment (e.g., `window`, `document`, `process`).
      globals: {
        ...globals.browser, // Browser global variables
        ...globals.node, // Node.js global variables
      },
    },
    rules: {
      // TypeScript specific custom rules and overrides.
      // Warn on unused variables, ignoring variables prefixed with `_`.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Warn on explicit use of `any` type, encouraging more specific types.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Disable the rule requiring explicit return types for functions. Can be too strict for React components.
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Disable the rule disallowing empty interfaces. Sometimes useful for extending.
      '@typescript-eslint/no-empty-interface': 'off',
      // Enforce consistent use of type imports (e.g., `import type { Type } from '...'`).
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Configuration specifically for React files.
    files: ['**/*.{js,jsx,ts,tsx}'], // Apply to JS/JSX/TS/TSX files
    plugins: {
      // Register React-related plugins directly.
      react: pluginReact, // Directly use the imported React plugin object
      'react-hooks': hooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    rules: {
      // Apply recommended React rules directly from the plugin object.
      ...pluginReact.configs.recommended.rules,
      // General React rules and overrides.
      // Disable `react/react-in-jsx-scope` as it's not needed with Next.js/React 17+.
      'react/react-in-jsx-scope': 'off',
      // Disable `react/prop-types` as TypeScript hndles type checking for props.
      'react/prop-types': 'off',
      // Enforce self-closing tags for components and HTML elements without children.
      'react/self-closing-comp': [
        'error',
        {
          component: true,
          html: true,
        },
      ],
      // Prevent unnecessary curly braces around string literals in JSX.
      'react/jsx-curly-brace-presence': [
        'error',
        { props: 'never', children: 'never' },
      ],

      // React Hooks specific rules.
      'react-hooks/rules-of-hooks': 'error', // Enforces rules of React Hooks (e.g., call at top level)
      'react-hooks/exhaustive-deps': 'off', // Warns about missing dependencies in Hooks (e.g., useEffect)

      // JSX Accessibility rules (from eslint-plugin-jsx-a11y).
      'jsx-a11y/alt-text': 'warn', // Warns if `alt` text is missing on `<img>` elements.
      // Configures `anchor-is-valid` for Next.js `Link` components.
      'jsx-a11y/anchor-is-valid': [
        'error',
        {
          components: ['Link'],
          specialLink: ['hrefLeft', 'hrefRight'],
          aspects: ['invalidHref', 'preferButton'],
        },
      ],
      'jsx-a11y/no-redundant-roles': 'error', // Prevents redundant ARIA roles.
      'jsx-a11y/aria-props': 'warn', // Warns about invalid ARIA props.
    },
    settings: {
      // Crucial for `eslint-plugin-react` to automatically detect your React version.
      react: {
        version: 'detect',
      },
    },
  },
  {
    // Configuration specifically for Next.js applications.
    files: ['**/*.{js,jsx,ts,tsx}'], // Apply to JS/JSX/TS/TSX files
    plugins: {
      '@next/next': nextPlugin, // Register the Next.js plugin
    },
    rules: {
      // Apply recommended Next.js rules and Web Vitals rules.
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // Custom Next.js rules and overrides.
      // Warn when using `<img>` instead of `next/image` for performance.
      '@next/next/no-img-element': 'warn',
      // Disable `no-html-link-for-pages` which can be too restrictive in some cases.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  // {
  //   // Configuration for Tailwind CSS best practices.
  //   files: ['**/*.{js,jsx,ts,tsx}'], // Apply to JS/JSX/TS/TSX files
  //   plugins: {
  //     tailwindcss: tailwindPlugin, // Register the Tailwind CSS plugin
  //   },
  //   rules: {
  //     // Apply recommended Tailwind CSS rules.
  //     ...tailwindPlugin.configs.recommended.rules,
  //     // Warn to enforce a consistent order for Tailwind class names (requires Prettier plugin).
  //     'tailwindcss/classnames-order': 'warn',
  //     // Disable `no-custom-classname` to allow custom classnames where necessary.
  //     'tailwindcss/no-custom-classname': 'off',
  //     // Prevent conflicting Tailwind class names (e.g., `flex block`).
  //     'tailwindcss/no-contradicting-classname': 'error',
  //   },
  //   settings: {
  //     tailwindcss: {
  //       // Configure utility functions that process Tailwind classes (e.g., for shadcn-ui).
  //       callees: ['cn', 'cva'],
  //       // Path to your Tailwind CSS configuration file.
  //       config: './tailwind.config.js',
  //     },
  //   },
  // },
  {
    // Configuration for improving Promise and async/await usage.
    files: ['**/*.{js,jsx,ts,tsx}'], // Apply to JS/JSX/TS/TSX files
    plugins: {
      promise: promisePlugin, // Register the Promise plugin
    },
    rules: {
      // Apply recommended Promise rules.
      ...promisePlugin.configs.recommended.rules,
      'promise/always-return': 'warn', // Warns if Promise callbacks don't return a value.
      'promise/no-return-wrap': 'warn', // Warns against unnecessary wrapping of returned Promises.
      'promise/param-names': 'error', // Enforces consistent parameter names for Promise callbacks.
    },
  },
  {
    // General code style and formatting rules not covered by other plugins.
    files: ['**/*.{js,jsx,ts,tsx}'], // Apply to JS/JSX/TS/TSX files
    rules: {
      // Naming conventions.
      // Enforce camelCase for variable names, ignoring properties and imports.
      camelcase: ['error', { properties: 'never', ignoreImports: true }],
      // Enforce PascalCase for constructor functions and class names.
      'new-cap': [
        'error',
        { newIsCap: true, capIsNew: false, properties: false },
      ],

      // General JavaScript best practices.
      'prefer-const': 'error', // Enforce `const` when a variable is not reassigned.
      // Warn on unused variables, ignoring variables prefixed with `_` (useful for destructuring or function parameters).
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Allow only `console.warn()` and `console.error()`, disallowing `console.log()`.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error', // Disallow `debugger` statements.
      eqeqeq: 'error', // Enforce strict equality (`===` and `!==`).
      'no-else-return': 'warn', // Warn against unnecessary `else` blocks after a `return`.
      'no-unneeded-ternary': 'error', // Disallow unneeded ternary expressions.
      'no-nested-ternary': 'warn', // Warn against deeply nested ternary expressions.
      'object-shorthand': 'error', // Enforce object shorthand syntax.
      'prefer-template': 'error', // Enforce template literals over string concatenation.
      'array-callback-return': 'error', // Ensure return statements in array method callbacks.
      'dot-notation': 'error', // Enforce dot notation when accessing object properties.
      'no-var': 'error', // Disallow `var` keyword, prefer `const` or `let`.
      'prefer-arrow-callback': 'error', // Prefer arrow functions for callbacks.
      'require-await': 'error', // Require `await` in `async` functions.

      // Disable import sorting rules, as they will be handled by Prettier with a sorting plugin.
      'import/order': 'off',
      'sort-imports': 'off',
    },
  },
  {
    // Prettier integration: This block ensures ESLint works harmoniously with Prettier.
    files: ['**/*.{js,jsx,ts,tsx,mjs}'], // Apply to all relevant code files
    extends: [
      prettierConfig, // Use `eslint-config-prettier` to disable conflicting ESLint rules.
    ],
    plugins: {
      prettier: prettierPlugin, // Enable `eslint-plugin-prettier`.
    },
    rules: {
      // Run Prettier as an ESLint rule, reporting any formatting inconsistencies as errors.
      'prettier/prettier': 'error',
    },
  }
);
