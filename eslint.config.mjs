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
       * Blocking. Every former site was rewritten in the forms React prescribes:
       *
       *  - values saved in the browser are read through `useStoredValue`
       *    (useSyncExternalStore), never copied into state after mount;
       *  - the wall clock comes from `useNow`, likewise;
       *  - state that must reset when a prop changes is adjusted during render
       *    (the "previous value" pattern), not one render late in an effect;
       *  - native <dialog> open/close stays in effects — that sets no state.
       */
      "react-hooks/set-state-in-effect": "error",
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
