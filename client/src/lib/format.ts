export function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return '¥0';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs >= 1e12) return `${sign}¥${(abs / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8) return `${sign}¥${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${sign}¥${(abs / 1e4).toFixed(1)}万`;
  return `${sign}¥${Math.round(abs).toLocaleString('zh-CN')}`;
}

export function formatShortTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  return `${Math.floor(hrs / 24)}天前`;
}

export const MOOD_LABELS: Record<string, { label: string; color: string }> = {
  calm: { label: '从容淡然', color: '#94A3B8' },
  happy: { label: '心情愉悦', color: '#34D399' },
  shy: { label: '微微脸红', color: '#F472B6' },
  tease: { label: '撩人打趣', color: '#E6C165' },
  jealous: { label: '暗暗吃醋', color: '#F43F5E' },
  touched: { label: '心弦触动', color: '#38BDF8' },
};
