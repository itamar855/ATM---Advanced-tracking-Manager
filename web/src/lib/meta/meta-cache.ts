/**
 * web/src/lib/meta/meta-cache.ts
 *
 * ATM Meta Multi-Tenant Cache Layer
 *
 * Princípios de Arquitetura:
 * 1. Isolamento Estrito: Toda chave é associada a store_id e hash do token.
 * 2. Blindagem Multi-Tenant: Validação estrita de store_id na leitura — dados de outro tenant NUNCA são retornados.
 * 3. TTL Definido e Expiração Ativa: Entradas expiradas são descartadas imediatamente.
 * 4. Invalidação Manual: Suporte a bypass/limpeza via `refresh=true` ou chamada direta.
 * 5. Métricas e Observabilidade: Registros detalhados de HIT, MISS e tempos de execução.
 */

import crypto from "crypto";

export interface CacheEntry<T> {
  storeId: string;
  tokenHash: string;
  data: T;
  createdAt: number;
  expiresAt: number;
}

export interface CacheLookupResult<T> {
  hit: boolean;
  data: T | null;
  ageMs: number;
  remainingTtlMs: number;
}

class MetaMemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private hitCount = 0;
  private missCount = 0;

  /**
   * Gera hash seguro do token para isolamento sem expor o segredo em logs ou chaves
   */
  public hashToken(token: string): string {
    if (!token) return "no_token";
    return crypto.createHash("sha256").update(token.trim()).digest("hex").slice(0, 16);
  }

  /**
   * Constrói chave canônica isolada por loja, escopo e token
   */
  public buildKey(scope: string, storeId: string, token: string): string {
    const tHash = this.hashToken(token);
    return `${scope}:${storeId}:${tHash}`;
  }

  /**
   * Recupera entrada do cache com validação multi-tenant estrita
   */
  public get<T>(scope: string, storeId: string, token: string): CacheLookupResult<T> {
    const key = this.buildKey(scope, storeId, token);
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry) {
      this.missCount++;
      return { hit: false, data: null, ageMs: 0, remainingTtlMs: 0 };
    }

    // Blindagem Multi-Tenant: Nunca entrega dados se a loja não coincidir
    if (entry.storeId !== storeId) {
      console.warn(`[MetaCache] 🚨 TENTATIVA DE VIOLAÇÃO MULTI-TENANT: chave requisitada por ${storeId}, mas pertence a ${entry.storeId}`);
      this.cache.delete(key);
      this.missCount++;
      return { hit: false, data: null, ageMs: 0, remainingTtlMs: 0 };
    }

    // Expiração por TTL
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.missCount++;
      return { hit: false, data: null, ageMs: 0, remainingTtlMs: 0 };
    }

    this.hitCount++;
    return {
      hit: true,
      data: entry.data,
      ageMs: now - entry.createdAt,
      remainingTtlMs: entry.expiresAt - now,
    };
  }

  /**
   * Grava entrada no cache com TTL definido
   */
  public set<T>(
    scope: string,
    storeId: string,
    token: string,
    data: T,
    ttlMs: number = 5 * 60 * 1000 // 5 minutos por padrão
  ): void {
    const key = this.buildKey(scope, storeId, token);
    const now = Date.now();
    const tokenHash = this.hashToken(token);

    this.cache.set(key, {
      storeId,
      tokenHash,
      data,
      createdAt: now,
      expiresAt: now + ttlMs,
    });

    // Limpeza de segurança caso a coleção cresça muito (máximo 500 chaves)
    if (this.cache.size > 500) {
      this.cleanupExpired();
    }
  }

  /**
   * Invalida explicitamente entradas de uma loja
   */
  public invalidateStore(storeId: string, scope?: string): number {
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.storeId === storeId) {
        if (!scope || key.startsWith(`${scope}:`)) {
          this.cache.delete(key);
          removed++;
        }
      }
    }
    return removed;
  }

  /**
   * Limpa chaves expiradas
   */
  public cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Estatísticas operacionais do cache
   */
  public getStats() {
    return {
      size: this.cache.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRatio: this.hitCount + this.missCount > 0
        ? ((this.hitCount / (this.hitCount + this.missCount)) * 100).toFixed(1) + "%"
        : "0%",
    };
  }

  /**
   * Limpa todo o cache (uso interno para testes)
   */
  public clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }
}

// Instância singleton global para persistência em memória do processo Node.js
const globalForMetaCache = globalThis as unknown as { metaMemoryCache?: MetaMemoryCache };
export const metaCache = globalForMetaCache.metaMemoryCache || new MetaMemoryCache();
if (process.env.NODE_ENV !== "production") {
  globalForMetaCache.metaMemoryCache = metaCache;
}
