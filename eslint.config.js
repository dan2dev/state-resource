import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";

function onlyWarns(config) {
  return {
    ...config,
    rules: Object.fromEntries(
      Object.entries(config.rules || {}).map(([key, value]) => [
        key,
        value === "error" ? "warn" : value,
      ]),
    ),
  };
}

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  ...onlyWarns(pluginJs.configs.recommended),
  ...onlyWarns(tseslint.configs.recommended),
  ...onlyWarns(pluginReact.configs.flat.recommended),
];
