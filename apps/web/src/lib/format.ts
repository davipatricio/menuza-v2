/**
 * Formatação de exibição do painel. Única fonte para valores mostrados ao usuário.
 *
 * Valores monetários chegam como Int em centavos (ADR-0006) e são convertidos
 * aqui, na borda — o contrato e o banco nunca carregam float. A digitação usa
 * o mesmo arquivo no sentido inverso: o usuário digita reais (`15,50`) e o
 * formulário converte para centavos antes de chamar o contrato.
 */
export function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** Contagem inteira no formato pt-BR, com separador de milhar. */
export function formatInteger(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

/**
 * Valor compacto para eixos e rótulos de gráfico, sem o símbolo: `1320000`
 * vira `"13,2 mil"`. O contexto do gráfico diz que o valor está em reais.
 */
export function formatBrlCompact(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

/** Decimal com casas fixas, para médias como "1,4" itens por pedido. */
export function formatDecimal(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Percentual já calculado (`43` vira `"43%"`). Recebe o número em pontos
 * percentuais, não a fração, para o chamador não repetir `* 100` na tela.
 */
export function formatPercent(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}

/**
 * Dígitos de um campo de dinheiro, sem o símbolo: `1550` vira `"15,50"`.
 * O prefixo `R$` fica no addon do `InputGroup`, nunca dentro do valor.
 */
export function formatBrlInput(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round(cents) / 100);
}

const BRL_INVALID_MESSAGE = "Use apenas números no formato pt-BR (ex.: 15,50).";

/**
 * Converte digitação pt-BR em centavos inteiros: `"15,50"` vira `1550`.
 *
 * Retorna `undefined` para campo vazio (limite opcional não preenchido) e
 * lança erro para texto inválido — o formulário transforma isso em `NaN`
 * para o schema Valibot recusar, em vez de confundir inválido com vazio.
 */
export function parseBrlToCents(input: string): number | undefined {
  const trimmed = input.trim();

  if (trimmed === "") return undefined;

  const unsigned = trimmed
    .replace(/^R\$\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/^\+/, "");

  if (unsigned === "" || !/^[+-]?[\d.,]+$/.test(unsigned) || unsigned.startsWith("-")) {
    throw new Error(BRL_INVALID_MESSAGE);
  }

  let reais: string;
  let centavos: string;

  if (unsigned.includes(",")) {
    const parts = unsigned.split(",");

    if (parts.length !== 2) throw new Error(BRL_INVALID_MESSAGE);

    const intPart = parts[0] ?? "";
    const fracPart = parts[1] ?? "";

    if (!/^\d{0,2}$/.test(fracPart)) throw new Error(BRL_INVALID_MESSAGE);

    reais = intPart.replace(/\./g, "") || "0";

    if (!/^\d+$/.test(reais)) throw new Error(BRL_INVALID_MESSAGE);

    centavos = fracPart.padEnd(2, "0");
  } else if (unsigned.includes(".")) {
    const parts = unsigned.split(".");

    if (parts.length === 2) {
      const intPart = parts[0] ?? "";
      const fracPart = parts[1] ?? "";

      if (!/^\d*$/.test(intPart) || !/^\d+$/.test(fracPart)) throw new Error(BRL_INVALID_MESSAGE);

      if (fracPart.length <= 2) {
        reais = intPart === "" ? "0" : intPart;
        centavos = fracPart.padEnd(2, "0");
      } else if (fracPart.length === 3) {
        // Notação de milhar pt-BR (`1.500` = mil e quinhentos reais).
        reais = `${intPart}${fracPart}`;
        centavos = "00";
      } else {
        throw new Error(BRL_INVALID_MESSAGE);
      }
    } else {
      // Múltiplos pontos só existem como separador de milhar.
      if (parts.some((part) => !/^\d+$/.test(part))) throw new Error(BRL_INVALID_MESSAGE);

      reais = parts.join("");
      centavos = "00";
    }
  } else {
    if (!/^\d+$/.test(unsigned)) throw new Error(BRL_INVALID_MESSAGE);

    reais = unsigned;
    centavos = "00";
  }

  const cents = Number(reais) * 100 + Number(centavos);

  if (!Number.isSafeInteger(cents)) throw new Error(BRL_INVALID_MESSAGE);

  return cents;
}

/**
 * Máscara de digitação em reais: agrupa milhares enquanto o usuário digita,
 * preservando a vírgula em curso. `"1500"` vira `"1.500"`, `"1500,5"` vira
 * `"1.500,5"`, `"1.500,00"` continua igual. Não valida — quem valida é
 * `parseBrlToCents`, que aceita o texto já mascarado de volta.
 */
export function maskBrlInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const [intPart = "", ...rest] = cleaned.split(",");
  const grouped = intPart.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (rest.length === 0) return grouped;

  return `${grouped},${rest.join("").slice(0, 2)}`;
}

/**
 * Máscara de digitação de um inteiro positivo: só dígitos, com milhar
 * agrupado (`"1500"` vira `"1.500"`). Quem converte de volta para número
 * precisa remover os pontos — `Number("1.500")` seria `1.5`.
 */
export function maskIntegerInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Data e hora no formato curto pt-BR, a partir do ISO-8601 com `Z` que o
 * contrato entrega. Fica aqui, junto do `formatBrl`, porque é o mesmo tipo de
 * conversão de borda: o valor cru nunca chega à tela.
 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * Tempo relativo curto para cartões de quadro: "agora", "12 min", "3 h", "2 d".
 * O detalhe usa `formatDateTime`, que é a data absoluta.
 */
export function formatRelativeTime(iso: string, now = new Date()): string {
  const elapsedMs = now.getTime() - new Date(iso).getTime();

  if (Number.isNaN(elapsedMs)) return "";

  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) return "agora";

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} h`;

  return `${Math.floor(hours / 24)} d`;
}

/** Primeiras letras de cada palavra, no máximo duas, em maiúsculas. */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
