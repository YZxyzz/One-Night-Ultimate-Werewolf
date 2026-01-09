import React from 'react';
import { RoleType } from '../../types';
import { ROLES } from '../../constants';

interface PlayingCardProps {
  role?: RoleType | null;
  isRevealed?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const PlayingCard: React.FC<PlayingCardProps> = ({ 
  role, 
  isRevealed = false, 
  isSelected = false, 
  onClick, 
  label,
  disabled = false,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: "w-20 h-28 text-xs",
    md: "w-36 h-56 text-sm", 
    lg: "w-56 h-80 text-base"
  };

  const roleDef = role ? ROLES[role] : null;

  return (
    <div 
      className={`relative perspective-1000 ${sizeClasses[size]} cursor-pointer group transition-all duration-300 ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:-translate-y-2'}`}
      onClick={!disabled ? onClick : undefined}
    >
      {/* Selection Glow (Gold/Magic) */}
      {isSelected && (
        <div className="absolute -inset-3 bg-gradient-to-tr from-gold to-magic rounded-xl blur-md opacity-60 animate-pulse z-0"></div>
      )}

      {/* 3D Container */}
      <div className={`relative w-full h-full duration-700 transform-style-3d transition-transform ${isRevealed ? 'rotate-y-180' : ''}`}>
        
        {/* === FRONT (Role Image) === */}
        <div className="absolute w-full h-full rotate-y-180 backface-hidden bg-white rounded-lg overflow-hidden shadow-xl border-4 border-[#2a2a2a] flex flex-col items-center z-10">
           {/* Inner Frame */}
           <div className="w-full h-full flex flex-col relative overflow-hidden">
             
             {roleDef ? (
               <>
                 {/* Top Label */}
                 <div className="absolute top-0 inset-x-0 h-8 bg-black/80 z-10 flex items-center justify-center border-b border-gold">
                    <span className="text-gold font-mystical text-xs tracking-widest">
                      {roleDef.name.split('/')[0]}
                    </span>
                 </div>

                 {/* Image */}
                 <img 
                    src={roleDef.imagePlaceholder} 
                    alt={roleDef.name} 
                    className="absolute inset-0 w-full h-full object-cover cinema-filter"
                 />

                 {/* Bottom Gradient for Text */}
                 <div className="absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col items-center justify-end pb-2">
                    <span className="text-gray-300 font-serif text-[10px] italic">
                      {roleDef.name.split('/')[1]}
                    </span>
                 </div>
               </>
             ) : (
               <div className="flex items-center justify-center h-full text-ink font-mystical text-2xl animate-pulse">?</div>
             )}
           </div>
        </div>

        {/* === BACK (Totem/Pattern) === */}
        {/* Using a dark back so it stands out against the parchment table */}
        <div className={`absolute w-full h-full backface-hidden bg-[#1a1a1a] rounded-lg flex items-center justify-center shadow-lg z-0 border-4 ${isSelected ? 'border-gold' : 'border-[#2a2a2a]'} transition-colors`}>
          
          <div className="absolute inset-2 border border-[#444] opacity-50 rounded-sm"></div>
          
          {/* Card Back Totem */}
          <div className={`relative w-16 h-16 text-[#444] ${isSelected ? 'text-gold' : 'group-hover:text-[#666]'} transition-colors duration-500`}>
             <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="50" cy="50" r="40" strokeOpacity="0.8" />
                <path d="M50 10 L85 50 L50 90 L15 50 Z" />
                <circle cx="50" cy="50" r="10" fill="currentColor" fillOpacity="0.3" />
             </svg>
          </div>

          {/* Label (e.g., Seat 1) */}
          {label && (
            <div className="absolute bottom-2 left-0 right-0 text-center text-[#666] font-mystical text-[9px] tracking-[0.2em] uppercase bg-black/30 py-0.5">
              {label}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PlayingCard;