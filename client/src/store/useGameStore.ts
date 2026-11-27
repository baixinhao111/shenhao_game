import { create } from 'zustand';
import { apiRequest, getStoredToken, setStoredToken } from '../lib/api';
import { playCoinBurst, playCritExplosion, playSystemPing, playWeChatChime } from '../lib/sound';

export type MainTab = 'home' | 'map' | 'story' | 'assets' | 'heroines' | 'system';
export type ProfileSubTab = 'tasks' | 'achievements' | 'skills' | 'mall';
export type AssetsSubTab = 'garage' | 'biz' | 'props';
export type MinigameKind = 'jade' | 'stock' | 'race' | 'live' | 'angel' | 'cruise';
export interface DealTarget {
  kind: 'business' | 'property';
  id: string;
}
export interface RewardFx {
  id: number;
  amount: number;
  kind: 'cash' | 'points';
  x: number;
  y: number;
}

/** 阶层晋升演出 */
export interface TierUpFx {
  id: number;
  fromName: string;
  toTier: number;
  toName: string;
  netWorth: number;
  nextName?: string;
  nextAt?: number;
  unlocks: string[];
}

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
  mode: 'date' | 'home' | 'stroll' | 'bond' | 'shura';
  title: string;
  subtitle?: string;
  sceneLabel?: string;
  bg: string;
  nodes: VNNode[];
  districtId?: string;
  propertyId?: string;
  interactionId?: string;
  bondId?: string;
  unlockOutfit?: string | null;
  alreadyCompleted?: boolean;
  heroineId?: string;
  heroineIds?: string[];
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
  assetsSubTab: AssetsSubTab;
  showProfile: boolean;
  profileTab: ProfileSubTab;
  selectedDistrictId: string | null;
  /** open this spot's sheet once its district map mounts (jump from 产业 → 车行 etc.) */
  focusSpotId: string | null;
  /** preselect this business on the 产业 skyline */
  focusBizId: string | null;
  openSpot: (districtId: string, spotId: string) => void;
  focusBusiness: (bizId: string | null) => void;
  clearFocusSpot: () => void;
  /** tab we jumped to the map from (e.g. 产业 → 车行); the map's back button returns there */
  returnTo: MainTab | null;
  /** open a property's private home from anywhere */
  openHome: (districtId: string, propertyId: string) => void;
  /** back out of a district / home: to the tab we came from, or one level up the map */
  mapBack: (level: 'district' | 'home') => void;
  activePropertyId: string | null;
  activeChatHeroineId: string | null;
  chatLocationOverride: string | null;
  chatReturnTab: MainTab | null;
  activeStoryEpisodeId: string | null;
  activeMiniStory: MiniStoryPayload | null;
  pinnedCompanionId: string | null;
  showLeaderboard: boolean;
  showMail: boolean;
  showAdmin: boolean;
  topToast: TopNotification | null;
  critBanner: CritBanner | null;
  dismissCrit: () => void;
  tierUp: TierUpFx | null;
  dismissTierUp: () => void;
  barrage: BarragePayload | null;
  errorToast: string | null;
  activeMinigame: MinigameKind | null;
  activeDeal: DealTarget | null;
  rewardFx: RewardFx[];

  initSession: () => Promise<void>;
  setAuth: (token: string, state: any) => void;
  logout: () => void;
  refreshState: () => Promise<void>;
  applyServerState: (newState: any, critResult?: any, options?: { silentToast?: boolean }) => void;

  setActiveTab: (tab: MainTab) => void;
  setAssetsSubTab: (sub: AssetsSubTab) => void;
  openAssetsTab: (sub: AssetsSubTab) => void;
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
  openMinigame: (kind: MinigameKind) => void;
  closeMinigame: () => void;
  openDeal: (target: DealTarget) => void;
  closeDeal: () => void;
  /** Coins fly from a screen point (client coords) into the cash/points capsule. */
  flyReward: (amount: number, from?: { x: number; y: number }, kind?: 'cash' | 'points') => void;
}

let toastTimer: any = null;
let lastPointer: { x: number; y: number; at: number } | null = null;
export function recordPointer(x: number, y: number) {
  lastPointer = { x, y, at: Date.now() };
}
let critTimer: any = null;
let errTimer: any = null;
let barrageTimer: any = null;

export const useGameStore = create<GameStore>((set, get) => ({
  token: getStoredToken(),
  state: null,
  loading: Boolean(getStoredToken()),
  activeTab: 'home',
  assetsSubTab: 'biz',
  showProfile: false,
  profileTab: 'tasks',
  selectedDistrictId: null,
  focusSpotId: null,
  focusBizId: null,
  returnTo: null,
  activePropertyId: null,
  activeChatHeroineId: null,
  chatLocationOverride: null,
  chatReturnTab: null,
  activeStoryEpisodeId: null,
  activeMiniStory: null,
  pinnedCompanionId: loadPinnedCompanion(),
  showLeaderboard: false,
  showMail: false,
  showAdmin: false,
  topToast: null,
  critBanner: null,
  dismissCrit: () => {
    clearTimeout(critTimer);
    set({ critBanner: null });
  },
  tierUp: null,
  dismissTierUp: () => set({ tierUp: null }),
  barrage: null,
  errorToast: null,
  activeMinigame: null,
  activeDeal: null,
  rewardFx: [],

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
    clearTimeout(toastTimer);
    clearTimeout(critTimer);
    clearTimeout(errTimer);
    clearTimeout(barrageTimer);
    setStoredToken(token);
    playSystemPing();
    const isBrandNew = state?.stories?.completedEpisodes?.length === 0;
    set({
      token,
      state,
      loading: false,
      showProfile: false,
      activeTab: isBrandNew ? 'story' : 'home',
      assetsSubTab: 'biz',
      selectedDistrictId: null,
      activePropertyId: null,
      activeChatHeroineId: null,
      chatLocationOverride: null,
      chatReturnTab: null,
      activeStoryEpisodeId: isBrandNew ? 'ep_001' : null,
      activeMiniStory: null,
      showLeaderboard: false,
      showMail: false,
      showAdmin: false,
      topToast: null,
      critBanner: null,
      tierUp: null,
      barrage: null,
      errorToast: null,
      activeMinigame: null,
      activeDeal: null,
      rewardFx: [],
    });
  },

  logout: () => {
    clearTimeout(toastTimer);
    clearTimeout(critTimer);
    clearTimeout(errTimer);
    clearTimeout(barrageTimer);
    setStoredToken('');
    try {
      if (typeof window !== 'undefined') localStorage.removeItem(PINNED_COMPANION_KEY);
    } catch {}
    set({
      token: '',
      state: null,
      activeTab: 'home',
      assetsSubTab: 'biz',
      showProfile: false,
      selectedDistrictId: null,
      activePropertyId: null,
      activeChatHeroineId: null,
      chatLocationOverride: null,
      chatReturnTab: null,
      activeStoryEpisodeId: null,
      activeMiniStory: null,
      pinnedCompanionId: null,
      showLeaderboard: false,
      showMail: false,
      showAdmin: false,
      topToast: null,
      critBanner: null,
      tierUp: null,
      barrage: null,
      errorToast: null,
      activeMinigame: null,
      activeDeal: null,
      rewardFx: [],
    });
  },

  refreshState: async () => {
    try {
      const res = await apiRequest('/state');
      // through applyServerState so a tier crossed by idle income still gets its ceremony
      if (get().state) get().applyServerState(res.state);
      else set({ state: res.state });
    } catch {}
  },

  applyServerState: (newState, critResult, options) => {
    const prevTier = get().state?.player?.tier?.tier;
    const prevTierName: string = get().state?.player?.tier?.name || '';
    // write responses leave out the static story script (~0.5MB); keep the copy we already have,
    // and refetch the full state if the server's content was hot-reloaded since we got it
    const prevStories = get().state?.stories;
    if (newState?.stories && !newState.stories.volumes) {
      if (prevStories?.volumes && prevStories.contentVersion === newState.stories.contentVersion) {
        newState.stories.volumes = prevStories.volumes;
      } else {
        newState.stories.volumes = prevStories?.volumes || [];
        setTimeout(() => void get().refreshState(), 0);
      }
    }
    if (newState) set({ state: newState });
    const nextTier = newState?.player?.tier;
    if (prevTier && nextTier && nextTier.tier > prevTier) {
      // 身价突破阶层：全屏晋升演出，并列出这一阶层新开放的内容
      const t = nextTier.tier;
      const unlocks = [
        ...(newState.map?.districts || []).filter((d: any) => d.unlockTier === t).map((d: any) => `新区域 · ${d.name}`),
        ...(newState.businesses || []).filter((b: any) => b.unlockTier === t).map((b: any) => `可收购 · ${b.name}`),
      ];
      set({
        tierUp: {
          id: Date.now(),
          fromName: prevTierName,
          toTier: t,
          toName: nextTier.name,
          netWorth: newState.player.netWorth,
          nextName: newState.player.nextTier?.name,
          nextAt: newState.player.nextTier?.minNetWorth,
          unlocks: unlocks.slice(0, 4),
        },
      });
    }
    if (critResult?.triggered && critResult?.cashback > 0) {
      // Small cashbacks just fly into the wallet; only big multipliers earn the full-screen moment.
      if (critResult.multiplier >= 5 || critResult.leveledUp) {
        get().triggerCrit(
          critResult.multiplier,
          critResult.cashback,
          critResult.leveledUp ? `天枢晋升至 Lv.${critResult.newLevel}` : '招商私行已入账',
          options?.silentToast,
        );
      } else {
        get().flyReward(critResult.cashback);
      }
    }
  },

  setActiveTab: (tab) => {
    if (tab === 'system') {
      set({ showProfile: true });
      return;
    }
    // switching tabs by hand ends any 「jumped here from another tab」 trip
    set({ activeTab: tab, showProfile: false, activePropertyId: null, returnTo: null });
  },

  setAssetsSubTab: (sub) => set({ assetsSubTab: sub }),
  openAssetsTab: (sub) => set({ activeTab: 'assets', assetsSubTab: sub, showProfile: false, activePropertyId: null }),

  openProfile: (tab = 'tasks') => set({ showProfile: true, profileTab: tab }),
  closeProfile: () => set({ showProfile: false }),

  setSelectedDistrictId: (id) => set({ selectedDistrictId: id, activePropertyId: null }),
  openSpot: (districtId, spotId) =>
    set((st) => ({
      returnTo: st.activeTab !== 'map' ? st.activeTab : st.returnTo,
      activeTab: 'map',
      selectedDistrictId: districtId,
      focusSpotId: spotId,
      activePropertyId: null,
      showProfile: false,
    })),
  openHome: (districtId, propertyId) =>
    set((st) => ({
      returnTo: st.activeTab !== 'map' ? st.activeTab : st.returnTo,
      activeTab: 'map',
      selectedDistrictId: districtId,
      activePropertyId: propertyId,
      showProfile: false,
    })),
  mapBack: (level) => {
    const back = get().returnTo;
    if (back) {
      set({ activeTab: back, returnTo: null, selectedDistrictId: null, activePropertyId: null });
      return;
    }
    if (level === 'home') set({ activePropertyId: null });
    else set({ selectedDistrictId: null, activePropertyId: null });
  },
  focusBusiness: (bizId) =>
    set({ focusBizId: bizId, ...(bizId ? { activeTab: 'assets' as const, assetsSubTab: 'biz' as const, showProfile: false, returnTo: null, selectedDistrictId: null } : {}) }),
  clearFocusSpot: () => set({ focusSpotId: null }),
  setActivePropertyId: (id) => set({ activePropertyId: id }),

  openHeroineChat: (heroineId, locationOverride = null) => {
    playWeChatChime();
    const currentTab = get().activeTab;
    const prevReturn = get().chatReturnTab;
    set({
      activeTab: 'heroines',
      showProfile: false,
      activeChatHeroineId: heroineId,
      chatLocationOverride: locationOverride,
      chatReturnTab: currentTab !== 'heroines' ? currentTab : prevReturn,
      activePropertyId: null,
      activeMiniStory: null,
      activeStoryEpisodeId: null,
    });
  },

  closeHeroineChat: () => {
    const returnTab = get().chatReturnTab;
    set({
      activeChatHeroineId: null,
      chatLocationOverride: null,
      chatReturnTab: null,
      ...(returnTab ? { activeTab: returnTab } : {}),
    });
  },
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  triggerCrit: (multiplier, amount, subtitle, _silentToast = false) => {
    playSystemPing(); // the staged CritShow plays the roll / stamp / fanfare itself
    clearTimeout(critTimer);
    const id = Date.now();
    set({ critBanner: { id, multiplier, amount, subtitle } });
    critTimer = setTimeout(() => {
      if (get().critBanner?.id === id) set({ critBanner: null });
    }, 10500);
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

  openMinigame: (kind) => set({ activeMinigame: kind, showProfile: false }),
  closeMinigame: () => set({ activeMinigame: null }),
  openDeal: (target) => set({ activeDeal: target, showProfile: false }),
  closeDeal: () => set({ activeDeal: null }),

  flyReward: (amount, from, kind = 'cash') => {
    if (!amount || amount <= 0) return;
    playCoinBurst();
    const id = Date.now() + Math.random();
    // default origin: where the player last tapped (recorded by RewardFlyLayer), else screen centre
    const last = lastPointer && Date.now() - lastPointer.at < 4000 ? lastPointer : null;
    const x = from?.x ?? last?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 200);
    const y = from?.y ?? last?.y ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 400);
    set({ rewardFx: [...get().rewardFx.slice(-3), { id, amount, kind, x, y }] });
    setTimeout(() => set({ rewardFx: get().rewardFx.filter((f) => f.id !== id) }), 1400);
  },
}));
