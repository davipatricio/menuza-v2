import { Stack } from "expo-router";
import { ScrollView, View } from "react-native";

import { ManagementHub, type HubItem } from "@/components/management.tsx";

/** The catalog sections that still live behind this hub; products has its own tab. */
const SECTIONS: HubItem[] = [
  {
    href: "/management/catalog/kits",
    label: "Kits",
    description: "Combinações de pratos vendidas como um item.",
  },
  {
    href: "/management/catalog/departments",
    label: "Departamentos",
    description: "Agrupamento de primeiro nível do catálogo.",
  },
  {
    href: "/management/catalog/categories",
    label: "Categorias",
    description: "Categorias dentro dos departamentos.",
  },
  {
    href: "/management/catalog/subcategories",
    label: "Subcategorias",
    description: "Subcategorias dentro de cada categoria.",
  },
  {
    href: "/management/catalog/tags",
    label: "Tags",
    description: "Marcadores livres aplicados aos produtos.",
  },
  {
    href: "/management/catalog/badges",
    label: "Etiquetas",
    description: "Selos com imagem exibidos no produto.",
  },
];

export default function CatalogHubRoute() {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Catálogo" }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <ManagementHub title="Catálogo da loja." items={SECTIONS} />
      </ScrollView>
    </View>
  );
}
