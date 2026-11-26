import React from 'react';

export type AmbientMood = 'auto' | 'day' | 'evening' | 'night' | 'rain';

interface AmbientBackdropProps {
  src: string;
  alt?: string;
  timePeriod?: 'day' | 'evening' | 'night' | string;
  mood?: AmbientMood;
  kenBurns?: boolean;
  imageClassName?: string;
  className?: string;
}

const GOLDEN_MOTES = [
  { left: '12%', top: '72%', size: 3, delay: '0s', dur: '9.5s', dx: '12px', opacity: 0.55 },
  { left: '24%', top: '58%', size: 2.5, delay: '-2.2s', dur: '11s', dx: '-10px', opacity: 0.42 },
  { left: '38%', top: '80%', size: 3.5, delay: '-4.8s', dur: '12.5s', dx: '16px', opacity: 0.5 },
  { left: '54%', top: '65%', size: 2, delay: '-1.5s', dur: '8.8s', dx: '-12px', opacity: 0.4 },
  { left: '68%', top: '76%', size: 3, delay: '-6.1s', dur: '10.6s', dx: '14px', opacity: 0.55 },
  { left: '81%', top: '62%', size: 4, delay: '-3.4s', dur: '13s', dx: '-14px', opacity: 0.45 },
  { left: '88%', top: '44%', size: 2.5, delay: '-7.2s', dur: '9.8s', dx: '-8px', opacity: 0.48 },
  { left: '17%', top: '38%', size: 2.5, delay: '-5.0s', dur: '11.4s', dx: '10px', opacity: 0.36 },
  { left: '62%', top: '34%', size: 3, delay: '-8.4s', dur: '10.2s', dx: '9px', opacity: 0.44 },
];

const NIGHT_BOKEH = [
  { left: '14%', top: '28%', size: 10, delay: '-1s', dur: '14s', dx: '8px', opacity: 0.24, warm: true },
  { left: '78%', top: '22%', size: 14, delay: '-5s', dur: '16s', dx: '-10px', opacity: 0.2, warm: true },
  { left: '32%', top: '46%', size: 8, delay: '-3s', dur: '12s', dx: '12px', opacity: 0.22, warm: false },
  { left: '86%', top: '52%', size: 12, delay: '-7s', dur: '15s', dx: '-8px', opacity: 0.22, warm: true },
  { left: '22%', top: '68%', size: 9, delay: '-9s', dur: '13s', dx: '10px', opacity: 0.26, warm: true },
  { left: '64%', top: '38%', size: 7, delay: '-4s', dur: '11s', dx: '-6px', opacity: 0.25, warm: false },
  { left: '48%', top: '24%', size: 6, delay: '-6s', dur: '10.5s', dx: '7px', opacity: 0.28, warm: true },
];

const RAIN_STREAKS = [
  { left: '8%', delay: '-0.2s', dur: '1.65s', h: 52 },
  { left: '18%', delay: '-1.1s', dur: '1.9s', h: 68 },
  { left: '29%', delay: '-0.6s', dur: '1.55s', h: 46 },
  { left: '41%', delay: '-1.4s', dur: '2.05s', h: 72 },
  { left: '53%', delay: '-0.85s', dur: '1.75s', h: 58 },
  { left: '65%', delay: '-0.3s', dur: '1.6s', h: 50 },
  { left: '77%', delay: '-1.25s', dur: '1.95s', h: 64 },
  { left: '88%', delay: '-0.5s', dur: '1.7s', h: 56 },
  { left: '95%', delay: '-1.55s', dur: '1.85s', h: 62 },
];

/**
 * Living atmospheric backdrop for the AAA Lobby & Heroine Stage.
 * Renders subtle Ken-Burns camera drift, time-of-day cinematic light grading,
 * drifting golden dust motes / night skylight bokeh / fine rain streaks, and editorial vignette.
 */
export const AmbientBackdrop: React.FC<AmbientBackdropProps> = ({
  src,
  alt = '',
  timePeriod = 'evening',
  mood = 'auto',
  kenBurns = true,
  imageClassName = '',
  className = '',
}) => {
  const resolvedMood: Exclude<AmbientMood, 'auto'> =
    mood !== 'auto'
      ? mood
      : src.includes('rain')
        ? 'rain'
        : timePeriod === 'day'
          ? 'day'
          : timePeriod === 'night'
            ? 'night'
            : 'evening';

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none select-none ${className}`}>
      {/* Base Scene Image with ultra-slow living Ken-Burns motion */}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-700 ${
          kenBurns ? 'animate-ken-burns' : ''
        } ${imageClassName}`}
      />

      {/* Time-of-Day Cinematic Lighting Wash */}
      {resolvedMood === 'day' && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 82% 14%, rgba(255, 241, 210, 0.2) 0%, rgba(216, 185, 121, 0.06) 36%, transparent 66%)',
          }}
        />
      )}

      {resolvedMood === 'evening' && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 76% 18%, rgba(242, 188, 112, 0.22) 0%, rgba(196, 128, 66, 0.08) 42%, rgba(9, 10, 15, 0.22) 100%)',
          }}
        />
      )}

      {resolvedMood === 'night' && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10, 13, 24, 0.42) 0%, rgba(16, 15, 22, 0.16) 45%, rgba(8, 8, 12, 0.45) 100%), radial-gradient(circle at 24% 20%, rgba(228, 198, 134, 0.14) 0%, transparent 50%)',
          }}
        />
      )}

      {resolvedMood === 'rain' && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(12, 18, 28, 0.45) 0%, rgba(12, 16, 24, 0.18) 52%, rgba(8, 9, 14, 0.56) 100%)',
          }}
        />
      )}

      {/* Atmospheric Particle Layer */}
      {(resolvedMood === 'day' || resolvedMood === 'evening') && (
        <div className="absolute inset-0 overflow-hidden">
          {GOLDEN_MOTES.map((m, i) => (
            <span
              key={i}
              className="absolute rounded-full animate-mote"
              style={
                {
                  left: m.left,
                  top: m.top,
                  width: `${m.size}px`,
                  height: `${m.size}px`,
                  background:
                    resolvedMood === 'evening'
                      ? 'radial-gradient(circle, rgba(255,235,184,0.95) 0%, rgba(216,185,121,0) 75%)'
                      : 'radial-gradient(circle, rgba(255,248,228,0.9) 0%, rgba(255,240,200,0) 75%)',
                  boxShadow: '0 0 8px rgba(244, 223, 168, 0.45)',
                  animationDelay: m.delay,
                  '--mote-dur': m.dur,
                  '--mote-dx': m.dx,
                  '--mote-opacity': m.opacity,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {resolvedMood === 'night' && (
        <div className="absolute inset-0 overflow-hidden">
          {NIGHT_BOKEH.map((b, i) => (
            <span
              key={i}
              className="absolute rounded-full animate-mote blur-[2px]"
              style={
                {
                  left: b.left,
                  top: b.top,
                  width: `${b.size}px`,
                  height: `${b.size}px`,
                  background: b.warm
                    ? 'radial-gradient(circle, rgba(245,214,148,0.75) 0%, rgba(216,185,121,0) 72%)'
                    : 'radial-gradient(circle, rgba(226,232,248,0.6) 0%, rgba(180,196,230,0) 72%)',
                  animationDelay: b.delay,
                  '--mote-dur': b.dur,
                  '--mote-dx': b.dx,
                  '--mote-opacity': b.opacity,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {resolvedMood === 'rain' && (
        <div className="absolute inset-0 overflow-hidden">
          {RAIN_STREAKS.map((r, i) => (
            <span
              key={i}
              className="absolute top-0 w-[1px] animate-rain"
              style={
                {
                  left: r.left,
                  height: `${r.h}px`,
                  background: 'linear-gradient(180deg, transparent 0%, rgba(218, 232, 250, 0.55) 65%, transparent 100%)',
                  animationDelay: r.delay,
                  '--rain-dur': r.dur,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {/* Subtle Editorial Vignette + Film Grain */}
      <div className="absolute inset-0 vignette-stage" />
      <div className="absolute inset-0 film-grain" />
    </div>
  );
};
