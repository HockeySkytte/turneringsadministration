import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Repo-only helpers & artifacts (not app/runtime code):
    "scripts/**",
    "Testdata/**",

    // Legacy floorball-platform code (to be deleted as we rebuild):
    "src/components/stats/**",
    "src/components/taktiktavle/**",
    "src/components/spiller/**",
    "src/components/kampe/**",

    "src/app/(app)/spiller/**",
    "src/app/(app)/leder/**",
    "src/app/(app)/taktiktavle/**",
    "src/app/(app)/kampe/**",

    "src/app/api/stats/**",
    "src/app/api/player/**",
    "src/app/api/leader/**",
    "src/app/api/matches/**",
    "src/app/api/json-documents/**",
    "src/app/api/admin/approve/**",
    "src/app/api/admin/memberships/**",
    "src/app/api/admin/pending-leaders/**",
    "src/app/api/admin/teams/**",
  ]),
]);

export default eslintConfig;
