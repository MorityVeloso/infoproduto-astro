/**
 * assets.ts — Helpers para construir e validar asset keys do produto.
 *
 * As keys correspondem a caminhos no bucket `protected-assets` do Supabase Storage.
 *
 * ── Como usar ───────────────────────────────────────────────────────────────
 * 1. Defina a estrutura de arquivos do seu produto implementando `buildAssetList`.
 * 2. Ajuste `isAllowedAsset` para refletir todos os paths permitidos.
 * 3. O bucket no Supabase Storage deve ser `protected-assets` com RLS.
 *
 * Exemplo de estrutura para um curso em vídeo:
 *   assets/modulo-1/aula-01.mp4
 *   assets/modulo-1/aula-02.mp4
 *   assets/materiais/apostila.pdf
 *
 * Exemplo de estrutura para um produto de PDF (como quarto-de-bebe):
 *   kit/{modelo}/{tamanho}/projeto.pdf
 *   kit/{modelo}/lista-compras.pdf
 *   kit/common/checklist.pdf
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Tipos ─────────────────────────────────────────────────────────────────────

/**
 * Mapa de asset keys para o produto.
 * Substitua esta interface pelos arquivos do seu produto.
 */
export interface AssetList {
  // TODO: Defina os assets do seu produto
  // Exemplo:
  // mainPdfKey:  string;
  // bonusKey:    string;
  [key: string]: string | string[];
}

export interface AssetExistence {
  // TODO: Espelhe a estrutura de AssetList com boolean
  [key: string]: boolean | boolean[];
}

// ── Implementação ─────────────────────────────────────────────────────────────

/**
 * Constrói a lista canônica de asset keys para um cliente.
 *
 * TODO: Implemente de acordo com a estrutura de arquivos do seu produto.
 * Recebe identificadores do pedido (ex: orderId, variante, plano) e retorna
 * os caminhos dos arquivos no Storage.
 */
export function buildAssetList(orderId: string): AssetList {
  // TODO: Substitua com a estrutura real do seu produto
  return {
    // mainPdfKey: `orders/${orderId}/produto.pdf`,
  };
}

/**
 * Verifica quais assets existem no Storage.
 *
 * TODO: Implemente de acordo com a estrutura de buildAssetList.
 */
export async function checkAssetExistence(
  admin: SupabaseClient,
  orderId: string,
): Promise<AssetExistence> {
  // TODO: Use admin.storage.from('protected-assets').list() para verificar
  // a existência dos arquivos. Veja quarto-de-bebe-astro/src/lib/assets.ts
  // para um exemplo completo com múltiplas pastas em paralelo.
  return {};
}

/**
 * Retorna true se assetKey é permitida para o usuário.
 * Nunca assine uma URL de asset que não esteja nesta lista.
 *
 * TODO: Implemente para incluir todos os paths do buildAssetList.
 */
export function isAllowedAsset(assetKey: string, orderId: string): boolean {
  const list = buildAssetList(orderId);
  const allKeys = Object.values(list).flat() as string[];
  return allKeys.includes(assetKey);
}
