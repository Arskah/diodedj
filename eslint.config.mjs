import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const ro = /** @type {const} */ ("readonly");
const nodeGlobals = {
  process: ro,
  console: ro,
  Buffer: ro,
  __dirname: ro,
  __filename: ro,
  setTimeout: ro,
  clearTimeout: ro,
  setInterval: ro,
  clearInterval: ro,
  setImmediate: ro,
  clearImmediate: ro,
};

export default tseslint.config(
  {
    ignores: [
      "out/",
      "playwright-report/",
      "test-results/",
      "node_modules/",
      "vendor/",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: { globals: nodeGlobals },
  },
);
