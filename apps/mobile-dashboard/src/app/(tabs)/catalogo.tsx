import { CatalogBrowser } from "@/components/catalog-browser.tsx";
import { Page } from "@/components/screen.tsx";

/**
 * The catalog tab: the products list owns the surface, the taxonomy lives under
 * Mais. No `Stack.Screen` header: the native tab bar draws no header, and the
 * browser carries its own title row and "Novo produto" action.
 */
export default function CatalogRoute() {
  return (
    <Page>
      <CatalogBrowser />
    </Page>
  );
}
