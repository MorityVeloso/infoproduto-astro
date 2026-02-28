/**
 * email.ts — Sistema de emails transacionais.
 *
 * Dois emails no fluxo de compra:
 *   1. sendOrderCreatedEmail  — enviado após checkout (PIX aguardando / cartão processando)
 *   2. sendAccessEmail        — enviado após pagamento confirmado (magic link de acesso)
 *
 * Ambos retornam boolean (true = aceito pela API, false = falha) sem lançar exceção.
 * Provider: Resend. Fallback para console se RESEND_API_KEY não configurada.
 *
 * ── Personalizar ────────────────────────────────────────────────────────────
 * Edite as funções `sendOrderCreatedEmail` e `sendAccessEmail` para ajustar
 * o copy de acordo com o seu produto. O layout (emailWrapper) e o send()
 * são genéricos e não precisam de mudança.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PRODUCT } from '../config/product';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface OrderCreatedOpts {
  orderId:       string;
  amount:        number;
  paymentMethod: 'pix' | 'credit_card';
  pixCode?:      string;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function formatBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

/** Envolve o conteúdo em um layout de email com a marca do produto. */
function emailWrapper(title: string, bodyHtml: string): string {
  const brand = PRODUCT.email.brandName;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'DM Sans',Helvetica Neue,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f172a;border-radius:16px;overflow:hidden;">

          <!-- Logo / Brand -->
          <tr>
            <td style="padding:28px 40px 20px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07);">
              <div style="display:inline-block;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:6px 14px;margin-bottom:12px;">
                <span style="font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#4ade80;">${brand}</span>
              </div>
              <div style="font-size:20px;font-weight:700;color:#f8fafc;line-height:1.3;">${title}</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 40px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 40px 26px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;">
              <p style="margin:0 0 5px;color:#64748b;font-size:12px;line-height:1.5;">
                Dúvidas? Responda este email que te ajudamos.
              </p>
              <p style="margin:0;color:#64748b;font-size:12px;">
                Se você não realizou esta compra, ignore este email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = import.meta.env.RESEND_API_KEY as string | undefined;
  const from   = PRODUCT.email.from
    ?? (import.meta.env.EMAIL_FROM as string | undefined)
    ?? `${PRODUCT.email.brandName} <noreply@exemplo.com>`;

  if (!apiKey) {
    console.log('[email] RESEND_API_KEY não configurada — email para:', to, '|', subject);
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('[email] Resend falhou:', res.status, err, '| para:', to);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[email] Erro de rede:', err, '| para:', to);
    return false;
  }
}

// ── Emails exportados ─────────────────────────────────────────────────────────
// TODO: Personalize o copy abaixo para o seu produto.

/**
 * Email 1 — Pedido recebido.
 * PIX: inclui o código copy-paste e instrução de pagamento.
 * Cartão pendente: informa que o pagamento está sendo processado.
 */
export async function sendOrderCreatedEmail(
  name:  string,
  email: string,
  opts:  OrderCreatedOpts,
): Promise<boolean> {
  const firstName = name.split(' ')[0];
  const amountStr = formatBRL(opts.amount);
  const productName = PRODUCT.name;

  if (opts.paymentMethod === 'pix') {
    const subject = `Pedido recebido! Falta só confirmar o PIX`;

    const pixBlock = opts.pixCode
      ? `<div style="margin:20px 0;">
           <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
             Código PIX (Copia e Cola)
           </p>
           <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:14px 16px;word-break:break-all;font-family:monospace;font-size:12px;color:#94a3b8;line-height:1.6;">
             ${opts.pixCode}
           </div>
         </div>`
      : '';

    const body = `
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        Olá, <strong style="color:#f8fafc;">${firstName}!</strong>
      </p>
      <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        Recebemos seu pedido de <strong style="color:#f8fafc;">${productName}</strong> no valor de
        <strong style="color:#4ade80;">${amountStr}</strong>. Para liberar seu acesso, realize o pagamento via PIX:
      </p>

      ${pixBlock}

      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px 16px;margin-top:20px;">
        <p style="margin:0;color:#fbbf24;font-size:13px;line-height:1.5;">
          ⏱ O código PIX vence em breve. Após o pagamento, você receberá um email com acesso ao seu produto.
        </p>
      </div>
    `;

    return send(email, subject, emailWrapper(subject, body));

  } else {
    const subject = 'Pedido recebido! Processando seu pagamento';

    const body = `
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        Olá, <strong style="color:#f8fafc;">${firstName}!</strong>
      </p>
      <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        Recebemos seu pedido de <strong style="color:#f8fafc;">${productName}</strong> no valor de
        <strong style="color:#4ade80;">${amountStr}</strong>. Estamos processando seu pagamento.
      </p>
      <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:8px;padding:14px 16px;">
        <p style="margin:0;color:#86efac;font-size:14px;line-height:1.5;">
          ✓ Você receberá um email de confirmação com seu acesso assim que o pagamento for aprovado.
        </p>
      </div>
    `;

    return send(email, subject, emailWrapper('Pedido recebido!', body));
  }
}

/**
 * Email 2 — Acesso liberado após pagamento confirmado.
 * Inclui magic link (expira em 24h) para entrar no dashboard.
 *
 * TODO: Substitua `deliveryItems` pelos itens do seu produto.
 */
export async function sendAccessEmail(
  email:     string,
  magicLink: string,
  name:      string = 'Cliente',
): Promise<boolean> {
  if (!magicLink.startsWith('https://')) {
    console.error('[email] magicLink inválido:', magicLink.slice(0, 40));
    return false;
  }

  const firstName   = name.split(' ')[0];
  const productName = PRODUCT.name;
  const subject     = `Seu acesso a ${productName} está pronto, ${firstName}! 🎉`;

  // TODO: Personalize os itens de entrega do seu produto
  const deliveryItems: [string, string, string][] = [
    ['📦', 'Seu Produto', 'Descrição do que o cliente recebe'],
  ];

  const itemList = deliveryItems.map(([icon, title, desc]) => `
    <tr>
      <td style="padding:8px 0;vertical-align:top;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:32px;vertical-align:top;padding-top:2px;">
              <span style="font-size:16px;">${icon}</span>
            </td>
            <td>
              <span style="color:#f8fafc;font-size:14px;font-weight:600;">${title}</span>
              <span style="color:#64748b;font-size:13px;"> — ${desc}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const body = `
    <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.6;">
      Olá, <strong style="color:#f8fafc;">${firstName}!</strong>
    </p>
    <p style="margin:0 0 22px;color:#cbd5e1;font-size:15px;line-height:1.6;">
      Seu pagamento foi confirmado. Acesse agora:
    </p>

    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${itemList}
      </table>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${magicLink}"
             style="display:inline-block;padding:14px 40px;background:#16a34a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:10px;letter-spacing:0.02em;box-shadow:0 4px 20px rgba(34,197,94,0.3);">
            Acessar ${productName} →
          </a>
        </td>
      </tr>
    </table>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:12px 16px;">
      <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.5;">
        ⏱ O link de acesso expira em <strong style="color:#cbd5e1;">24 horas</strong>.
        Após fazer login, sua conta fica ativa <strong style="color:#cbd5e1;">permanentemente</strong>.
      </p>
    </div>
  `;

  return send(email, subject, emailWrapper(`Seu acesso está pronto! 🎉`, body));
}
