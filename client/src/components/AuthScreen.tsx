import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useGameStore } from '../store/useGameStore';
import { OrnateCorners } from './GameIcon';

export const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('陆沉');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const setAuth = useGameStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const body = mode === 'register' ? { username, password, nickname } : { username, password };
      const res = await apiRequest(endpoint, { body });
      setAuth(res.token, res.state);
    } catch (error: any) {
      setErr(error.message || '连接失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col justify-between bg-[#05070D]">
      <img
        src="/assets/bg/bg_bund_penthouse.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-52"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#05070D]/72 via-[#05070D]/20 to-[#05070D]" />

      {/* Title logo */}
      <div className="relative z-20 pt-8 px-4 flex flex-col items-center">
        <img
          src="/assets/ui/logo.webp"
          alt="天枢神豪"
          className="w-[88%] max-w-[360px] drop-shadow-[0_6px_18px_rgba(0,0,0,0.75)]"
        />
        <div className="mt-1 flex items-center gap-2 text-[11px] tracking-[0.5em] text-[#E2D3B0] font-editorial font-bold text-stroke-dark">
          <span className="w-6 h-px bg-gradient-to-r from-transparent to-[#D9C49A]" />
          海城夜雨 · 重新开始
          <span className="w-6 h-px bg-gradient-to-l from-transparent to-[#D9C49A]" />
        </div>
      </div>

      {/* Standing Protagonist & Su Qingwan */}
      <div className="relative flex-1 flex items-end justify-center pointer-events-none overflow-hidden px-2">
        <img
          src="/assets/characters/su_qingwan.png"
          alt=""
          className="h-[92%] w-auto object-contain object-bottom -mr-10 opacity-90 sprite-fade-bottom"
        />
        <img
          src="/assets/characters/protagonist.png"
          alt="陆沉"
          className="h-[96%] w-auto object-contain object-bottom -ml-10 z-10 sprite-fade-bottom"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#05070D] to-transparent z-20" />
      </div>

      {/* Architectural Login / Register Panel */}
      <div className="relative z-30 px-5 pb-7 space-y-3">
        <div className="relative panel-elevated rounded-[10px] p-4 pt-5 space-y-3.5">
          <OrnateCorners size={22} inset={-5} />
          <div className="flex items-center justify-center gap-8 border-b border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErr('');
              }}
              className={`pb-2 text-[13px] font-editorial font-bold tracking-[0.2em] border-b-2 transition ${
                mode === 'register'
                  ? 'text-[#E2D3B0] border-[#D9C49A] font-semibold'
                  : 'text-[#6D7183] border-transparent'
              }`}
            >
              新建存档
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErr('');
              }}
              className={`pb-2 text-[13px] font-editorial font-bold tracking-[0.2em] border-b-2 transition ${
                mode === 'login'
                  ? 'text-[#E2D3B0] border-[#D9C49A] font-semibold'
                  : 'text-[#6D7183] border-transparent'
              }`}
            >
              继续存档
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="账号"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-[6px] bg-[#06080E]/90 border border-[#D9C49A]/25 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)] focus:border-[#D9C49A]/60 px-3 py-2.5 text-xs text-white outline-none"
              />
              <input
                type="password"
                required
                placeholder="密码（4位以上）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[6px] bg-[#06080E]/90 border border-[#D9C49A]/25 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)] focus:border-[#D9C49A]/60 px-3 py-2.5 text-xs text-white outline-none"
              />
            </div>

            {mode === 'register' && (
              <input
                type="text"
                placeholder="你的名字（默认：陆沉）"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-[6px] bg-[#06080E]/90 border border-[#D9C49A]/25 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)] focus:border-[#D9C49A]/60 px-3 py-2.5 text-xs text-white outline-none"
              />
            )}

            {err && <div className="text-[11px] text-[#E6829A] px-0.5">{err}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full gold-btn-shimmer py-3 text-[14px] font-editorial flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? '正在进入…' : mode === 'register' ? '进入海城' : '继续'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
