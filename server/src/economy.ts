import { execute, queryOne } from './db.js';
import { ensureDailyResetAndEnergy, formatMoney } from './gameEngine.js';

/** Shared spend/earn helpers used by routes, minigames and negotiations. */

export function assertEnergySufficient(userId: number, cost: number): void {
  if (cost <= 0) return;
  const st = ensureDailyResetAndEnergy(userId);
  if (st.energy < cost) {
    throw new Error(`精力不足（需要 ⚡${cost}，当前 ⚡${st.energy}），可在【系统商城】喝精力特饮或等待恢复`);
  }
}

export function assertCashSufficient(userId: number, cost: number): void {
  if (cost <= 0) return;
  const st = queryOne<any>('SELECT cash FROM player_state WHERE user_id = ?', [userId]);
  if (!st || st.cash < cost) {
    throw new Error(`现金不足（需要 ${formatMoney(cost)}，当前 ${formatMoney(st?.cash || 0)}）`);
  }
}

export function assertSysPointsSufficient(userId: number, cost: number): void {
  if (cost <= 0) return;
  const st = queryOne<any>('SELECT sys_points FROM player_state WHERE user_id = ?', [userId]);
  if (!st || st.sys_points < cost) {
    throw new Error(`天枢积分不足（需要 ${cost}，当前 ${st?.sys_points || 0}）`);
  }
}

export function spendEnergyOrThrow(userId: number, cost: number): void {
  if (cost <= 0) return;
  assertEnergySufficient(userId, cost);
  execute('UPDATE player_state SET energy = energy - ? WHERE user_id = ?', [cost, userId]);
}

export function spendCashOrThrow(userId: number, cost: number): void {
  if (cost <= 0) return;
  assertCashSufficient(userId, cost);
  execute('UPDATE player_state SET cash = cash - ? WHERE user_id = ?', [cost, userId]);
}

export function spendSysPointsOrThrow(userId: number, cost: number): void {
  if (cost <= 0) return;
  assertSysPointsSufficient(userId, cost);
  execute('UPDATE player_state SET sys_points = sys_points - ? WHERE user_id = ?', [cost, userId]);
}

/** Pay out cash and/or system points (non-negative amounts only). */
export function grant(userId: number, cash: number, sysPoints = 0): void {
  const c = Math.max(0, Math.round(cash));
  const p = Math.max(0, Math.round(sysPoints));
  if (c === 0 && p === 0) return;
  execute('UPDATE player_state SET cash = cash + ?, sys_points = sys_points + ? WHERE user_id = ?', [c, p, userId]);
}
