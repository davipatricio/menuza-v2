/**
 * Editor dos links extras de uma página. A lista inteira é enviada no save;
 * a canônica continua sendo um campo próprio, não um item desta lista.
 */
import type { SeoLink } from "@menuza/shared/seo";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";

const REL_LABELS: Record<SeoLink["rel"], string> = {
  alternate: "Alternate (idioma)",
  sameAs: "SameAs (perfil)",
  related: "Related (relacionado)",
};

const MAX_LINKS = 8;

export function SeoLinksField({
  value,
  onChange,
}: {
  value: SeoLink[];
  onChange: (next: SeoLink[]) => void;
}) {
  const update = (index: number, patch: Partial<SeoLink>) => {
    onChange(value.map((link, position) => (position === index ? { ...link, ...patch } : link)));
  };

  return (
    <Field>
      <FieldLabel>Links extras</FieldLabel>
      <FieldDescription>
        Até {MAX_LINKS} links além da canônica. Use alternate para outro idioma, sameAs para perfis
        e related para páginas relacionadas.
      </FieldDescription>

      <div className="flex flex-col gap-3">
        {value.map((link, index) => (
          <div
            key={`${index}-${link.rel}`}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-end"
          >
            <div className="flex flex-col gap-1.5 md:w-44">
              <span className="text-xs text-muted-foreground">Relação</span>
              <Select
                value={link.rel}
                onValueChange={(next) => {
                  if (next === "alternate" || next === "sameAs" || next === "related") {
                    update(index, { rel: next });
                  }
                }}
              >
                <SelectTrigger aria-label={`Relação do link ${index + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REL_LABELS).map(([rel, label]) => (
                    <SelectItem key={rel} value={rel}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">URL</span>
              <Input
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={link.href}
                placeholder="https://sualoja.com.br/pagina"
                aria-label={`URL do link ${index + 1}`}
                onChange={(event) => update(index, { href: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5 md:w-32">
              <span className="text-xs text-muted-foreground">Idioma</span>
              <Input
                value={link.hreflang ?? ""}
                placeholder="pt-BR"
                maxLength={20}
                aria-label={`Idioma do link ${index + 1}`}
                onChange={(event) => update(index, { hreflang: event.target.value || null })}
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(value.filter((_, position) => position !== index))}
            >
              Remover
            </Button>
          </div>
        ))}
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          disabled={value.length >= MAX_LINKS}
          onClick={() => onChange([...value, { rel: "alternate", href: "", hreflang: null }])}
        >
          Adicionar link
        </Button>
      </div>
    </Field>
  );
}
