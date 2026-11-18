import { useMutation } from "@tanstack/react-query";
import type { PanelTheme } from "@menuza/api-client/model/panelTheme";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  saveStoreThemeFn,
  type StoreThemeMutationFailure,
} from "@/features/settings/server/settings.functions.ts";

const GENERIC_ERROR = "Não foi possível salvar as cores da loja. Tente novamente.";

/**
 * WCAG relative luminance, mirroring `crates/domain/src/theme.rs`.
 *
 * The API derives `foregroundColor` and `primaryForeground` on every read and
 * refuses to store them; the preview has to pick the same ink locally, or the
 * swatch would promise a contrast the saved palette does not have.
 */
function foregroundFor(color: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return "#191614";

  const channel = (start: number) => {
    const raw = Number.parseInt(color.slice(start, start + 2), 16) / 255;

    return raw <= 0.040_45 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  const withWhite = 1.05 / (luminance + 0.05);
  const withBlack = (luminance + 0.05) / 0.05;

  return withWhite >= withBlack ? "#faf8f5" : "#191614";
}

function serverMessage(failure: StoreThemeMutationFailure): string {
  if (failure.status === "error") {
    if (failure.code === "FORBIDDEN") return "Você não tem permissão para mudar as cores da loja.";

    if (failure.code === "NOT_FOUND") return "Loja não encontrada.";

    if (failure.code === "BAD_REQUEST" || failure.code === "VALIDATION_FAILED")
      return "Revise as cores e o raio e tente novamente.";
  }

  return GENERIC_ERROR;
}

/**
 * The store palette (MEN-313): three colors and a corner radius, saved once and
 * painted by both the web storefront and the native app.
 *
 * There is no dark variant and no per-component override: a store that wants a
 * night menu picks a dark background, and the API derives the readable ink.
 */
export function ThemeSettingsForm({
  storeSlug,
  initialData,
}: {
  storeSlug: string;
  initialData: PanelTheme;
}) {
  const [primaryColor, setPrimaryColor] = useState(initialData.primaryColor);
  const [accentColor, setAccentColor] = useState(initialData.accentColor);
  const [backgroundColor, setBackgroundColor] = useState(initialData.backgroundColor);
  const [radius, setRadius] = useState(initialData.radius);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: async () =>
      saveStoreThemeFn({ data: { storeSlug, primaryColor, accentColor, backgroundColor, radius } }),
    onSuccess: (result) => {
      if (result.status !== "ok") {
        setServerError(
          result.status === "unauthenticated" ? "Sessão expirada." : serverMessage(result),
        );

        return;
      }

      setPrimaryColor(result.theme.primaryColor);
      setAccentColor(result.theme.accentColor);
      setBackgroundColor(result.theme.backgroundColor);
      setRadius(result.theme.radius);
      setSaved(true);
    },
  });

  const foreground = foregroundFor(backgroundColor);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cores da loja</CardTitle>
        <CardDescription>
          A vitrine na web e o aplicativo usam esta paleta. O texto e o contraste são calculados
          automaticamente a partir da cor de fundo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div
          aria-hidden="true"
          className="flex flex-col gap-3 border border-border p-4"
          style={{
            backgroundColor,
            color: foreground,
            borderRadius: `${radius}px`,
          }}
        >
          <p className="text-xs tracking-wide uppercase" style={{ color: foreground }}>
            Prévia
          </p>
          <p className="text-base font-semibold" style={{ color: foreground }}>
            Nome de um item do cardápio
          </p>
          <div className="flex items-center gap-2">
            <span
              className="px-3 py-2 text-sm font-medium"
              style={{
                backgroundColor: primaryColor,
                color: foregroundFor(primaryColor),
                borderRadius: `${radius}px`,
              }}
            >
              Botão principal
            </span>
            <span
              className="px-3 py-2 text-sm"
              style={{
                backgroundColor: accentColor,
                color: foregroundFor(accentColor),
                borderRadius: `${radius}px`,
              }}
            >
              Destaque
            </span>
          </div>
        </div>

        <FieldGroup className="gap-4">
          <ColorField
            id="theme-primary"
            label="Cor principal"
            description="Botões, preços e a barra do aplicativo."
            value={primaryColor}
            onChange={(value) => {
              setPrimaryColor(value);
              setSaved(false);
            }}
          />

          <ColorField
            id="theme-accent"
            label="Cor de destaque"
            description="Faixas, etiquetas e estados de seleção."
            value={accentColor}
            onChange={(value) => {
              setAccentColor(value);
              setSaved(false);
            }}
          />

          <ColorField
            id="theme-background"
            label="Cor de fundo"
            description="O fundo de toda a vitrine."
            value={backgroundColor}
            onChange={(value) => {
              setBackgroundColor(value);
              setSaved(false);
            }}
          />

          <Field>
            <FieldLabel htmlFor="theme-radius">Arredondamento</FieldLabel>
            <Input
              id="theme-radius"
              className="w-24"
              type="number"
              inputMode="numeric"
              min={0}
              max={32}
              step={1}
              value={radius}
              onChange={(event) => {
                const next = Number(event.target.value);

                if (!Number.isFinite(next)) return;

                setRadius(Math.min(32, Math.max(0, Math.round(next))));
                setSaved(false);
              }}
            />
            <FieldDescription>
              Em pixels, de 0 (cantos retos) a 32. Cartões e botões escalam a partir dele.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {serverError ? (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível salvar as cores</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        {saved ? (
          <p role="status" className="text-sm text-muted-foreground">
            Cores da loja salvas.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setServerError(null);
              setSaved(false);
              mutation.mutate();
            }}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Salvar cores
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ColorField({
  id,
  label,
  description,
  value,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <Input
          id={id}
          className="h-10 w-16 shrink-0 p-1"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <code className="font-mono text-sm text-muted-foreground">{value}</code>
      </div>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}
