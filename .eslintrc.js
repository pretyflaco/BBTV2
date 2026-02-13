module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
    jest: true,
  },
  ignorePatterns: [
    "node_modules/",
    ".next/",
    "out/",
    "coverage/",
    "*.config.js",
    "*.config.ts",
    "next.config.js",
    "postcss.config.js",
    "tailwind.config.js",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["@typescript-eslint", "import", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "next/core-web-vitals",
    "prettier",
  ],
  rules: {
    // TypeScript-specific rules
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-explicit-any": "error", // Phase 5b complete: all `any` eliminated; 6 justified exceptions use eslint-disable
    "@typescript-eslint/prefer-for-of": "error",
    "@typescript-eslint/unified-signatures": "error",
    "@typescript-eslint/no-extra-semi": "off", // Prettier handles this

    // Import rules
    "import/no-deprecated": "warn",
    "import/no-unresolved": "off", // TypeScript handles this
    "import/order": [
      "error",
      {
        "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
        "newlines-between": "always",
        "alphabetize": {
          order: "asc",
          caseInsensitive: true,
        },
      },
    ],

    // General rules (aligned with Blink)
    "prefer-arrow-callback": "error",
    "no-duplicate-imports": "error",
    "no-empty-function": ["error", { allow: ["arrowFunctions"] }],
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-param-reassign": "error",
    "no-return-await": "error",
    "no-throw-literal": "error",
    "no-void": "error",

    // Prettier integration
    "prettier/prettier": "error",

    // React rules
    "react/react-in-jsx-scope": "off", // Next.js handles this
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
  settings: {
    "react": {
      version: "detect",
    },
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
      },
      node: {
        paths: ["."],
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    },
  },
  overrides: [
    // Test files
    {
      files: [
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/*.test.ts",
        "**/*.test.js",
        "tests/**/*",
      ],
      env: {
        jest: true,
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "no-empty-function": "off",
      },
    },
    // JavaScript files (during migration)
    {
      files: ["**/*.js", "**/*.jsx"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
      },
    },
  ],
}
