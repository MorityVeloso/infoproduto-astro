/**
 * product.ts — Configuração central do produto.
 *
 * Este é o único arquivo que você precisa editar para adaptar
 * o skeleton a um novo infoproduto. Todos os outros módulos
 * importam daqui — nada mais hardcoded.
 *
 * Valores que dependem de ambiente (chaves, URLs) devem vir
 * de import.meta.env e ficam em .env.local / variáveis de CI.
 */

export const PRODUCT = {
  // ── Identidade ────────────────────────────────────────────────
  /** Código único do produto. Usado em entitlements e emails. */
  code: 'MEU_PRODUTO',

  /** Nome de exibição. Aparece em emails, admin e checkout. */
  name: 'Meu Produto',

  /** Descrição curta. Usada no campo "description" da cobrança Asaas. */
  description: 'Meu Produto — Descrição para a cobrança',

  // ── Preços (BRL) ──────────────────────────────────────────────
  pricing: {
    /** Preço base em reais. */
    base: 0.00,

    /** Order bump (opcional). 0 = desabilitado. */
    bump: 0.00,
  },

  // ── Validação de pagamento ────────────────────────────────────
  payment: {
    /**
     * Valor mínimo aceito no webhook do Asaas (com tolerância de R$ 0,01).
     * Normalmente igual a pricing.base. Pode ser menor para aceitar
     * cupons / descontos sem rejeitar o webhook.
     */
    minAmount: 0.00,
  },

  // ── Emails ────────────────────────────────────────────────────
  email: {
    /** Nome da marca exibido no cabeçalho dos emails transacionais. */
    brandName: 'Meu Produto',

    /**
     * Remetente dos emails. Substitui EMAIL_FROM do .env se definido.
     * Formato: "Nome <email@dominio.com>"
     */
    from: undefined as string | undefined,
  },

  // ── Rotas ─────────────────────────────────────────────────────
  routes: {
    /** Para onde o magic link redireciona após login. */
    afterLogin: '/app',

    /** Página raiz da área do cliente. */
    appHome: '/app',
  },

  // ── WhatsApp ──────────────────────────────────────────────────
  // O número é lido de PUBLIC_WHATSAPP_NUMBER no .env (veja .env.example).
  whatsapp: {
    /**
     * Mensagem pré-preenchida quando o visitante clica no botão.
     * Personalize para o contexto do seu produto.
     */
    prefilledMessage: 'Olá! Tenho uma dúvida sobre o produto.',

    /** Posição do botão flutuante: 'right' (padrão) ou 'left'. */
    position: 'right' as 'right' | 'left',
  },
} as const;

export type ProductConfig = typeof PRODUCT;
