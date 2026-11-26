import { create } from 'zustand';
import { apiRequest, getStoredToken, setStoredToken } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playCoinBurst, playCritExplosion, playSystemPing, playWeChatChime } from '../lib/sound';

export type MainTab = 'home' | 'map' | 'story' | 'assets' | 'heroines' | 'system';
export type ProfileSubTab = 'tasks' | 'skills' | 'mall';

export interface TopNotification {
  id: number;
  kind: 'bank' | 'wechat' | 'system';
  title: string;
  body: string;
  avatar?: string;
}

export interface CritBanner {
  id: number;
  multiplier: number;
  amount: number;
  subtitle?: string;
}

export interface BarragePayload {
  id: number;
  style: 'mock' | 'gold';
  lines: string[];
}

export interface VNChoiceOption {
  id: string;
  label: string;
  tag?: string;
  cost?: { cash?: number };
  cashCost?: number;
  reward?: {
    cash?: number;
    sysPoints?: number;
    critCharge?: number;
    critMultiplier?: number;
    unlockAsset?: string;
    equipCar?: string;
    unlockHeroine?: string;
    affectionHeroine?: string;
    affectionGain?: number;
  };
  affectionBonus?: number;
  affectionGain?: number;
  cashGain?: number;
  sysPoints?: number;
  unlockHeroine?: string;
  resultText?: string;
  branchNodes?: VNNode[];
  choiceIndex?: number;
}

export interface VNNode {
  type: 'narration' | 'thought' | 'dialogue' | 'system_alert' | 'barrage' | 'system_choice';
  id?: string;
  speaker?: string;
  name?: string;
  role?: string;
  title?: string;
  text?: string;
  innerThought?: string;
  bg?: string;
  sprite?: string;
  portrait?: string;
  leftSprite?: string;
  rightSprite?: string;
  activeSide?: 'left' | 'right' | 'both' | 'none';
  effect?: 'shake' | 'flash' | 'impact' | 'heartbeat';
  sceneBanner?: string;
  style?: 'mock' | 'gold';
  lines?: string[];
  options?: VNChoiceOption[];
}

export interface MiniStoryPayload {
  mode: 'date' | 'home' | 'stroll';
  title: string;
  subtitle?: string;
  sceneLabel?: string;
  bg: string;
  nodes: VNNode[];
  districtId?: string;
  propertyId?: string;
  interactionId?: string;
  heroineId?: string;
  heroineName?: string;
  heroineAvatar?: string;
  heroinePortrait?: string;
  locationLabel?: string;
  costEnergy?: number;
  costCash?: number;
  eventId?: string;
  strollChoices?: any[];
}

const PINNED_COMPANION_KEY = 'tianshu_pinned_companion';

function loadPinnedCompanion(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(PINNED_COMPANION_KEY) || null;
  } catch {
    return null;
  }
}

interface GameStore {
  token: string;
  state: any | null;
  loading: boolean;
  activeTab: MainTab;
  showProfile: boolean;
  profileTab: ProfileSubTab;
  selectedDistrictId: string | null;
  activePropertyId: string | null;
  activeChatHeroineId: string | null;
  chatLocationOverride: string | null;
  activeStoryEpisodeId: string | null;
  activeMiniStory: MiniStoryPayload | null;
  pinnedCompanionId: string | null;
  showLeaderboard: boolean;
  showMail: boolean;
  showAdmin: boolean;
  topToast: TopNotification | null;
  critBanner: CritBanner | null;
  barrage: BarragePayload | null;
  errorToast: string | null;

  initSession: () => Promise<void>;
  setAuth: (token: string, state: any) => void;
  logout: () => void;
  refreshState: () => Promise<void>;
  applyServerState: (newState: any, critResult?: any, options?: { silentToast?: boolean }) => void;

  setActiveTab: (tab: MainTab) => void;
  openProfile: (tab?: ProfileSubTab) => void;
  closeProfile: () => void;
  setSelectedDistrictId: (id: string | null) => void;
  setActivePropertyId: (id: string | null) => void;
  openHeroineChat: (heroineId: string, locationOverride?: string | null) => void;
  closeHeroineChat: () => void;
  setActiveStoryEpisodeId: (id: string | null) => void;
  openMiniStory: (payload: MiniStoryPayload) => void;
  closeMiniStory: () => void;
  setPinnedCompanionId: (id: string | null) => void;
  setShowLeaderboard: (v: boolean) => void;
  setShowMail: (v: boolean) => void;
  setShowAdmin: (v: boolean) => void;

  notifyTop: (kind: TopNotification['kind'], title: string, body: string, avatar?: string) => void;
  dismissToast: () => void;
  triggerCrit: (multiplier: number, amount: number, subtitle?: string, silentToast?: boolean) => void;
  triggerBarrage: (style: 'mock' | 'gold', lines: string[]) => void;
  showError: (msg: string) => void;
}

let toastTimer: any = null;
let critTimer: any = null;
let errTimer: any = null;
let barrageTimer: any = null;

export const useGameStore = create<GameStore>((set, get) => ({
  token: getStoredToken(),
  state: null,
  loading: Boolean(getStoredToken()),
  activeTab: 'home',
  showProfile: false,
  profileTab: 'tasks',
  selectedDistrictId: null,
  activePropertyId: null,
  activeChatHeroineId: null,
  chatLocationOverride: null,
  activeStoryEpisodeId: null,
  activeMiniStory: null,
  pinnedCompanionId: loadPinnedCompanion(),
  showLeaderboard: false,
  showMail: false,
  showAdmin: false,
  topToast: null,
  critBanner: null,
  barrage: null,
  errorToast: null,

  initSession: async () => {
    const token = getStoredToken();
    if (!token) {
      set({ loading: false, token: '', state: null });
      return;
    }
    set({ loading: true });
    try {
      const res = await apiRequest('/state');
      const isBrandNew = res.state?.stories?.completedEpisodes?.length === 0;
      set({
        state: res.state,
        token,
        loading: false,
        activeTab: isBrandNew ? 'story' : 'home',
        activeStoryEpisodeId: isBrandNew ? 'ep_001' : null,
      });
    } catch {
      setStoredToken('');
      set({ token: '', state: null, loading: false });
    }
  },

  setAuth: (token, state) => {
    setStoredToken(token);
    playSystemPing();
    const isBrandNew = state?.stories?.completedEpisodes?.length === 0;
    set({
      token,
      state,
      loading: false,
      showProfile: false,
      activeTab: isBrandNew ? 'story' : 'home',
      activeStoryEpisodeId: isBrandNew ? 'ep_001' : null,
      activeMiniStory: null,
    });
  },

  logout: () => {
    setStoredToken('');
    set({
      token: '',
      state: null,
      activeTab: 'home',
      showProfile: false,
      selectedDistrictId: null,
      activePropertyId: null,
      activeChatHeroineId: null,
      chatLocationOverride: null,
      activeStoryEpisodeId: null,
      activeMiniStory: null,
      showAdmin: false,
    });
  },

  refreshState: async () => {
    try {
      const res = await apiRequest('/state');
      set({ state: res.state });
    } catch {}
  },

  applyServerState: (newState, critResult, options) => {
    if (newState) set({ state: newState });
    if (critResult?.triggered && critResult?.cashback > 0) {
      get().triggerCrit(
        critResult.multiplier,
        critResult.cashback,
        critResult.leveledUp ? `天枢晋升至 Lv.${critResult.newLevel}` : '招商私行已入账',
        options?.silentToast,
      );
    }
  },

  setActiveTab: (tab) => {
    if (tab === 'system') {
      set({ showProfile: true });
      return;
    }
    set({ activeTab: tab, showProfile: false, activePropertyId: null });
  },

  openProfile: (tab = 'tasks') => set({ showProfile: true, profileTab: tab }),
  closeProfile: () => set({ showProfile: false }),

  setSelectedDistrictId: (id) => set({ selectedDistrictId: id, activePropertyId: null }),
  setActivePropertyId: (id) => set({ activePropertyId: id }),

  openHeroineChat: (heroineId, locationOverride = null) => {
    playWeChatChime();
    set({
      activeTab: 'heroines',
      showProfile: false,
      activeChatHeroineId: heroineId,
      chatLocationOverride: locationOverride,
      activePropertyId: null,
      activeMiniStory: null,
      activeStoryEpisodeId: null,
    });
  },

  closeHeroineChat: () => set({ activeChatHeroineId: null, chatLocationOverride: null }),
  setActiveStoryEpisodeId: (id) => set({ activeStoryEpisodeId: id, showProfile: false }),
  openMiniStory: (payload) => set({ activeMiniStory: payload, showProfile: false }),
  closeMiniStory: () => set({ activeMiniStory: null }),

  setPinnedCompanionId: (id) => {
    try {
      if (typeof window !== 'undefined') {
        if (id) localStorage.setItem(PINNED_COMPANION_KEY, id);
        else localStorage.removeItem(PINNED_COMPANION_KEY);
      }
    } catch {}
    set({ pinnedCompanionId: id });
  },

  setShowLeaderboard: (v) => set({ showLeaderboard: v }),
  setShowMail: (v) => set({ showMail: v }),
  setShowAdmin: (v) => set({ showAdmin: v }),

  notifyTop: (kind, title, body, avatar) => {
    if (kind === 'bank') playCoinBurst();
    else if (kind === 'wechat') playWeChatChime();
    else playSystemPing();
    clearTimeout(toastTimer);
    const id = Date.now();
    set({ topToast: { id, kind, title, body, avatar } });
    toastTimer = setTimeout(() => {
      if (get().topToast?.id === id) set({ topToast: null });
    }, 3600);
  },

  dismissToast: () => {
    clearTimeout(toastTimer);
    set({ topToast: null });
  },

  triggerCrit: (multiplier, amount, subtitle, silentToast = false) => {
    playCritExplosion();
    clearTimeout(critTimer);
    const id = Date.now();
    set({ critBanner: { id, multiplier, amount, subtitle } });
    if (!silentToast) {
      get().notifyTop('bank', '招商私人银行', `触发 ${multiplier} 倍返现，入账 ${formatMoney(amount)}`);
    }
    critTimer = setTimeout(() => {
      if (get().critBanner?.id === id) set({ critBanner: null });
    }, 3200);
  },

  triggerBarrage: (style, lines) => {
    clearTimeout(barrageTimer);
    const id = Date.now();
    set({ barrage: { id, style, lines } });
    barrageTimer = setTimeout(() => {
      if (get().barrage?.id === id) set({ barrage: null });
    }, 6800);
  },

  showError: (msg) => {
    clearTimeout(errTimer);
    set({ errorToast: msg });
    errTimer = setTimeout(() => set({ errorToast: null }), 3200);
  },
}));
