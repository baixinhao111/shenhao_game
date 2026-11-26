import React from 'react';

interface PortraitAvatarProps {
  src: string;
  alt?: string;
  className?: string;
  rounded?: 'full' | 'lg' | 'xl' | 'sm' | 'none';
}

/**
 * Tight head-and-shoulders close-up crop for tall transparent 2D sprites.
 * Keeps face large, centered, and clear across map pins, chats, and framed player emblems.
 */
export const PortraitAvatar: React.FC<PortraitAvatarProps> = ({
  src,
  alt = '',
  className = 'w-10 h-10',
  rounded = 'full',
}) => {
  const radius =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'lg'
        ? 'rounded-lg'
        : rounded === 'xl'
          ? 'rounded-xl'
          : rounded === 'sm'
            ? 'rounded-[3px]'
            : 'rounded-none';
  return (
    <div
      className={`${className} ${radius} overflow-hidden shrink-0 bg-[#181A22] border border-white/10 relative`}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover object-[50%_10%] scale-[1.82] origin-[50%_7%] select-none pointer-events-none"
      />
    </div>
  );
};
