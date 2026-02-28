# infoproduto-astro

Skeleton de landing page + checkout + área do cliente para infoprodutos digitais.

Stack: **Astro SSR** + **Supabase** (Auth, DB, Storage) + **Asaas** (PIX + cartão) + **Resend** (email) + **pdf-lib** (watermark).

---

## O que está incluso

| Módulo | Descrição |
|---|---|
| Auth | Magic link via Supabase, sessão por cookie, guard de rota no middleware |
| Checkout | Criação de order, pagamento PIX/cartão via Asaas, polling de status |
| Webhooks | Asaas (pagamento + lifecycle) e Mercado Pago |
| Provisioning | Criar usuário, entitlement, enviar magic link após pagamento |
| Emails | Resend — pedido recebido + acesso liberado |
| Área do cliente | Dashboard + página de entrega (stub) |
| Admin | Painel de customers, orders, métricas de funil, modelos |
| Assets | Assets protegidos com URLs assinadas (Supabase Storage) |
| PDF Watermark | Inserção de marca d'água em PDFs com pdf-lib |
| Rate limiting | Token bucket por IP em todas as APIs críticas |

## O que você precisa implementar

1. **Landing page** → `src/pages/index.astro` + `src/components/landing/`
2. **Área de entrega** → `src/pages/app/acesso.astro`
3. **Config do produto** → `src/config/product.ts`
4. **Assets** → `src/lib/assets.ts` (estrutura de arquivos do seu produto)
5. **Emails** → copias dos emails em `src/lib/email.ts` (opcional, já tem template)

---

## Setup

### 1. Clone e instale

```bash
git clone https://github.com/seu-usuario/infoproduto-astro.git meu-produto
cd meu-produto
npm install
```

### 2. Configure o produto

Edite `src/config/product.ts`:

```ts
export const PRODUCT = {
  code:        'MEU_PRODUTO',
  name:        'Meu Produto',
  description: 'Meu Produto — Descrição para a cobrança Asaas',
  pricing: {
    base: 197.00,
    bump: 47.00,    // 0 = desabilita order bump
  },
  payment: {
    minAmount: 197.00,
  },
  email: {
    brandName: 'Meu Produto',
    from: undefined,  // sobrescrito por EMAIL_FROM no .env
  },
  routes: {
    afterLogin: '/app',
    appHome:    '/app',
  },
};
```

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env.local
# Edite .env.local com suas chaves
```

### 4. Configure o Supabase

```bash
# Execute o schema no SQL Editor do Supabase
cat sql/schema.sql
```

### 5. Configure o Asaas

No painel Asaas: **Configurações → Integrações → Webhooks**
- URL: `https://seu-dominio.com/api/webhooks/asaas`
- Copie o token e coloque em `ASAAS_WEBHOOK_TOKEN`

### 6. Rode localmente

```bash
npm run dev
```

---

## Estrutura

```
src/
├── config/
│   └── product.ts          ← Edite aqui primeiro
├── lib/
│   ├── supabase/            ← Clientes admin/server/browser
│   ├── auth.ts              ← getUserFromRequest, isAdmin
│   ├── email.ts             ← Emails transacionais (personalize o copy)
│   ├── provision-access.ts  ← Fluxo pós-pagamento
│   ├── assets.ts            ← Implemente para o seu produto
│   └── ...
├── pages/
│   ├── api/
│   │   ├── checkout/        ← create, pay, status
│   │   ├── webhooks/        ← asaas, mercadopago
│   │   ├── admin/           ← customers, orders, metrics
│   │   ├── assets/          ← list, sign
│   │   └── watermark/       ← generate, sign
│   ├── admin/               ← Painel admin pronto
│   ├── app/
│   │   ├── index.astro      ← TODO: dashboard do cliente
│   │   ├── acesso.astro     ← TODO: entrega do produto
│   │   └── conta.astro      ← Pronto
│   ├── index.astro          ← TODO: landing page
│   └── checkout.astro       ← Pronto (customize o copy)
└── middleware.ts             ← Auth guard
sql/
└── schema.sql               ← Execute no Supabase
```

---

## Promover admin

Após criar sua conta pelo fluxo normal:

```sql
update profiles set role = 'admin' where email = 'seu@email.com';
```

---

## Deploy

Recomendado: **Vercel** com SSR habilitado.

```bash
npm run build
```

Configure as variáveis de ambiente no painel da Vercel.
