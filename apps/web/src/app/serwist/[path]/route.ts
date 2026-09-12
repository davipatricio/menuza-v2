/**
 * Serwist Route Handler. Serves the compiled service worker at `/serwist/<file>`.
 * The SW source lives at `src/app/sw.ts`.
 */
import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
    globDirectory: "public",
  },
);
