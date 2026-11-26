import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useGameStore } from '../store/useGameStore';

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
    <div className="relative h-full w-full overflow-hidden flex flex-col justify-between bg-[#090A0D]">
      <img
        src="/assets/bg/bg_bund_penthouse.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-52"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#090A0D]/72 via-[#090A0D]/20 to-[#090A0D]" />

      {/* Clean Editorial Title */}
      <div className="relative z-20 pt-10 px-6">
        <div className="w-8 h-[2px] bg-[#CFB073] mb-3" />
        <h1 className="font-editorial text-[34px] font-bold tracking-[0.16em] text-[#F5F2EA]">天枢神豪</h1>
        <p className="text-xs text-[#B5B8C2] mt-1.5 tracking-[0.14em]">海城夜雨，重新开始</p>
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
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#090A0D] to-transparent z-20" />
      </div>

      {/* Architectural Login / Register Panel */}
      <div className="relative z-30 px-5 pb-7 space-y-3">
        <div className="panel-elevated rounded-[6px] p-4 space-y-3.5">
          <div className="flex items-center gap-6 border-b border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErr('');
              }}
              className={`pb-2 text-xs tracking-wider border-b-2 transition ${
                mode === 'register'
                  ? 'text-[#EBD4A2] border-[#CFB073] font-semibold'
                  : 'text-[#7D818E] border-transparent'
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
              className={`pb-2 text-xs tracking-wider border-b-2 transition ${
                mode === 'login'
                  ? 'text-[#EBD4A2] border-[#CFB073] font-semibold'
                  : 'text-[#7D818E] border-transparent'
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
                className="w-full rounded-[4px] bg-[#0B0C10] border border-white/12 focus:border-[#CFB073]/60 px-3 py-2.5 text-xs text-white outline-none"
              />
              <input
                type="password"
                required
                placeholder="密码（4位以上）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[4px] bg-[#0B0C10] border border-white/12 focus:border-[#CFB073]/60 px-3 py-2.5 text-xs text-white outline-none"
              />
            </div>

            {mode === 'register' && (
              <input
                type="text"
                placeholder="你的名字（默认：陆沉）"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-[4px] bg-[#0B0C10] border border-white/12 focus:border-[#CFB073]/60 px-3 py-2.5 text-xs text-white outline-none"
              />
            )}

            {err && <div className="text-[11px] text-[#E6829A] px-0.5">{err}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-brass clip-chamfer-sm py-2.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
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
