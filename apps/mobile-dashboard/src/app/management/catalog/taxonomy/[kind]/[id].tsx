import type {
  PanelBadge,
  PanelCategory,
  PanelDepartment,
  PanelSubcategory,
  PanelTag,
} from "@menuza/api-client/model";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { ChipGroup, ChipMultiGroup, FormScreen, SwitchRow, TextField } from "@/components/form.tsx";
import { EmptyState, Loading } from "@/components/screen.tsx";
import {
  type TaxonomyDraft,
  type TaxonomyResource,
  useDeletePanelTaxonomy,
  usePanelBadges,
  usePanelCategories,
  usePanelDepartments,
  usePanelSubcategories,
  usePanelTags,
  useSavePanelTaxonomy,
} from "@/lib/catalog.ts";
import { useUnsavedChangesGuard } from "@/lib/navigation.ts";
import { useSession } from "@/lib/session.tsx";

const BADGE_IMAGE_URL = /^https?:\/\//i;

const IMAGE_INVALID = "Informe uma URL http(s) da imagem.";

const ORDER_INVALID = "Use um número inteiro maior ou igual a zero.";

/** One label set per section, so create, edit and delete read the same everywhere. */
interface TaxonomyCopy {
  resource: TaxonomyResource;
  createTitle: string;
  editTitle: string;
  saveLabel: string;
  activeLabel: string;
  activeDescription: string;
  deleteQuestion: (name: string) => string;
  hasOrder: boolean;
  hasCategory: boolean;
  hasDepartments: boolean;
  hasImage: boolean;
  nameMax: number;
}

const TAXONOMY_BY_KIND = {
  departments: {
    resource: "departments",
    createTitle: "Novo departamento",
    editTitle: "Editar departamento",
    saveLabel: "Salvar departamento",
    activeLabel: "Ativo",
    activeDescription: "Departamentos inativos continuam cadastrados e podem ser reativados.",
    deleteQuestion: (name: string) => `Excluir o departamento "${name}"?`,
    hasOrder: false,
    hasCategory: false,
    hasDepartments: false,
    hasImage: false,
    nameMax: 80,
  },
  categories: {
    resource: "categories",
    createTitle: "Nova categoria",
    editTitle: "Editar categoria",
    saveLabel: "Salvar categoria",
    activeLabel: "Ativa",
    activeDescription: "Categorias inativas deixam de aparecer no cardápio.",
    deleteQuestion: (name: string) => `Excluir a categoria "${name}"?`,
    hasOrder: true,
    hasCategory: false,
    hasDepartments: true,
    hasImage: false,
    nameMax: 80,
  },
  subcategories: {
    resource: "subcategories",
    createTitle: "Nova subcategoria",
    editTitle: "Editar subcategoria",
    saveLabel: "Salvar subcategoria",
    activeLabel: "Ativa",
    activeDescription: "Subcategorias inativas deixam de aparecer no cardápio.",
    deleteQuestion: (name: string) => `Excluir a subcategoria "${name}"?`,
    hasOrder: true,
    hasCategory: true,
    hasDepartments: false,
    hasImage: false,
    nameMax: 80,
  },
  tags: {
    resource: "tags",
    createTitle: "Nova tag",
    editTitle: "Editar tag",
    saveLabel: "Salvar tag",
    activeLabel: "Ativa",
    activeDescription:
      "Desative para ocultar a tag do cardápio. Os produtos e os filtros do painel continuam com ela.",
    deleteQuestion: (name: string) => `Excluir a tag "${name}"?`,
    hasOrder: false,
    hasCategory: false,
    hasDepartments: false,
    hasImage: false,
    nameMax: 80,
  },
  badges: {
    resource: "badges",
    createTitle: "Nova etiqueta",
    editTitle: "Editar etiqueta",
    saveLabel: "Salvar etiqueta",
    activeLabel: "Ativa",
    activeDescription: "Etiquetas inativas somem da vitrine e continuam cadastradas.",
    deleteQuestion: (name: string) => `Excluir a etiqueta "${name}"?`,
    hasOrder: true,
    hasCategory: false,
    hasDepartments: false,
    hasImage: true,
    nameMax: 64,
  },
} satisfies Record<TaxonomyResource, TaxonomyCopy>;

/** A route param is any string; only these five sections open an editor. */
function copyFor(kind: string): TaxonomyCopy | undefined {
  switch (kind) {
    case "departments":
    case "categories":
    case "subcategories":
    case "tags":
    case "badges":
      return TAXONOMY_BY_KIND[kind];
    default:
      return undefined;
  }
}

interface TaxonomyValues {
  name: string;
  active: boolean;
  sortOrder: string;
  categoryId: string;
  departmentIds: string[];
  imageUrl: string;
}

interface TaxonomyLists {
  departments: readonly PanelDepartment[];
  categories: readonly PanelCategory[];
  subcategories: readonly PanelSubcategory[];
  tags: readonly PanelTag[];
  badges: readonly PanelBadge[];
  pending: boolean;
}

const EMPTY: TaxonomyValues = {
  name: "",
  active: true,
  sortOrder: "0",
  categoryId: "",
  departmentIds: [],
  imageUrl: "",
};

/** The stored row as flat editor state; `null` when the id is not in the list. */
function rowValues(
  resource: TaxonomyResource,
  id: string,
  lists: TaxonomyLists,
): TaxonomyValues | null {
  switch (resource) {
    case "departments": {
      const row = lists.departments.find((item) => item.id === id);

      return row ? { ...EMPTY, name: row.name, active: row.active } : null;
    }

    case "categories": {
      const row = lists.categories.find((item) => item.id === id);

      return row
        ? {
            ...EMPTY,
            name: row.name,
            active: row.active,
            sortOrder: String(row.sortOrder),
            departmentIds: row.departmentIds,
          }
        : null;
    }

    case "subcategories": {
      const row = lists.subcategories.find((item) => item.id === id);

      return row
        ? {
            ...EMPTY,
            name: row.name,
            active: row.active,
            sortOrder: String(row.sortOrder),
            categoryId: row.categoryId,
          }
        : null;
    }

    case "tags": {
      const row = lists.tags.find((item) => item.id === id);

      return row ? { ...EMPTY, name: row.name, active: row.isActive } : null;
    }

    case "badges": {
      const row = lists.badges.find((item) => item.id === id);

      return row
        ? {
            ...EMPTY,
            name: row.name,
            active: row.isActive,
            sortOrder: String(row.sortOrder),
            imageUrl: row.imageUrl,
          }
        : null;
    }
  }
}

function listPending(resource: TaxonomyResource, lists: TaxonomyLists): boolean {
  switch (resource) {
    case "departments":
      return lists.departments.length === 0 && lists.pending;
    case "categories":
      return lists.categories.length === 0 && lists.pending;
    case "subcategories":
      return lists.subcategories.length === 0 && lists.pending;
    case "tags":
      return lists.tags.length === 0 && lists.pending;
    case "badges":
      return lists.badges.length === 0 && lists.pending;
  }
}

/**
 * One editor for the five taxonomy sections. `kind` picks the endpoint and the
 * fields the row actually carries; `id` is `"new"` or an existing row.
 */
export default function TaxonomyEditorRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { storeSlug } = useSession();
  const departments = usePanelDepartments(storeSlug);
  const categories = usePanelCategories(storeSlug);
  const subcategories = usePanelSubcategories(storeSlug);
  const tags = usePanelTags(storeSlug);
  const badges = usePanelBadges(storeSlug);

  const copy = copyFor(kind);

  if (!copy) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: "Catálogo" }} />
        <EmptyState title="Seção desconhecida" message="Esta parte do catálogo não existe." />
      </View>
    );
  }

  const lists: TaxonomyLists = {
    departments: departments.data ?? [],
    categories: categories.data ?? [],
    subcategories: subcategories.data ?? [],
    tags: tags.data ?? [],
    badges: badges.data ?? [],
    pending: [departments, categories, subcategories, tags, badges].some(
      (query) => query.isPending,
    ),
  };

  const editing = id !== undefined && id !== "new";
  const initial = editing ? rowValues(copy.resource, id, lists) : EMPTY;

  if (initial === null) {
    return listPending(copy.resource, lists) ? (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: copy.editTitle }} />
        <Loading />
      </View>
    ) : (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: copy.editTitle }} />
        <EmptyState title="Registro indisponível" message="Este item não existe mais nesta loja." />
      </View>
    );
  }

  return (
    <TaxonomyEditor
      categories={[...lists.categories].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"),
      )}
      copy={copy}
      departments={[...lists.departments].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"),
      )}
      id={editing ? id : undefined}
      initial={initial}
      storeSlug={storeSlug}
    />
  );
}

function TaxonomyEditor({
  copy,
  id,
  initial,
  categories,
  departments,
  storeSlug,
}: {
  copy: TaxonomyCopy;
  id?: string;
  initial: TaxonomyValues;
  categories: readonly PanelCategory[];
  departments: readonly PanelDepartment[];
  storeSlug: string | null;
}) {
  const router = useRouter();
  const save = useSavePanelTaxonomy(storeSlug);
  const remove = useDeletePanelTaxonomy(storeSlug);

  const [name, setName] = useState(initial.name);
  const [active, setActive] = useState(initial.active);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [departmentIds, setDepartmentIds] = useState<string[]>(initial.departmentIds);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [problem, setProblem] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const finished = save.isSuccess || remove.isSuccess;

  useUnsavedChangesGuard(dirty && !finished);

  useEffect(() => {
    if (finished) router.back();
  }, [finished, router]);

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setDirty(true);
    };
  }

  function submit() {
    setProblem(null);

    const trimmedName = name.trim();

    if (trimmedName === "") {
      setProblem("Informe o nome.");

      return;
    }

    if (trimmedName.length > copy.nameMax) {
      setProblem(`Use no máximo ${String(copy.nameMax)} caracteres.`);

      return;
    }

    if (copy.hasOrder && !/^\d+$/.test(sortOrder.trim())) {
      setProblem(ORDER_INVALID);

      return;
    }

    if (copy.hasCategory && categoryId === "") {
      setProblem("Escolha a categoria.");

      return;
    }

    if (copy.hasImage && !BADGE_IMAGE_URL.test(imageUrl.trim())) {
      setProblem(IMAGE_INVALID);

      return;
    }

    save.mutate({
      id,
      draft: draftOf(copy.resource, {
        name: trimmedName,
        active,
        sortOrder,
        categoryId,
        departmentIds,
        imageUrl,
      }),
    });
  }

  function confirmDelete() {
    if (!id) return;

    Alert.alert(
      copy.deleteQuestion(name),
      "O registro será removido permanentemente. Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            remove.mutate({ id, resource: copy.resource });
          },
        },
      ],
    );
  }

  const failure = remove.error?.message ?? save.error?.message ?? null;

  return (
    <FormScreen
      error={problem ?? failure}
      onSave={submit}
      saved={save.isSuccess}
      saveLabel={copy.saveLabel}
      saving={save.isPending || remove.isPending}
      title={id ? copy.editTitle : copy.createTitle}
    >
      <TextField
        label="Nome"
        maxLength={copy.nameMax}
        onChangeText={change(setName)}
        value={name}
      />

      {copy.hasCategory ? (
        categories.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            Nenhuma categoria cadastrada. Crie uma antes de cadastrar a subcategoria.
          </Text>
        ) : (
          <ChipGroup
            label="Categoria"
            onChange={change(setCategoryId)}
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
            value={categoryId}
          />
        )
      ) : null}

      {copy.hasDepartments ? (
        departments.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            Nenhum departamento cadastrado. Crie um para agrupar esta categoria.
          </Text>
        ) : (
          <ChipMultiGroup
            label="Departamentos"
            onChange={change(setDepartmentIds)}
            options={departments.map((department) => ({
              value: department.id,
              label: department.name,
            }))}
            values={departmentIds}
          />
        )
      ) : null}

      {copy.hasImage ? (
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          hint="Endereço http(s) da imagem exibida no produto."
          keyboardType="default"
          label="URL da imagem"
          maxLength={1000}
          onChangeText={change(setImageUrl)}
          placeholder="https://…/etiqueta.png"
          value={imageUrl}
        />
      ) : null}

      {copy.hasOrder ? (
        <TextField
          hint="Menor aparece primeiro."
          keyboardType="numeric"
          label="Ordem"
          onChangeText={change(setSortOrder)}
          value={sortOrder}
        />
      ) : null}

      <SwitchRow
        description={copy.activeDescription}
        label={copy.activeLabel}
        onValueChange={change(setActive)}
        value={active}
      />

      {id ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: remove.isPending }}
          className="items-center rounded-xl border border-destructive px-4 py-3 active:opacity-80"
          disabled={remove.isPending}
          onPress={confirmDelete}
        >
          <Text className="text-base font-semibold text-destructive">Excluir</Text>
        </Pressable>
      ) : null}
    </FormScreen>
  );
}

/** The per-section fields, so no field can travel to an endpoint that has no column for it. */
function draftOf(
  resource: TaxonomyResource,
  values: {
    name: string;
    active: boolean;
    sortOrder: string;
    categoryId: string;
    departmentIds: string[];
    imageUrl: string;
  },
): TaxonomyDraft {
  const identity = { name: values.name, active: values.active };

  switch (resource) {
    case "departments":
      return { resource, ...identity };
    case "categories":
      return {
        resource,
        ...identity,
        sortOrder: Number(values.sortOrder),
        departmentIds: values.departmentIds,
      };
    case "subcategories":
      return {
        resource,
        ...identity,
        sortOrder: Number(values.sortOrder),
        categoryId: values.categoryId,
      };
    case "tags":
      return { resource, ...identity };
    case "badges":
      return {
        resource,
        ...identity,
        sortOrder: Number(values.sortOrder),
        imageUrl: values.imageUrl.trim(),
      };
  }
}
