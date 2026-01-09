import React, { useEffect, useState } from 'react';
import { GameState, RoleType, Player } from '../../types';
import { ROLES, NIGHT_SEQUENCE } from '../../constants';
import Button from '../ui/Button';
import PlayingCard from '../ui/PlayingCard';

const TIPS = [
  { cn: "天亮后不要看牌！只凭记忆和谎言。", en: "Don't look at your card after waking up!" },
  { cn: "狼人可以为了村民的胜利而选择不杀人。", en: "Werewolves can choose not to kill anyone." },
  { cn: "皮匠想死，投票需谨慎！", en: "The Tanner wants to die, be careful!" },
  { cn: "如果你是捣蛋鬼，交换后不要查看牌。", en: "Troublemaker: swap but don't peek!" },
  { cn: "强盗必须交换牌，并且查看新牌。", en: "Robber must swap and view the new card." },
  { cn: "保持安静，任何声音都可能暴露你的身份。", en: "Stay quiet, noise reveals your role." },
  { cn: "预言家可以查看两张底牌。", en: "Seer can check center cards." },
];

interface NightPhaseProps {
  gameState: GameState;
  currentPlayer: Player;
  onPhaseComplete: () => void; 
  onGodSpeechComplete: () => void; 
  onAction: (actionType: string, targetIds: string[]) => void;
}

const NightPhase: React.FC<NightPhaseProps> = ({ 
  gameState, 
  currentPlayer, 
  onPhaseComplete,
  onGodSpeechComplete,
  onAction
}) => {
  const currentNightRole = NIGHT_SEQUENCE[gameState.currentNightRoleIndex];
  const roleDef = ROLES[currentNightRole];
  const [hasActed, setHasActed] = useState(false);
  const [roleTimer, setRoleTimer] = useState(15); // Reduced from 20 to 15
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const isMyTurn = currentPlayer.initialRole === currentNightRole;
  
  const nextTip = () => setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
  const prevTip = () => setCurrentTipIndex((prev) => (prev - 1 + TIPS.length) % TIPS.length);

  // Timer
  useEffect(() => {
    if (!currentPlayer.isHost) return;
    // Set timer based on complexity. Werewolves/Seer need more time than Mason.
    const initialTime = (currentNightRole === RoleType.WEREWOLF || currentNightRole === RoleType.SEER) ? 15 : 10;
    setRoleTimer(initialTime);
    
    const interval = setInterval(() => {
      setRoleTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onGodSpeechComplete(); 
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.currentNightRoleIndex, currentPlayer.isHost, onGodSpeechComplete, currentNightRole]);

  // Role Logic State
  const [seerMode, setSeerMode] = useState<'CHOICE' | 'PLAYER' | 'CENTER'>('CHOICE');
  const [seerSelectedCenterIndices, setSeerSelectedCenterIndices] = useState<number[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [revealedRoles, setRevealedRoles] = useState<Record<string, RoleType>>({}); 

  // Handlers
  const handleSeerAction = () => {
    if (seerMode === 'PLAYER') {
       if (selectedTargetIds.length !== 1) return;
       const targetId = selectedTargetIds[0];
       const targetPlayer = gameState.players.find(p => p.id === targetId);
       if (targetPlayer && targetPlayer.role) {
         setRevealedRoles({ [targetId]: targetPlayer.role });
         setHasActed(true);
       }
    } else if (seerMode === 'CENTER') {
       if (seerSelectedCenterIndices.length !== 2) return;
       const c1 = gameState.centerCards[seerSelectedCenterIndices[0]];
       const c2 = gameState.centerCards[seerSelectedCenterIndices[1]];
       setRevealedRoles({
         [`center-${seerSelectedCenterIndices[0]}`]: c1,
         [`center-${seerSelectedCenterIndices[1]}`]: c2
       });
       setHasActed(true);
    }
  };

  const handleRobberAction = () => {
    if (selectedTargetIds.length !== 1) return;
    const targetId = selectedTargetIds[0];
    const targetPlayer = gameState.players.find(p => p.id === targetId);
    onAction('ROBBER_SWAP', [targetId]);
    if (targetPlayer && targetPlayer.role) {
       setRevealedRoles({ [targetId]: targetPlayer.role });
       setHasActed(true);
    }
  };

  const handleTroublemakerAction = () => {
    if (selectedTargetIds.length !== 2) return;
    onAction('TROUBLEMAKER_SWAP', selectedTargetIds);
    setHasActed(true);
  };

  const renderPlayerCards = (limit: number, onConfirm: () => void, confirmTextCn: string, confirmTextEn: string) => {
    const others = gameState.players.filter(p => p.id !== currentPlayer.id);
    return (
      <div className="flex flex-col items-center gap-6 animate-fade-in-up w-full">
        <div className="flex flex-wrap justify-center gap-4">
          {others.map(p => {
             const isSelected = selectedTargetIds.includes(p.id);
             const role = revealedRoles[p.id] || null;
             const isRevealed = !!role;

             return (
               <div key={p.id} className="flex flex-col items-center group">
                 <PlayingCard
                    role={role}
                    isRevealed={isRevealed}
                    isSelected={isSelected}
                    label={`${p.seatNumber ? `#${p.seatNumber}` : ''}`}
                    size="md"
                    onClick={() => {
                       if (hasActed) return;
                       if (isSelected) setSelectedTargetIds(prev => prev.filter(id => id !== p.id));
                       else if (selectedTargetIds.length < limit) setSelectedTargetIds(prev => [...prev, p.id]);
                    }}
                 />
                 <div className={`mt-3 font-serif text-sm tracking-wider px-3 py-1 bg-white/50 rounded border border-ink/20 ${isSelected ? 'text-danger border-danger font-bold' : 'text-ink'}`}>
                   {p.name}
                 </div>
               </div>
             )
          })}
        </div>
        {!hasActed ? (
          <div className="mt-6 w-full max-w-xs">
            <Button 
              fullWidth
              disabled={selectedTargetIds.length !== limit}
              onClick={onConfirm}
              variant={selectedTargetIds.length === limit ? 'primary' : 'secondary'}
            >
              <div className="flex flex-col items-center leading-none py-1">
                <span className="text-lg">{confirmTextCn}</span>
                <span className="text-xs opacity-60 font-normal mt-1">{confirmTextEn}</span>
              </div>
            </Button>
          </div>
        ) : (
           <div className="mt-6 text-danger animate-pulse text-center">
              <div className="text-xl font-bold">行动已确认</div>
              <div className="text-sm opacity-70">Action Confirmed</div>
           </div>
        )}
      </div>
    );
  };

  const renderCenterCards = (
    limit: number, 
    selectedIndices: number[], 
    setSelectedIndices: React.Dispatch<React.SetStateAction<number[]>>,
    onConfirm: () => void
  ) => {
    return (
      <div className="flex flex-col items-center gap-6 animate-fade-in-up w-full">
        <div className="flex justify-center gap-4 md:gap-8 p-6 bg-rune-circle bg-contain bg-center bg-no-repeat rounded-full">
          {[0, 1, 2].map(idx => {
            const isSelected = selectedIndices.includes(idx);
            const role = revealedRoles[`center-${idx}`] || null;
            const isRevealed = !!role;

            return (
              <PlayingCard
                key={idx}
                role={role}
                isRevealed={isRevealed}
                isSelected={isSelected}
                label={`Center ${idx + 1}`}
                size="md"
                onClick={() => {
                  if (hasActed) return;
                  if (isSelected) setSelectedIndices(prev => prev.filter(i => i !== idx));
                  else if (selectedIndices.length < limit) setSelectedIndices(prev => [...prev, idx]);
                }}
              />
            )
          })}
        </div>
        {!hasActed ? (
           <div className="mt-6 w-full max-w-xs">
             <Button 
              fullWidth
              disabled={selectedIndices.length !== limit} 
              onClick={onConfirm}
              variant={selectedIndices.length === limit ? 'primary' : 'secondary'}
            >
              <div className="flex flex-col items-center leading-none py-1">
                <span className="text-lg">翻开底牌</span>
                <span className="text-xs opacity-60 font-normal mt-1">Reveal Fate</span>
              </div>
            </Button>
           </div>
        ) : (
           <div className="mt-6 text-danger animate-pulse text-center">
              <div className="text-xl font-bold">命运已揭晓</div>
              <div className="text-sm opacity-70">Fate Revealed</div>
           </div>
        )}
      </div>
    );
  };

  // --- Main Render ---

  // Sleep Mode
  if (!isMyTurn) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink overflow-hidden relative p-8">
        {/* Host Timer */}
        {currentPlayer.isHost && (
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50">
             <div className="text-ink/60 text-xs tracking-widest font-mystical">
                仪式进行中 / RITUAL IN PROGRESS
             </div>
             <div className="flex items-center gap-4">
                <div className="text-xl font-mono text-ink">{roleTimer}s</div>
                <button onClick={() => onGodSpeechComplete()} className="px-3 py-1 bg-ink/10 hover:bg-ink/20 rounded text-xs text-ink/80 uppercase tracking-wider">
                   跳过 / Skip
                </button>
             </div>
          </div>
        )}

        {/* Ambient Animation */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
           <div className="w-[500px] h-[500px] border-2 border-ink rounded-full animate-spin-slow"></div>
        </div>

        <div className="text-center relative z-10 animate-pulse-slow">
            <h2 className="text-5xl md:text-7xl font-mystical text-ink/80 tracking-widest">NIGHTFALL</h2>
            <p className="text-lg text-ink/60 mt-2 font-serif">夜幕降临，请闭眼</p>
        </div>
        
        {/* Tips Carousel - Styled like a scroll */}
        <div className="mt-12 w-full max-w-md relative z-10 flex items-center justify-between gap-4">
            <button onClick={prevTip} className="p-4 text-2xl text-ink/50 hover:text-ink transition-colors">‹</button>
            <div className="flex-1 p-6 sketch-border bg-paper rounded-lg min-h-[160px] flex flex-col items-center justify-center">
              <div className="text-xs uppercase tracking-widest text-danger mb-3 border-b border-danger/20 pb-1">
                提示 #{currentTipIndex + 1}
              </div>
              <p className="text-center font-bold text-ink text-lg mb-2">{TIPS[currentTipIndex].cn}</p>
              <p className="text-center font-serif text-inkDim text-sm italic">{TIPS[currentTipIndex].en}</p>
            </div>
            <button onClick={nextTip} className="p-4 text-2xl text-ink/50 hover:text-ink transition-colors">›</button>
        </div>
        
        <div className="absolute bottom-8 text-center w-full">
           <div className="h-px w-24 bg-ink/20 mx-auto mb-2"></div>
           <p className="text-xs tracking-widest uppercase text-ink/50">
             当前行动: <span className="text-ink font-bold">{roleDef?.name.split('/')[0]}</span>
           </p>
        </div>
      </div>
    );
  }

  // Active Turn
  return (
    <div className="flex flex-col items-center justify-start h-full p-4 overflow-y-auto relative">
      
      {/* Title / Header */}
      <div className="mt-4 mb-8 text-center animate-glow w-full z-10">
        <h2 className="text-4xl md:text-6xl font-mystical text-ink mb-1 drop-shadow-sm tracking-wide">{roleDef?.name.split('/')[0]}</h2>
        <p className="text-magic font-serif italic opacity-90 text-lg">{roleDef?.name.split('/')[1]}</p>
        <div className="w-32 h-px bg-gradient-to-r from-transparent via-ink/50 to-transparent mx-auto mt-4"></div>
      </div>

      {/* Main Action Area */}
      <div className="w-full max-w-4xl flex-1 flex flex-col items-center justify-start relative z-10 bg-white/40 p-6 rounded-xl border border-ink/10 shadow-inner">
        
        {/* SEER */}
        {currentNightRole === RoleType.SEER && (
           <>
             {seerMode === 'CHOICE' && !hasActed && (
               <div className="flex flex-col md:flex-row gap-6 animate-fade-in-up mt-8">
                  <button onClick={() => { setSeerMode('PLAYER'); setSelectedTargetIds([]); }} className="group totem-border p-8 w-48 h-64 flex flex-col items-center justify-center hover:bg-white transition-all duration-300 rounded-xl">
                     <span className="text-5xl mb-6 opacity-60 group-hover:opacity-100 transition-opacity">👥</span>
                     <span className="font-bold text-ink text-xl mb-1">查看玩家</span>
                     <span className="text-sm text-inkDim font-serif">View Player</span>
                  </button>
                  <button onClick={() => setSeerMode('CENTER')} className="group totem-border p-8 w-48 h-64 flex flex-col items-center justify-center hover:bg-white transition-all duration-300 rounded-xl">
                     <span className="text-5xl mb-6 opacity-60 group-hover:opacity-100 transition-opacity">🃏</span>
                     <span className="font-bold text-ink text-xl mb-1">查看底牌</span>
                     <span className="text-sm text-inkDim font-serif">View Center</span>
                  </button>
               </div>
             )}
             {seerMode === 'PLAYER' && (
               <div className="w-full">
                 <div className="flex items-center justify-center mb-6 gap-4">
                   <h3 className="text-xl text-ink font-bold">预言: 选择一位玩家</h3>
                   {!hasActed && <button onClick={() => setSeerMode('CHOICE')} className="text-sm text-ink/70 underline hover:text-ink">返回 / Back</button>}
                 </div>
                 {renderPlayerCards(1, handleSeerAction, "揭示真身", "Reveal Identity")}
               </div>
             )}
             {seerMode === 'CENTER' && (
               <div className="w-full">
                 <div className="flex items-center justify-center mb-6 gap-4">
                   <h3 className="text-xl text-ink font-bold">预言: 选择两张底牌</h3>
                   {!hasActed && <button onClick={() => setSeerMode('CHOICE')} className="text-sm text-ink/70 underline hover:text-ink">返回 / Back</button>}
                 </div>
                 {renderCenterCards(2, seerSelectedCenterIndices, setSeerSelectedCenterIndices, handleSeerAction)}
               </div>
             )}
           </>
        )}

        {/* ROBBER */}
        {currentNightRole === RoleType.ROBBER && (
           <div className="w-full">
              <p className="text-center text-inkDim mb-6 font-serif italic">"今晚，我要窃取谁的人生？"</p>
              {renderPlayerCards(1, handleRobberAction, "实施盗窃", "Steal Identity")}
           </div>
        )}

        {/* TROUBLEMAKER */}
        {currentNightRole === RoleType.TROUBLEMAKER && (
           <div className="w-full">
              <p className="text-center text-inkDim mb-6 font-serif italic">"混乱是阶梯..."</p>
              {renderPlayerCards(2, handleTroublemakerAction, "制造混乱", "Sow Discord")}
           </div>
        )}

        {/* WEREWOLF */}
        {currentNightRole === RoleType.WEREWOLF && (
           <div className="w-full flex flex-col items-center mt-4">
              {(() => {
                  const teammates = gameState.players.filter(p => p.initialRole === RoleType.WEREWOLF && p.id !== currentPlayer.id);
                  const isLoneWolf = teammates.length === 0;

                  if (!isLoneWolf) {
                    return (
                       <div className="sketch-border p-8 rounded-xl text-center max-w-lg bg-red-50/50 w-full animate-fade-in-up">
                          <h3 className="font-mystical text-2xl text-danger mb-2">狼群集结</h3>
                          <p className="text-sm text-red-800 mb-6 tracking-widest uppercase border-b border-red-800/20 pb-2">The Pack United</p>
                          <div className="flex flex-wrap justify-center gap-6">
                            {teammates.map(p => (
                               <div key={p.id} className="flex flex-col items-center group">
                                  {/* USE PLAYING CARD FOR TEAMMATES */}
                                  <PlayingCard 
                                    role={p.initialRole} 
                                    isRevealed={true} 
                                    isSelected={true}
                                    label={`#${p.seatNumber}`}
                                    size="md"
                                  />
                                  <span className="mt-3 font-bold text-danger tracking-widest text-lg">{p.name}</span>
                               </div>
                            ))}
                          </div>
                          {!hasActed ? (
                             <div className="mt-10 max-w-xs mx-auto">
                                <Button onClick={() => setHasActed(true)} variant="danger" fullWidth>
                                  <div className="flex flex-col">
                                    <span>确认同伴</span>
                                    <span className="text-xs opacity-70">Acknowledge</span>
                                  </div>
                                </Button>
                             </div>
                          ) : (
                            <div className="mt-6 text-danger font-bold text-xl animate-pulse">已确认 / Confirmed</div>
                          )}
                       </div>
                    );
                  } else {
                    return (
                      <div className="w-full animate-fade-in-up">
                         <div className="flex items-center justify-center mb-6 flex-col">
                            <h3 className="text-2xl text-danger font-bold tracking-widest uppercase">孤狼 (Lone Wolf)</h3>
                            <p className="text-inkDim text-sm font-serif italic">"没有同伴... 但你可以窥探命运。"</p>
                         </div>
                        
                        {renderCenterCards(1, seerSelectedCenterIndices, setSeerSelectedCenterIndices, () => {
                           if (seerSelectedCenterIndices.length !== 1) return;
                           const idx = seerSelectedCenterIndices[0];
                           const card = gameState.centerCards[idx];
                           setRevealedRoles({ [`center-${idx}`]: card });
                           setHasActed(true);
                        })}
                      </div>
                    );
                  }
              })()}
           </div>
        )}

        {/* INSOMNIAC */}
        {currentNightRole === RoleType.INSOMNIAC && (
           <div className="text-center mt-8">
              {!hasActed ? (
                <div className="max-w-xs mx-auto">
                 <Button onClick={() => {
                    setRevealedRoles({ 'insomniac-self': currentPlayer.role! });
                    setHasActed(true);
                 }} fullWidth>
                   <div className="flex flex-col">
                     <span>检查我的身份</span>
                     <span className="text-xs opacity-70">Check My Card</span>
                   </div>
                 </Button>
                </div>
              ) : (
                 <div className="mt-8">
                    <p className="text-inkDim mb-4 font-serif">当你醒来时...</p>
                    <div className="flex justify-center">
                      <PlayingCard 
                        role={currentPlayer.role} 
                        isRevealed={true} 
                        isSelected={true}
                        label="Your Role"
                        size="lg"
                      />
                    </div>
                 </div>
              )}
           </div>
        )}
        
        {/* Simple Roles */}
        {(currentNightRole === RoleType.MASON || currentNightRole === RoleType.MINION) && (
           <div className="text-center mt-8 p-6 bg-paperDark rounded-xl border border-ink/10">
              <p className="text-2xl text-ink mb-2 font-bold">
                {currentNightRole === RoleType.MINION ? "效忠狼人" : "守夜人兄弟会"}
              </p>
              <p className="text-sm text-inkDim mb-6 uppercase tracking-wider">
                {currentNightRole === RoleType.MINION ? "Serve the Wolves" : "Brotherhood of Stone"}
              </p>
              
              {!hasActed ? (
                 <div className="max-w-xs mx-auto">
                   <Button onClick={() => setHasActed(true)} fullWidth>
                      <div className="flex flex-col">
                         <span>确认</span>
                         <span className="text-xs opacity-70">Acknowledge</span>
                      </div>
                   </Button>
                 </div>
              ) : (
                 <div className="text-inkDim mt-4 italic">等待天亮 / Waiting for dawn...</div>
              )}
           </div>
        )}

      </div>
      
      {/* Footer Timer */}
      {currentPlayer.isHost && (
         <div className="fixed bottom-4 right-4 text-xs font-mono text-ink/40">
            Auto-skip in {roleTimer}s
         </div>
      )}
    </div>
  );
};

export default NightPhase;