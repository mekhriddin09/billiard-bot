import type { ClubSettings, ClubTable, GameSession, OrderItem } from "./types";

/** Sessiya davomiyligi daqiqalarda (korreksiyalar bilan) */
export function sessionMinutes(
  s: Pick<GameSession, "startedAt" | "endedAt" | "adjustMinutes">,
  now: number
): number {
  const end = s.endedAt ?? now;
  const raw = Math.floor((end - s.startedAt) / 60000);
  return Math.max(0, raw + s.adjustMinutes);
}

/** Stol narxi — daqiqa bo'yicha proporsional, 1000 so'mgacha pastga yaxlitlanadi.
 *  84 daqiqa × 40 000/soat = 56 000 */
export function tableCost(minutes: number, pricePerHour: number): number {
  return Math.floor((minutes * pricePerHour) / 60 / 1000) * 1000;
}

export function ordersTotal(orders: OrderItem[]): number {
  return orders.reduce((sum, o) => sum + o.price * o.qty, 0);
}

export interface Bill {
  minutes: number;
  billableMinutes: number;
  rewardMinutesUsed: number;
  tableCost: number;
  ordersTotal: number;
  depositCredit: number;
  total: number;
  pointsToEarn: number;
}

/** To'liq hisob: stol + zakazlar + loyalty mukofoti + depozit */
export function computeBill(
  s: Pick<GameSession, "startedAt" | "endedAt" | "adjustMinutes" | "orders" | "customerId">,
  table: Pick<ClubTable, "pricePerHour">,
  settings: Pick<ClubSettings, "loyalty">,
  now: number,
  opts: { useReward?: boolean; customerPoints?: number; depositCredit?: number } = {}
): Bill {
  const minutes = sessionMinutes(s, now);
  const L = settings.loyalty;

  let rewardMinutesUsed = 0;
  if (
    opts.useReward &&
    L.enabled &&
    (opts.customerPoints ?? 0) >= L.pointsForReward &&
    minutes >= L.minSessionMinutesForReward
  ) {
    rewardMinutesUsed = Math.min(L.rewardMinutes, minutes);
  }

  const billableMinutes = Math.max(0, minutes - rewardMinutesUsed);
  const tc = tableCost(billableMinutes, table.pricePerHour);
  const ot = ordersTotal(s.orders);
  const deposit = Math.min(opts.depositCredit ?? 0, tc + ot);
  const total = Math.max(0, tc + ot - deposit);

  // ball faqat telefon biriktirilgan bo'lsa, avtomatik
  const pointsToEarn =
    L.enabled && s.customerId ? Math.floor(minutes / L.minutesPerPoint) : 0;

  return {
    minutes,
    billableMinutes,
    rewardMinutesUsed,
    tableCost: tc,
    ordersTotal: ot,
    depositCredit: deposit,
    total,
    pointsToEarn,
  };
}
