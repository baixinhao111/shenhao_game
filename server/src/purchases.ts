import { getContent } from './contentLoader.js';
import { execute, queryOne } from './db.js';
import { spendCashOrThrow } from './economy.js';
import { computePortfolioAndTier, postMoment, rollCritCashback } from './gameEngine.js';

/** Shared purchase logic for direct buys and negotiated deals. */

export function getBusinessDef(businessId: string) {
  const biz = getContent().businesses.find((b: any) => b.id === businessId);
  if (!biz) throw new Error('产业不存在');
  return biz;
}

export function getPropertyDef(propertyId: string) {
  const prop = getContent().properties.find((p: any) => p.id === propertyId);
  if (!prop) throw new Error('房产不存在');
  return prop;
}

export function assertCanBuyBusiness(userId: number, businessId: string) {
  const biz = getBusinessDef(businessId);
  const owned = queryOne('SELECT business_id FROM player_businesses WHERE user_id = ? AND business_id = ?', [userId, businessId]);
  if (owned) throw new Error('已拥有该产业');
  const { tierInfo } = computePortfolioAndTier(userId);
  if (tierInfo.tier < biz.unlockTier) throw new Error(`需达到社会阶层 Lv.${biz.unlockTier} 才可收购该产业`);
  return biz;
}

export function assertCanBuyProperty(userId: number, propertyId: string) {
  const prop = getPropertyDef(propertyId);
  const owned = queryOne('SELECT property_id FROM player_properties WHERE user_id = ? AND property_id = ?', [userId, propertyId]);
  if (owned) throw new Error('你已拥有该房产');
  const { tierInfo } = computePortfolioAndTier(userId);
  if (tierInfo.tier < prop.unlockTier) throw new Error(`社会阶层达到 Lv.${prop.unlockTier} 才可购入该顶奢物业`);
  return prop;
}

export function purchaseBusiness(userId: number, businessId: string, price: number) {
  const biz = assertCanBuyBusiness(userId, businessId);
  spendCashOrThrow(userId, price);
  const critResult = rollCritCashback(userId, price);
  execute(
    'INSERT INTO player_businesses (user_id, business_id, level, assigned_heroine_id, last_collected_at) VALUES (?, ?, 1, ?, ?)',
    [userId, businessId, '', Date.now()],
  );
  return { critResult, name: biz.name };
}

export function purchaseProperty(userId: number, propertyId: string, price: number, momentText?: string) {
  const content = getContent();
  const prop = assertCanBuyProperty(userId, propertyId);
  spendCashOrThrow(userId, price);
  const critResult = rollCritCashback(userId, price);
  const now = Date.now();
  execute(
    `INSERT INTO player_properties (user_id, property_id, renovation_level, custom_name, residents_json, last_rent_at, purchased_at)
     VALUES (?, ?, 1, '', '[]', ?, ?)`,
    [userId, propertyId, now, now],
  );

  // Auto-upgrade main residence if higher energy bonus
  const state = queryOne<any>('SELECT main_property_id FROM player_state WHERE user_id = ?', [userId]);
  const currMain = content.properties.find((p: any) => p.id === state.main_property_id);
  if (prop.type === 'residence' && (prop.energyBonus || 0) > (currMain?.energyBonus || 0)) {
    execute('UPDATE player_state SET main_property_id = ? WHERE user_id = ?', [propertyId, userId]);
  }

  const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
  postMoment(
    userId,
    user.nickname,
    momentText || `刚刚全款签下【${prop.name}】，钥匙到手！海城的版图又多了一块属于我的坐标。`,
    `海城 · ${prop.name}`,
    [{ author: '陈默（私人管家）', text: '少爷大气！物业权证与全城收租系统已自动对接完毕。' }],
    ['陈默（私人管家）'],
  );
  return { critResult, name: prop.name };
}
