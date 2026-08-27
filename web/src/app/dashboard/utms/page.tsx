"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Link2,
  Copy,
  Check,
  Trash2,
  Sparkles,
  Tag,
  RefreshCw,
  ChevronDown,
  Clock,
  ExternalLink,
} from "lucide-react";

interface UtmEntry {
  id: string;
  url: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  finalUrl: string;
  createdAt: string;
}

const META_TEMPLATES = [
  {
    label: "Meta Ads — Campanha Padrão",
    source: "facebook",
    medium: "cpc",
    campaign: "{{campaign.name}}",
    content: "{{ad.id}}",
    term: "{{adset.id}}",
  },
  {
    label: "Meta Ads — Rastreamento ATM completo",
    source: "act_{{account.id}}",
    medium: "{{adset.id}}",
    campaign: "{{campaign.name}}|{{campaign.id}}",
    content: "{{ad.name}}|{{ad.id}}",
    term: "",
  },
  {
    label: "Meta Ads — Apenas IDs (para atribuição precisa)",
    source: "facebook",
    medium: "paid",
    campaign: "{{campaign.id}}",
    content: "{{ad.id}}",
    term: "{{adset.id}}",
  },
  {
    label: "Google Ads — Padrão",
    source: "google",
    medium: "cpc",
    campaign: "{campaign}",
    content: "{creative}",
    term: "{keyword}",
  },
  {
    label: "E-mail Marketing",
    source: "email",
    medium: "newsletter",
    campaign: "",
    content: "",
    term: "",
  },
  {
    label: "WhatsApp / Orgânico",
    source: "whatsapp",
    medium: "social",
    campaign: "",
    content: "",
    term: "",
  },
];

function buildUtmUrl(
  url: string,
  source: string,
  medium: string,
  campaign: string,
  content: string,
  term: string
): string {
  if (!url) return "";
  try {
    const base = url.startsWith("http") ? url : `https://${url}`;
    const u = new URL(base);
    if (source) u.searchParams.set("utm_source", source);
    if (medium) u.searchParams.set("utm_medium", medium);
    if (campaign) u.searchParams.set("utm_campaign", campaign);
    if (content) u.searchParams.set("utm_content", content);
    if (term) u.searchParams.set("utm_term", term);
    return u.toString();
  } catch {
    return url;
  }
}

export default function UtmBuilderPage() {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("facebook");
  const [medium, setMedium] = useState("cpc");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<UtmEntry[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  const finalUrl = buildUtmUrl(url, source, medium, campaign, content, term);

  // Carrega histórico do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("atm_utm_history");
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  }, []);

  const saveToHistory = useCallback(() => {
    if (!finalUrl || !url) return;
    const entry: UtmEntry = {
      id: Date.now().toString(),
      url,
      source,
      medium,
      campaign,
      content,
      term,
      finalUrl,
      createdAt: new Date().toISOString(),
    };
    const updated = [entry, ...history].slice(0, 20);
    setHistory(updated);
    try {
      localStorage.setItem("atm_utm_history", JSON.stringify(updated));
    } catch {}
  }, [finalUrl, url, source, medium, campaign, content, term, history]);

  const handleCopy = async () => {
    if (!finalUrl) return;
    await navigator.clipboard.writeText(finalUrl);
    setCopied(true);
    saveToHistory();
    setTimeout(() => setCopied(false), 2500);
  };

  const applyTemplate = (tpl: (typeof META_TEMPLATES)[0]) => {
    setSource(tpl.source);
    setMedium(tpl.medium);
    setCampaign(tpl.campaign);
    setContent(tpl.content);
    setTerm(tpl.term);
    setShowTemplates(false);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("atm_utm_history");
  };

  const loadFromHistory = (entry: UtmEntry) => {
    setUrl(entry.url);
    setSource(entry.source);
    setMedium(entry.medium);
    setCampaign(entry.campaign);
    setContent(entry.content);
    setTerm(entry.term);
  };

  return (
    <div className="max-w-4xl mx-auto pb-16 space-y-6 fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight flex items-center gap-2.5">
          <Tag size={24} className="text-[var(--color-brand-300)]" />
          Construtor de UTMs
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Gere links rastreáveis para campanhas de Meta Ads, Google, e-mail e outras fontes de tráfego.
        </p>
      </div>

      {/* Form Principal */}
      <div className="glass-card p-6 space-y-5">
        {/* URL Base + Templates */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
              URL de Destino <span className="text-[var(--color-danger-400)]">*</span>
            </label>
            <div className="relative">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-brand-300)] hover:text-[var(--color-brand-200)] transition-colors"
              >
                <Sparkles size={13} />
                Templates
                <ChevronDown size={12} className={showTemplates ? "rotate-180 transition-transform" : "transition-transform"} />
              </button>

              {showTemplates && (
                <div className="absolute right-0 top-7 z-50 w-72 bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-xl shadow-2xl overflow-hidden">
                  {META_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      onClick={() => applyTemplate(tpl)}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-[var(--color-bg-surface)] transition-colors border-b border-[var(--color-border-subtle)] last:border-0"
                    >
                      <p className="font-semibold text-[var(--color-text-primary)]">{tpl.label}</p>
                      <p className="text-[var(--color-text-muted)] mt-0.5 truncate">
                        source={tpl.source} · medium={tpl.medium}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="relative">
            <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://suaoferta.com/produto"
              className="input pl-9 text-sm"
            />
          </div>
        </div>

        {/* Grid de parâmetros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "utm_source", desc: "Origem do tráfego", value: source, setter: setSource, placeholder: "facebook, google, email" },
            { label: "utm_medium", desc: "Canal de marketing", value: medium, setter: setMedium, placeholder: "cpc, email, social" },
            { label: "utm_campaign", desc: "Nome ou ID da campanha", value: campaign, setter: setCampaign, placeholder: "black_friday_2026" },
            { label: "utm_content", desc: "Criativo ou ID do anúncio", value: content, setter: setContent, placeholder: "{{ad.id}}" },
          ].map(({ label, desc, value, setter, placeholder }) => (
            <div key={label} className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] flex items-center gap-1">
                <code className="text-[var(--color-brand-300)] font-mono">{label}</code>
                <span className="text-[var(--color-text-muted)] font-normal">— {desc}</span>
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder={placeholder}
                className="input text-sm"
              />
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] flex items-center gap-1">
              <code className="text-[var(--color-brand-300)] font-mono">utm_term</code>
              <span className="text-[var(--color-text-muted)] font-normal">— Palavra-chave (opcional)</span>
            </label>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="{{adset.id}} ou palavra-chave do Google"
              className="input text-sm"
            />
          </div>
        </div>

        {/* Preview do Link */}
        {finalUrl && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
              Link Final Gerado
            </label>
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] rounded-xl p-4 flex items-start gap-3">
              <code className="flex-1 text-xs text-emerald-400 break-all leading-relaxed font-mono">
                {finalUrl}
              </code>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={finalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
                  title="Abrir link"
                >
                  <ExternalLink size={14} />
                </a>
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    copied
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-[var(--color-brand-500)] text-white hover:bg-[var(--color-brand-400)] shadow-[0_0_12px_rgba(99,102,241,0.3)]"
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Botão limpar campos */}
        <div className="flex justify-end">
          <button
            onClick={() => {
              setUrl(""); setSource("facebook"); setMedium("cpc");
              setCampaign(""); setContent(""); setTerm("");
            }}
            className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger-400)] transition-colors"
          >
            <RefreshCw size={12} />
            Limpar campos
          </button>
        </div>
      </div>

      {/* Guia de variáveis dinâmicas */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <Sparkles size={15} className="text-[var(--color-brand-300)]" />
          Variáveis Dinâmicas do Meta Ads
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          O Facebook substitui automaticamente essas variáveis ao publicar o anúncio.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {[
            { var: "{{campaign.id}}", desc: "ID da Campanha" },
            { var: "{{campaign.name}}", desc: "Nome da Campanha" },
            { var: "{{adset.id}}", desc: "ID do Conjunto" },
            { var: "{{adset.name}}", desc: "Nome do Conjunto" },
            { var: "{{ad.id}}", desc: "ID do Anúncio" },
            { var: "{{ad.name}}", desc: "Nome do Anúncio" },
            { var: "{{account.id}}", desc: "ID da Conta" },
            { var: "{{placement}}", desc: "Posicionamento" },
          ].map(({ var: v, desc }) => (
            <div
              key={v}
              className="p-2.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] space-y-1 cursor-pointer hover:border-[var(--color-brand-500)]/50 transition-colors"
              onClick={() => navigator.clipboard.writeText(v)}
              title="Clique para copiar"
            >
              <code className="text-[11px] font-mono text-[var(--color-brand-300)] block">{v}</code>
              <p className="text-[10px] text-[var(--color-text-muted)]">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico */}
      {history.length > 0 && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <Clock size={15} className="text-[var(--color-text-muted)]" />
              Histórico de Links ({history.length})
            </h3>
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger-400)] transition-colors"
            >
              <Trash2 size={12} />
              Limpar
            </button>
          </div>
          <div className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                onClick={() => loadFromHistory(entry)}
                className="p-3 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] cursor-pointer hover:border-[var(--color-brand-500)]/40 transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-muted)] truncate font-mono">
                      {entry.finalUrl}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-[var(--color-brand-300)] font-semibold">{entry.source}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">·</span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">{entry.medium}</span>
                      {entry.campaign && (
                        <>
                          <span className="text-[10px] text-[var(--color-text-muted)]">·</span>
                          <span className="text-[10px] text-[var(--color-text-muted)] truncate max-w-[120px]">{entry.campaign}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {new Date(entry.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit", month: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await navigator.clipboard.writeText(entry.finalUrl);
                      }}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                      title="Copiar"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
