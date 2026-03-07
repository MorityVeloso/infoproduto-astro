import { describe, it, expect } from 'vitest';
import { computeSummary, computeTimeseries, computeFunnel } from '../../src/lib/metrics';
import type { OrderRow } from '../../src/lib/metrics';

const now = new Date('2026-03-07T15:00:00.000Z');

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    status: 'paid',
    paid_at: '2026-03-07T10:00:00.000Z',
    amount_total: 97,
    created_at: '2026-03-07T09:00:00.000Z',
    ...overrides,
  };
}

describe('computeSummary', () => {
  it('returns zero for empty orders', () => {
    const result = computeSummary([], now);
    expect(result.revenue.total).toBe(0);
    expect(result.sales.total).toBe(0);
  });

  it('counts paid orders correctly', () => {
    const orders = [makeOrder(), makeOrder({ amount_total: 47 })];
    const result = computeSummary(orders, now);
    expect(result.sales.total).toBe(2);
    expect(result.sales.today).toBe(2);
    expect(result.revenue.total).toBe(144);
    expect(result.revenue.today).toBe(144);
  });

  it('excludes non-paid orders from revenue', () => {
    const orders = [makeOrder(), makeOrder({ status: 'pending', paid_at: null })];
    const result = computeSummary(orders, now);
    expect(result.sales.total).toBe(1);
    expect(result.revenue.total).toBe(97);
  });

  it('counts refunds in d30', () => {
    const orders = [makeOrder({ status: 'refunded', paid_at: null })];
    const result = computeSummary(orders, now);
    expect(result.refunds.d30).toBe(1);
  });

  it('computes avgTicket', () => {
    const orders = [makeOrder({ amount_total: 100 }), makeOrder({ amount_total: 200 })];
    const result = computeSummary(orders, now);
    expect(result.avgTicket.d30).toBe(150);
  });
});

describe('computeTimeseries', () => {
  it('returns correct number of days', () => {
    const result = computeTimeseries([], 7, now);
    expect(result).toHaveLength(7);
  });

  it('aggregates orders by date', () => {
    const orders = [
      { paid_at: '2026-03-07T10:00:00.000Z', amount_total: 97 },
      { paid_at: '2026-03-07T14:00:00.000Z', amount_total: 47 },
    ];
    const result = computeTimeseries(orders, 7, now);
    const today = result.find(r => r.date === '2026-03-07');
    expect(today?.paid_orders).toBe(2);
    expect(today?.revenue).toBe(144);
  });
});

describe('computeFunnel', () => {
  it('returns steps and rates', () => {
    const events = [
      { event_name: 'view_landing', session_id: 's1' },
      { event_name: 'view_landing', session_id: 's2' },
      { event_name: 'click_cta', session_id: 's1' },
      { event_name: 'view_checkout', session_id: 's1' },
      { event_name: 'start_payment', session_id: 's1' },
    ];
    const result = computeFunnel(events, 1);
    expect(result.steps).toHaveLength(5);
    expect(result.steps[0]).toEqual({ event_name: 'view_landing', count: 2 });
    expect(result.steps[4]).toEqual({ event_name: 'paid_orders', count: 1 });
  });

  it('rates use event_name (not event)', () => {
    const events = [
      { event_name: 'view_landing', session_id: 's1' },
      { event_name: 'click_cta', session_id: 's1' },
    ];
    const result = computeFunnel(events, 0);
    expect(result.rates[0].from).toBe('view_landing');
    expect(result.rates[0].to).toBe('click_cta');
  });

  it('deduplicates by session_id', () => {
    const events = [
      { event_name: 'view_landing', session_id: 's1' },
      { event_name: 'view_landing', session_id: 's1' },
      { event_name: 'view_landing', session_id: null },
    ];
    const result = computeFunnel(events, 0);
    // 1 unique session + 1 without session
    expect(result.steps[0].count).toBe(2);
  });
});
