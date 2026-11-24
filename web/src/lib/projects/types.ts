/**
 * Tipos de projeto do ATM. Cada "loja" (tabela stores) tem um tipo, que muda
 * o cadastro, o menu e as telas do painel. Sem banco: dá para usar no cliente e no servidor.
 */

export type ProjectType = "ecommerce" | "infoproduct" | "app";

export const PROJECT_TYPES: ProjectType[] = ["ecommerce", "infoproduct", "app"];

export interface ProjectTypeInfo {
  label: string;
  short: string;
  description: string;
  domainLabel: string;
  domainPlaceholder: string;
  domainHint: string;
  /** Plataforma gravada em stores.platform quando o projeto é criado. */
  platform: "shopify" | "custom";
  /** Mostra a tela de Assinaturas no menu. */
  showSubscriptions: boolean;
  /** Mostra o que só existe na Shopify (sincronizar pedidos, app da Shopify). */
  showShopify: boolean;
  salesLabel: string;
}

export const PROJECT_TYPE_INFO: Record<ProjectType, ProjectTypeInfo> = {
  ecommerce: {
    label: "Loja (e-commerce)",
    short: "Loja",
    description: "Loja Shopify ou outra loja virtual, com carrinho e produto físico.",
    domainLabel: "Domínio da loja (.myshopify.com)",
    domainPlaceholder: "minhaloja.myshopify.com",
    domainHint: "O domínio .myshopify.com da loja. Domínios próprios vão em CNAME, mais abaixo.",
    platform: "shopify",
    showSubscriptions: false,
    showShopify: true,
    salesLabel: "Pedidos & Vendas",
  },
  infoproduct: {
    label: "Infoproduto",
    short: "Infoproduto",
    description: "Curso, e-book ou mentoria vendido na sua página, com PIX pela sua API ou por uma plataforma.",
    domainLabel: "Domínio da página de vendas",
    domainPlaceholder: "meucurso.com.br",
    domainHint: "O domínio onde fica a página de vendas. Outros domínios vão em CNAME, mais abaixo.",
    platform: "custom",
    showSubscriptions: false,
    showShopify: false,
    salesLabel: "Vendas",
  },
  app: {
    label: "Web app (assinatura)",
    short: "Web app",
    description: "App vendido por assinatura (mensal, anual...). Mostra MRR, churn, LTV e CAC por campanha.",
    domainLabel: "Domínio do app ou da página de vendas",
    domainPlaceholder: "meuapp.com.br",
    domainHint: "O domínio principal do app ou da página de vendas. Outros domínios vão em CNAME, mais abaixo.",
    platform: "custom",
    showSubscriptions: true,
    showShopify: false,
    salesLabel: "Cobranças & Vendas",
  },
};

/** Tipo do projeto, com 'ecommerce' para lojas antigas ou valor desconhecido. */
export function projectTypeOf(store?: { project_type?: string | null } | null): ProjectType {
  const t = store?.project_type;
  return t === "infoproduct" || t === "app" ? t : "ecommerce";
}

export function projectInfo(store?: { project_type?: string | null } | null): ProjectTypeInfo {
  return PROJECT_TYPE_INFO[projectTypeOf(store)];
}

/**
 * Limpa o domínio digitado: tira https://, www., caminho, porta e espaços.
 * "https://www.MeuCurso.com.br/oferta?x=1" → "meucurso.com.br". Devolve "" se não parecer um domínio.
 */
export function normalizeDomain(input: string): string {
  let d = (input || "").trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  d = d.split(/[/?#]/)[0];
  d = d.split("@").pop() || "";
  d = d.replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) ? d : "";
}

/** Erro do Supabase/PostgREST quando a coluna project_type ainda não existe (migration 030 não rodada). */
export function isMissingProjectTypeColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /project_type/i.test(error.message || "");
}
