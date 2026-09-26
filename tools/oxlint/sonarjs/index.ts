import { eslintCompatPlugin } from "@oxlint/plugins";
import sonarjs from "eslint-plugin-sonarjs";

/**
 * SonarJS rules re-exposed as an Oxlint JS plugin.
 *
 * `eslint-plugin-sonarjs` is already an ESLint v9-compatible plugin, and oxlint
 * runs it through the standard `jsPlugins` path. This wrapper exists only to
 * (a) register the upstream rules under a stable `sonarjs/*` namespace and
 * (b) match the `createOnce` lifecycle used by the sibling `anti-slop` plugin.
 *
 * Type-aware rules (the ones marked with a type glyph in the upstream rule
 * table) are intentionally NOT enabled: oxlint JS plugins have no access to
 * TypeScript type information. See `SONARJS_CURATED_FUTURE.md`.
 */
const sonarjsPlugin = eslintCompatPlugin({
  meta: { name: "sonarjs" },
  rules: (sonarjs as unknown as { rules: Record<string, never> }).rules,
});

export default sonarjsPlugin;
