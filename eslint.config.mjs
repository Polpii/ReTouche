import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // on récupère les configs "next"  
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Ajoute ce bloc pour désactiver `any` partout
  {
    rules: {
      "@typescript-eslint/no-explicit-any":        "off",
      "@typescript-eslint/no-unused-vars":        "off",
      "prefer-const":                              "off",
      "react-hooks/exhaustive-deps":               "off",
      "react/jsx-no-comment-textnodes":            "off",
      "@typescript-eslint/no-empty-object-type":   "off",
      "@typescript-eslint/no-unused-expressions":  "off",
      "@next/next/no-img-element":                 "off",
    },
  },
];

export default eslintConfig;
