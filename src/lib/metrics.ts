// src/lib/metrics.ts
// Métricas genéricas de funil e receita. Sem campos específicos de produto
// (selected_model, selected_size foram removidos do skeleton).

export interface OrderRow {
  status:       string;
  paid_at:      string | null;
  amount_total: number;
  created_at:   string;
}

export interface SummaryResult {
  rangeDays: number;
  revenue:   { today: number; d7: number; d30: number; total: number };
  sales:     { today: number; d7: number; d30: number; total: number };
  refunds:   { d30: number };
  avgTicket: { d30: number };
}

export interface TimeseriesRow { date: string; paid_orders: number; revenue: number; }

export interface FunnelStep   { event: string; count: number; }
export interface FunnelRate   { from: string; to: string; rate: number; }
export interface FunnelResult { steps: FunnelStep[]; rates: FunnelRate[]; }

const MS_DAY = 86_400_000;

export function computeSummary(
  orders: OrderRow[],
  now: Date,
): SummaryResult {
  const todayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const d7Start    = new Date(now.getTime() - 7  * MS_DAY);
  const d30Start   = new Date(now.getTime() - 30 * MS_DAY);

  const paid     = orders.filter(r => r.status === 'paid' && r.paid_at);
  const refunded = orders.filter(r => r.status === 'refunded');

  const inRange = (rows: OrderRow[], from: Date) =>
    rows.filter(r => new Date(r.paid_at!) >= from);

  const sumAmt = (rows: OrderRow[]) =>
    rows.reduce((s, r) => s + (r.amount_total ?? 0), 0);

  const todayPaid  = inRange(paid, todayStart);
  const d7Paid     = inRange(paid, d7Start);
  const d30Paid    = inRange(paid, d30Start);
  const d30Refunds = refunded.filter(r => new Date(r.created_at) >= d30Start);

  const d30Revenue = sumAmt(d30Paid);
  const d30Sales   = d30Paid.length;

  return {
    rangeDays: 30,
    revenue:   { today: sumAmt(todayPaid), d7: sumAmt(d7Paid), d30: d30Revenue, total: sumAmt(paid) },
    sales:     { today: todayPaid.length,  d7: d7Paid.length,  d30: d30Sales,   total: paid.length },
    refunds:   { d30: d30Refunds.length },
    avgTicket: { d30: d30Sales > 0 ? d30Revenue / d30Sales : 0 },
  };
}

export function computeTimeseries(
  orders: { paid_at: string; amount_total: number }[],
  days: number,
  now: Date,
): TimeseriesRow[] {
  const result: Record<string, { paid_orders: number; revenue: number }> = {};

  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date(now.getTime() - i * MS_DAY);
    const key = d.toISOString().slice(0, 10);
    result[key] = { paid_orders: 0, revenue: 0 };
  }

  for (const r of orders) {
    const key = new Date(r.paid_at).toISOString().slice(0, 10);
    if (result[key]) {
      result[key].paid_orders++;
      result[key].revenue += r.amount_total ?? 0;
    }
  }

  return Object.entries(result).map(([date, v]) => ({ date, ...v }));
}

const FUNNEL_EVENTS = ['view_landing', 'click_cta', 'view_checkout', 'start_payment'] as const;

export function computeFunnel(
  events: { event: string; session_id: string | null }[],
  paidCount: number,
): FunnelResult {
  const counts: Record<string, number> = {};

  for (const name of FUNNEL_EVENTS) {
    const forEvent    = events.filter(e => e.event === name);
    const withSession = forEvent.filter(e => e.session_id != null);
    counts[name] = withSession.length > 0
      ? new Set(withSession.map(e => e.session_id)).size
      : forEvent.length;
  }

  const steps: FunnelStep[] = [
    ...FUNNEL_EVENTS.map(name => ({ event: name, count: counts[name] })),
    { event: 'paid_orders', count: paidCount },
  ];

  const rates: FunnelRate[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    rates.push({
      from: steps[i].event,
      to:   steps[i + 1].event,
      rate: steps[i].count > 0 ? Math.round(steps[i + 1].count / steps[i].count * 100) / 100 : 0,
    });
  }

  return { steps, rates };
}
