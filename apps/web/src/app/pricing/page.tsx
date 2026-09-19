import Link from "next/link";

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h2 className="text-3xl font-bold tracking-tight">Planos</h2>
      <p className="mt-4 max-w-2xl text-lg text-neutral-700 dark:text-neutral-300">
        Planos e preços ainda não foram definidos. Esta é apenas a casca pública de apresentação do
        Menuza.
      </p>
      <Link href="/" className="mt-8 inline-block text-sm hover:underline">
        Voltar para o início
      </Link>
    </main>
  );
}
