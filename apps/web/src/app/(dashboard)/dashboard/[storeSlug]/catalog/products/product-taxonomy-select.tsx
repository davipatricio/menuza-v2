"use client";

/**
 * The product stores only a subcategory, so the editor makes a single choice.
 * The option label carries the category so the branch stays readable.
 */
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { TaxonomyCombobox } from "./taxonomy-combobox.tsx";

export type SubcategoryOption = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  departmentName: string;
};

export function ProductTaxonomySelect({
  id,
  value,
  onChange,
  subcategories,
  invalid,
  describedBy,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  subcategories: SubcategoryOption[];
  invalid?: boolean;
  describedBy?: string;
}) {
  const options = subcategories
    .map((subcategory) => ({
      id: subcategory.id,
      name: subcategory.name,
      group: subcategory.departmentName,
    }))
    .sort(
      (a, b) => a.group.localeCompare(b.group, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"),
    );

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>Categoria</FieldLabel>
      <TaxonomyCombobox
        id={id}
        items={options}
        value={value}
        onChange={onChange}
        emptyLabel="Sem categoria"
        placeholder="Buscar categoria…"
        invalid={invalid}
        describedBy={describedBy}
        className="w-full"
      />
    </Field>
  );
}
