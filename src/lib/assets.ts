/**
 * assets.ts — Helpers dinâmicos para assets de produtos.
 *
 * Lê da tabela `products` para determinar quais arquivos o cliente
 * pode baixar. Cada produto ativo com `asset_path` preenchido gera
 * um asset disponível.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProductAsset {
  productId: string;
  name: string;
  type: string;           // 'main' | 'order_bump' | 'brinde'
  assetPath: string;
  coverPath: string | null;
}

export interface AssetExistence {
  [assetPath: string]: boolean;
}

/**
 * Busca todos os produtos ativos que possuem arquivo entregável.
 */
export async function getProductAssets(admin: SupabaseClient): Promise<ProductAsset[]> {
  const { data, error } = await admin
    .from('products')
    .select('id, name, type, asset_path, cover_path')
    .eq('is_active', true)
    .not('asset_path', 'is', null)
    .order('sort_order', { ascending: true });

  if (error || !data) return [];

  return data.map((p) => ({
    productId: p.id as string,
    name: p.name as string,
    type: p.type as string,
    assetPath: p.asset_path as string,
    coverPath: (p.cover_path as string) ?? null,
  }));
}

/**
 * Verifica se cada asset existe no Storage.
 */
export async function checkAssetExistence(
  admin: SupabaseClient,
  assets: ProductAsset[],
): Promise<AssetExistence> {
  const result: AssetExistence = {};

  await Promise.all(
    assets.map(async (a) => {
      const parts = a.assetPath.split('/');
      const fileName = parts.pop()!;
      const folder = parts.join('/');

      const { data } = await admin.storage
        .from('protected-assets')
        .list(folder, { limit: 1, search: fileName });

      result[a.assetPath] = (data?.length ?? 0) > 0;
    }),
  );

  return result;
}

/**
 * Retorna true se assetPath pertence a um produto ativo.
 */
export function isAllowedAsset(assetPath: string, productAssets: ProductAsset[]): boolean {
  return productAssets.some((a) => a.assetPath === assetPath);
}
