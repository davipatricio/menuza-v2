import type {
  ApiErrorBody,
  CategoryInput,
  CreateBadgeInput,
  CreateDepartmentInput,
  CreateProductInput,
  SubcategoryInput,
  TagInput,
  UpdateBadgeInput,
  UpdateDepartmentInput,
  UpdateKitInput,
  UpdateProductInput,
} from "@menuza/api-client/model";
import {
  createPanelBadge,
  createPanelCategory,
  createPanelDepartment,
  createPanelProduct,
  createPanelSubcategory,
  createPanelTag,
  deletePanelBadge,
  deletePanelCategory,
  deletePanelDepartment,
  deletePanelSubcategory,
  deletePanelTag,
  getPanelKit,
  getPanelProduct,
  listPanelBadges,
  listPanelCategories,
  listPanelDepartments,
  listPanelKits,
  listPanelProducts,
  listPanelSubcategories,
  listPanelTags,
  updatePanelBadge,
  updatePanelCategory,
  updatePanelDepartment,
  updatePanelKit,
  updatePanelProduct,
  updatePanelSubcategory,
  updatePanelTag,
} from "@menuza/api-client/tenant";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * The panel catalog reads.
 *
 * Every list is one endpoint of the selected store and every key stays under
 * `catalog`, so a screen can refresh the section without touching orders.
 */
export function usePanelProducts(storeSlug: string | null) {
  return useQuery({
    queryKey: ["catalog", "products", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelProducts(storeSlug);

      if (response.status !== 200) throw new Error(`Os produtos responderam ${response.status}.`);

      return response.data.products;
    },
  });
}

/** One product with its description, variations and nutrition label. */
export function usePanelProduct(storeSlug: string | null, productId: string) {
  return useQuery({
    queryKey: ["catalog", "product", storeSlug, productId],
    enabled: Boolean(storeSlug && productId),
    queryFn: async () => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await getPanelProduct(storeSlug, productId);

      if (response.status !== 200) throw new Error(`O produto respondeu ${response.status}.`);

      return response.data.product;
    },
  });
}

/** One kit with its groups, dishes and bands. */
export function usePanelKit(storeSlug: string | null, kitId: string) {
  return useQuery({
    queryKey: ["catalog", "kit", storeSlug, kitId],
    enabled: Boolean(storeSlug && kitId),
    queryFn: async () => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await getPanelKit(storeSlug, kitId);

      if (response.status !== 200) throw new Error(`O kit respondeu ${response.status}.`);

      return response.data.kit;
    },
  });
}

export function usePanelKits(storeSlug: string | null) {
  return useQuery({
    queryKey: ["catalog", "kits", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelKits(storeSlug);

      if (response.status !== 200) throw new Error(`Os kits responderam ${response.status}.`);

      return response.data.kits;
    },
  });
}

export function usePanelDepartments(storeSlug: string | null) {
  return useQuery({
    queryKey: ["catalog", "departments", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelDepartments(storeSlug);

      if (response.status !== 200)
        throw new Error(`Os departamentos responderam ${response.status}.`);

      return response.data.departments;
    },
  });
}

export function usePanelCategories(storeSlug: string | null) {
  return useQuery({
    queryKey: ["catalog", "categories", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelCategories(storeSlug);

      if (response.status !== 200) throw new Error(`As categorias responderam ${response.status}.`);

      return response.data.categories;
    },
  });
}

export function usePanelSubcategories(storeSlug: string | null) {
  return useQuery({
    queryKey: ["catalog", "subcategories", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelSubcategories(storeSlug);

      if (response.status !== 200)
        throw new Error(`As subcategorias responderam ${response.status}.`);

      return response.data.subcategories;
    },
  });
}

export function usePanelTags(storeSlug: string | null) {
  return useQuery({
    queryKey: ["catalog", "tags", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelTags(storeSlug);

      if (response.status !== 200) throw new Error(`As tags responderam ${response.status}.`);

      return response.data.tags;
    },
  });
}

export function usePanelBadges(storeSlug: string | null) {
  return useQuery({
    queryKey: ["catalog", "badges", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelBadges(storeSlug);

      if (response.status !== 200) throw new Error(`As etiquetas responderam ${response.status}.`);

      return response.data.badges;
    },
  });
}

/**
 * The panel catalog writes.
 *
 * The API never sends operator-facing copy, so the error codes become pt-BR
 * here; every success invalidates the list it belongs to and, when the row id
 * is known, that row's detail key.
 */
const SAVE_FAILED = "Não foi possível salvar. Tente novamente.";

const DELETE_FAILED = "Não foi possível excluir. Tente novamente.";

function saveFailure(body: ApiErrorBody): Error {
  switch (body.code) {
    case "FORBIDDEN":
      return new Error("Você não tem permissão para editar o catálogo desta loja.");
    case "CONFLICT":
      return new Error("Já existe um item com este nome ou endereço nesta loja.");
    case "NOT_FOUND":
      return new Error("Este item não existe mais nesta loja.");
    case "VALIDATION_FAILED":
      return new Error("Revise os campos e tente novamente.");
    default:
      return new Error(SAVE_FAILED);
  }
}

function deleteFailure(body: ApiErrorBody): Error {
  switch (body.code) {
    case "FORBIDDEN":
      return new Error("Você não tem permissão para editar o catálogo desta loja.");
    case "CONFLICT":
      return new Error("Este item ainda está em uso. Remova os vínculos antes de excluí-lo.");
    case "NOT_FOUND":
      return new Error("Este item não existe mais nesta loja.");
    default:
      return new Error(DELETE_FAILED);
  }
}

export function useCreatePanelProduct(storeSlug: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await createPanelProduct(storeSlug, input);

      if (response.status !== 200) throw saveFailure(response.data);

      return response.data.product;
    },
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: ["catalog", "products", storeSlug] });
      void queryClient.invalidateQueries({
        queryKey: ["catalog", "product", storeSlug, product.id],
      });
    },
  });
}

export function useUpdatePanelProduct(storeSlug: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateProductInput }) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await updatePanelProduct(storeSlug, id, input);

      if (response.status !== 200) throw saveFailure(response.data);

      return response.data.product;
    },
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: ["catalog", "products", storeSlug] });
      void queryClient.invalidateQueries({
        queryKey: ["catalog", "product", storeSlug, product.id],
      });
    },
  });
}

export function useUpdatePanelKit(storeSlug: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateKitInput }) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await updatePanelKit(storeSlug, id, input);

      if (response.status !== 200) throw saveFailure(response.data);

      return response.data.kit;
    },
    onSuccess: (kit) => {
      void queryClient.invalidateQueries({ queryKey: ["catalog", "kits", storeSlug] });
      void queryClient.invalidateQueries({ queryKey: ["catalog", "kit", storeSlug, kit.id] });
    },
  });
}

/** The five taxonomy sections the catalog editor writes, one endpoint each. */
export type TaxonomyResource = "departments" | "categories" | "subcategories" | "tags" | "badges";

/** A taxonomy save: one variant per section, so no field can travel to the wrong endpoint. */
export type TaxonomyDraft =
  | { resource: "departments"; name: string; active: boolean }
  | {
      resource: "categories";
      name: string;
      active: boolean;
      sortOrder: number;
      departmentIds: string[];
    }
  | {
      resource: "subcategories";
      name: string;
      active: boolean;
      sortOrder: number;
      categoryId: string;
    }
  | { resource: "tags"; name: string; active: boolean }
  | { resource: "badges"; name: string; active: boolean; sortOrder: number; imageUrl: string };

/** A deleted row can rename its neighbours, so those lists refresh too. */
const DEPENDENT_LISTS: Record<TaxonomyResource, TaxonomyResource[]> = {
  departments: ["categories"],
  categories: ["subcategories"],
  subcategories: [],
  tags: [],
  badges: [],
};

function writeTaxonomy(storeSlug: string, draft: TaxonomyDraft, id: string | undefined) {
  switch (draft.resource) {
    case "departments": {
      const input: CreateDepartmentInput = { name: draft.name, active: draft.active };
      const patch: UpdateDepartmentInput = { ...input, moveProductsToCategoryId: null };

      return id
        ? updatePanelDepartment(storeSlug, id, patch)
        : createPanelDepartment(storeSlug, input);
    }

    case "categories": {
      const input: CategoryInput = {
        name: draft.name,
        active: draft.active,
        sortOrder: draft.sortOrder,
        departmentIds: draft.departmentIds,
      };

      return id ? updatePanelCategory(storeSlug, id, input) : createPanelCategory(storeSlug, input);
    }

    case "subcategories": {
      const input: SubcategoryInput = {
        name: draft.name,
        active: draft.active,
        sortOrder: draft.sortOrder,
        categoryId: draft.categoryId,
      };

      return id
        ? updatePanelSubcategory(storeSlug, id, input)
        : createPanelSubcategory(storeSlug, input);
    }

    case "tags": {
      const input: TagInput = { name: draft.name, isActive: draft.active };

      return id ? updatePanelTag(storeSlug, id, input) : createPanelTag(storeSlug, input);
    }

    case "badges": {
      const input: CreateBadgeInput = {
        name: draft.name,
        imageUrl: draft.imageUrl,
        isActive: draft.active,
        sortOrder: draft.sortOrder,
      };

      const patch: UpdateBadgeInput = { ...input };

      return id ? updatePanelBadge(storeSlug, id, patch) : createPanelBadge(storeSlug, input);
    }
  }
}

function removeTaxonomy(storeSlug: string, resource: TaxonomyResource, id: string) {
  switch (resource) {
    case "departments":
      return deletePanelDepartment(storeSlug, id);
    case "categories":
      return deletePanelCategory(storeSlug, id);
    case "subcategories":
      return deletePanelSubcategory(storeSlug, id);
    case "tags":
      return deletePanelTag(storeSlug, id);
    case "badges":
      return deletePanelBadge(storeSlug, id);
  }
}

export function useSavePanelTaxonomy(storeSlug: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: TaxonomyDraft }) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await writeTaxonomy(storeSlug, draft, id);

      if (response.status !== 200) throw saveFailure(response.data);

      return draft.resource;
    },
    onSuccess: (resource) => {
      for (const key of [resource, ...DEPENDENT_LISTS[resource]]) {
        void queryClient.invalidateQueries({ queryKey: ["catalog", key, storeSlug] });
      }
    },
  });
}

export function useDeletePanelTaxonomy(storeSlug: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, resource }: { id: string; resource: TaxonomyResource }) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await removeTaxonomy(storeSlug, resource, id);

      if (response.status !== 200) throw deleteFailure(response.data);

      return resource;
    },
    onSuccess: (resource) => {
      for (const key of [resource, ...DEPENDENT_LISTS[resource]]) {
        void queryClient.invalidateQueries({ queryKey: ["catalog", key, storeSlug] });
      }
    },
  });
}
