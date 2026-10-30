"use client";

import {
  AssistantRuntimeProvider,
  InMemoryThreadListAdapter,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import type { ChatModelAdapter, ThreadSuggestion } from "@assistant-ui/react";

import { AssistantModal } from "@/components/assistant-ui/elements/assistant-modal.aui";

type KomiTopic = "catalog" | "orders" | "promotions" | "storefront";

const KOMI_REPLIES: Record<KomiTopic, string> = {
  catalog:
    "O catálogo reúne os produtos, categorias, departamentos, etiquetas e kits da loja. O estoque é controlado na edição de cada produto, e um item sem estoque continua publicado até você despublicá-lo.",
  orders:
    "Cada pedido chega com status de pagamento e de entrega. Na lista de pedidos você acompanha o que ainda está pendente e abre o pedido para ver itens, frete e total.",
  promotions:
    "Cupons ficam em Cupons, no menu da loja. Cada cupom mostra quantos resgates teve, quanto desconto já concedeu e o último uso; abrir um cupom separa Desempenho, Resgates e Edição.",
  storefront:
    "A vitrine é o endereço público da sua loja: mostra os produtos publicados no catálogo, com as categorias e a identidade visual que você configurou.",
};

/** Coupon intents worth their own answer: the two questions the page cannot state. */
const KOMI_COUPON_REPLIES = {
  create:
    "Para criar um cupom, abra Cupons e clique em Novo cupom. Escolha o tipo de desconto, o limite de uso e a validade. A validade é por dia: o cupom vale do início do primeiro dia ao fim do último.",
  notShowing:
    "Se o cupom não aparece no checkout, confira nesta ordem: ele está desativado, a data final já passou, o pedido não atingiu o valor mínimo, ou o comprador já usou o limite por cliente.",
} as const;

const KOMI_FALLBACKS = [
  "Posso falar sobre catálogo, pedidos, promoções e vitrine. Qual desses você quer olhar agora?",
  "Me diga se você quer revisar produtos, acompanhar pedidos, montar uma promoção ou ajustar a vitrine.",
];

const KOMI_GREETING =
  "Oi, sou a Komi. Posso conversar sobre o catálogo, os pedidos, as promoções e a vitrine da sua loja. Por onde você quer começar?";

const KOMI_PROMPTS: ThreadSuggestion[] = [
  { prompt: "Quais produtos estão sem estoque?" },
  { prompt: "Resuma os pedidos de hoje" },
  { prompt: "Sugira uma promoção para a vitrine" },
];

let rotatingReply = 0;

const nextRotatingReply = () => KOMI_FALLBACKS[rotatingReply++ % KOMI_FALLBACKS.length]!;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const replyTo = (prompt: string) => {
  if (/(produto|catalogo|estoque)/.test(prompt)) return KOMI_REPLIES.catalog;

  // Stems, not words: "cupons" does not contain "cupom" and "promoção"
  // normalizes to "promocao", which does not contain "promoco" — both plurals
  // and the accented singular have to match the same branch. Coupons are
  // checked before orders so "cupom recusado no pedido" gets the coupon answer
  // rather than the generic order one.
  if (/(cupo|promo|desconto)/.test(prompt)) {
    // Trouble first: "o cupom novo não aparece" carries both a creation word and
    // a complaint, and the complaint is what the member needs answered.
    if (/(nao aparece|nao funciona|nao aplica|recusad|invalido)/.test(prompt))
      return KOMI_COUPON_REPLIES.notShowing;
    if (/(criar|novo|como faco|como criar|montar)/.test(prompt)) return KOMI_COUPON_REPLIES.create;

    return KOMI_REPLIES.promotions;
  }

  // "Resuma os pedidos de hoje" is one of the three suggestion chips, so orders
  // must resolve to their own reply instead of the rotating fallback.
  if (/(pedido|venda)/.test(prompt)) return KOMI_REPLIES.orders;

  if (/(vitrine|loja)/.test(prompt)) return KOMI_REPLIES.storefront;
  return nextRotatingReply();
};

// Abortable delay: a cancelled run rejects at once, so neither the timer nor the abort listener outlives it.
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

const KomiModelAdapter: ChatModelAdapter = {
  async run({ messages, abortSignal }) {
    await sleep(700, abortSignal);

    const userMessage = messages.findLast((message) => message.role === "user");
    if (!userMessage) return { content: [{ type: "text", text: KOMI_GREETING }] };

    const prompt = normalize(
      userMessage.content.map((part) => (part.type === "text" ? part.text : "")).join(" "),
    );

    return { content: [{ type: "text", text: replyTo(prompt) }] };
  },
};

// The modal header renders `title || "New Chat"` and the in-memory adapter streams an empty title,
// so the title is seeded through `initialize` — the one call the runtime makes for a new thread.
class KomiThreadListAdapter extends InMemoryThreadListAdapter {
  override async initialize(
    threadId: string,
    options?: Parameters<InMemoryThreadListAdapter["initialize"]>[1],
  ) {
    const result = await super.initialize(threadId, options);
    await this.rename(result.remoteId, "Komi");
    return result;
  }
}

const komiThreadList = new KomiThreadListAdapter();

const useKomiLocalRuntime = () =>
  useLocalRuntime(KomiModelAdapter, {
    adapters: { suggestion: { generate: async () => KOMI_PROMPTS } },
  });

const useKomiRuntime = () =>
  useRemoteThreadListRuntime({
    adapter: komiThreadList,
    runtimeHook: useKomiLocalRuntime,
  });

export function KomiAssistant() {
  const runtime = useKomiRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantModal />
    </AssistantRuntimeProvider>
  );
}
