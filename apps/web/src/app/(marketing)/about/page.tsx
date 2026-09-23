import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h2 className="text-3xl font-bold tracking-tight">Sobre</h2>
      <p className="mt-4 max-w-2xl text-lg text-neutral-700 dark:text-neutral-300">
        Menuza é a fundação local para catálogos, pedidos e gestão. Esta página ainda é um esboço:
        nenhum conteúdo institucional foi definido nesta fase.
      </p>
      <Link href="/" className="mt-8 inline-block text-sm hover:underline">
        Voltar para o início
      </Link>
    </main>
  );
}
