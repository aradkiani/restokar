import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * ESLint flat config.
 *
 * `eslint-config-next` v16 ships native flat-config arrays, so they are spread
 * directly — no FlatCompat bridge.
 *
 * @type {import("eslint").Linter.Config[]}
 */
const config = [
  {
    // Prisma's generated client is ~40 machine-written files. Linting them
    // buries every real finding under thousands of generated-code warnings.
    ignores: [
      ".next/**",
      "node_modules/**",
      "src/generated/**",
      "next-env.d.ts",
      "public/**",
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      // Unused code should fail the lint, but a deliberately ignored argument
      // or a destructured rest sibling is a legitimate pattern.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      // `any` erases the type safety the rest of the codebase depends on.
      "@typescript-eslint/no-explicit-any": "error",
      // Debug output must not ship; warn/error are the intended channels.
      "no-console": ["error", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],

      /**
       * Advisory rather than blocking.
       *
       * This React Compiler rule fires on several patterns React's own
       * documentation still prescribes, and which this app genuinely needs:
       *
       *  - reading localStorage after mount (it cannot be read while
       *    server-rendering) — cart contents, remembered guest name
       *  - driving a native <dialog> via showModal/close, an external system
       *  - resetting a draft when a different product sheet is opened
       *  - closing the mobile drawer in response to navigation
       *
       * Each remaining site is deliberate and commented. Leaving this at
       * "error" would mean nine scattered disable comments; deleting it would
       * lose the signal for genuinely accidental cascades. Warning keeps it
       * visible without blocking. The one site that was reducible to derived
       * state — the menu builder's active category — was fixed instead.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },

  {
    // Seed and maintenance scripts are operator tools: their console output is
    // the interface, and they are never bundled into the app.
    files: ["prisma/**/*.ts", "scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },

  // Must stay last: switches off stylistic rules that would fight Prettier.
  prettier,
];

export default config;
