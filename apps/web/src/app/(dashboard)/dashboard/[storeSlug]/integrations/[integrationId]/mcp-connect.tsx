"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

/**
 * The snippet a member pastes into an MCP client.
 *
 * Two forms, because clients differ: Claude Code and Codex take an `mcp add`
 * command with the URL, while ChatGPT's connector flow takes just the URL. The
 * URL is the public `/mcp` endpoint, reached through the web app's rewrite — it
 * is the same origin the member is already on.
 */
export function McpConnectBlock({ serverUrl }: { serverUrl: string }) {
  const [copied, setCopied] = useState<"cli" | "url" | null>(null);

  const cliCommand = `claude mcp add --transport http menuza ${serverUrl}`;

  async function copy(value: string, which: "cli" | "url") {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Claude Code / Codex (CLI)</span>
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <code>{cliCommand}</code>
          </pre>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Copiar comando"
            onClick={() => copy(cliCommand, "cli")}
          >
            {copied === "cli" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ao rodar, o cliente abre o navegador para você autorizar esta loja. Em Codex, o comando
          equivalente é <code>codex mcp add menuza --url {serverUrl}</code>.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">ChatGPT / clientes com conector por URL</span>
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <code>{serverUrl}</code>
          </pre>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Copiar URL do servidor"
            onClick={() => copy(serverUrl, "url")}
          >
            {copied === "url" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O cliente usa OAuth: ao conectar, escolha as lojas e autorize. Cada conexão vira uma
          sessão revogável abaixo.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Passo a passo:{" "}
        <ExternalDocLink href="https://code.claude.com/docs/en/mcp-quickstart">
          Claude Code — conectar servidores MCP
        </ExternalDocLink>{" "}
        ·{" "}
        <ExternalDocLink href="https://developers.openai.com/plugins/build/mcp-server">
          OpenAI — servidor MCP remoto
        </ExternalDocLink>
      </p>
    </div>
  );
}

function ExternalDocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-border underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  );
}
