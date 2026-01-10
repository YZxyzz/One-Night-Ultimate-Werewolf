import React, { useEffect, useState, useRef } from 'react';
import { GameState, RoleType, Player } from '../../types';
import { ROLES, NIGHT_SEQUENCE } from '../../constants';
import Button from '../ui/Button';
import PlayingCard from '../ui/PlayingCard';
import { geminiService } from '../../services/geminiService';
import { soundService } from '../../services/soundService';

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
  onAction: (actionType: string, targetIds: (string | number)[]) => void;
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
  const [roleTimer, setRoleTimer] = useState(20); 
  const isMyTurn = currentPlayer.initialRole === currentNightRole;
  const hasSpokenRef = useRef(false);

  // --- AUDIO NARRATION (HOST ONLY) ---
  useEffect(() => {
    // Reset spoken flag when role changes
    hasSpokenRef.current = false;
    
    const playNarration = async () => {
        if (!currentPlayer.isHost || !roleDef) return;
        
        // Prevent double speech
        if (hasSpokenRef.current) return;
        hasSpokenRef.current = true;

        console.log("Generating narration for:", roleDef.name);
        // Play wake up text
        const audioBuffer = await geminiService.generateNarration(roleDef.wakeUpText + "。 " + roleDef.actionDescription);
        if (audioBuffer) {
            await soundService.playAudioData(audioBuffer);
        }
    };

    playNarration();
  }, [gameState.currentNightRoleIndex, currentPlayer.isHost]);

  // --- TIMER ---
  useEffect(() => {
    if (!currentPlayer.isHost) return;
    const initialTime = (currentNightRole === RoleType.WEREWOLF || currentNightRole === RoleType.SEER) ? 25 : 15;
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

  // --- ROLE LOGIC STATES ---
  const [seerMode, setSeerMode] = useState<'CHOICE' | 'PLAYER' | 'CENTER'>('CHOICE');
  const [seerSelectedCenterIndices, setSeerSelectedCenterIndices] = useState<number[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [revealedRoles, setRevealedRoles] = useState<Record<string, RoleType>>({}); 

  // --- HANDLERS ---
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
  
  const handleDrunkAction = () => {
      if (seerSelectedCenterIndices.length !== 1) return;
      onAction('DRUNK_SWAP', [seerSelectedCenterIndices[0]]);
      setHasActed(true);
  };

  // --- RENDER HELPERS: RADIAL SEATING CHART ---

  const renderRadialUI = (
      instruction: string,
      playerSelectLimit: number,
      centerSelectLimit: number,
      onConfirm: () => void,
      confirmText: string
  ) => {
      const totalSeats = gameState.settings.playerCount;
      const seats = Array.from({ length: totalSeats }, (_, i) => {
          const angle = (i * (360 / totalSeats)) - 90;
          const radius = 110; // Slightly larger for interaction
          const x = Math.cos((angle * Math.PI) / 180) * radius;
          const y = Math.sin((angle * Math.PI) / 180) * radius;
          return { id: i + 1, x, y };
      });

      return (
          <div className="relative w-full h-[450px] flex flex-col items-center justify-center animate-fade-in-up">
              <h3 className="text-xl font-woodcut text-ink mb-4 absolute top-0 z-20 bg-paper/80 px-4 py-1 rounded-full border border-ink/20">{instruction}</h3>
              
              <div className="relative w-[320px] h-[320px] mt-8">
                  {/* Center Circle (Table) */}
                  <div className="absolute inset-0 m-auto w-48 h-48 rounded-full border-4 border-ink/20 bg-paperDark flex flex-col items-center justify-center shadow-inner z-0">
                      {/* Center Cards Area */}
                      {centerSelectLimit > 0 && (
                          <div className="flex gap-2 z-10">
                              {[0, 1, 2].map(idx => {
                                  const isSelected = seerSelectedCenterIndices.includes(idx);
                                  const role = revealedRoles[`center-${idx}`] || null;
                                  const isRevealed = !!role;
                                  
                                  return (
                                      <div 
                                        key={idx}
                                        onClick={() => {
                                            if (hasActed) return;
                                            if (isSelected) setSeerSelectedCenterIndices(prev => prev.filter(i => i !== idx));
                                            else if (seerSelectedCenterIndices.length < centerSelectLimit) setSeerSelectedCenterIndices(prev => [...prev, idx]);
                                        }}
                                        className={`w-10 h-14 rounded border-2 transition-all cursor-pointer relative ${isSelected ? 'border-rust -translate-y-2 shadow-md' : 'border-ink/40 bg-paper hover:bg-white'}`}
                                      >
                                          {isRevealed ? (
                                              <img src={ROLES[role].imagePlaceholder} className="w-full h-full object-cover opacity-80" />
                                          ) : (
                                              <div className="w-full h-full flex items-center justify-center text-[8px] text-ink/30 font-woodcut">?</div>
                                          )}
                                          {isSelected && <div className="absolute -top-1 -right-1 w-3 h-3 bg-rust rounded-full"></div>}
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                      {centerSelectLimit > 0 && <span className="text-[9px] text-ink/40 mt-2 uppercase tracking-widest font-bold">Center Cards</span>}
                  </div>

                  {/* Player Seats */}
                  {seats.map((seat) => {
                      const player = gameState.players.find(p => p.seatNumber === seat.id);
                      if (!player) return null; // Should not happen in game
                      
                      const isMe = player.id === currentPlayer.id;
                      const isSelected = selectedTargetIds.includes(player.id);
                      const isRevealed = !!revealedRoles[player.id];
                      const role = revealedRoles[player.id];
                      
                      // Determine if selectable
                      const canSelect = !isMe && playerSelectLimit > 0 && !hasActed;

                      return (
                          <button 
                            key={seat.id}
                            onClick={() => {
                                if (!canSelect) return;
                                if (isSelected) setSelectedTargetIds(prev => prev.filter(id => id !== player.id));
                                else if (selectedTargetIds.length < playerSelectLimit) setSelectedTargetIds(prev => [...prev, player.id]);
                            }}
                            className={`absolute w-14 h-14 -ml-7 -mt-7 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-300 z-20
                                ${isMe ? 'bg-ink text-paper border-ink scale-90 cursor-default' : ''}
                                ${isSelected ? 'bg-rust text-white border-rust scale-110 shadow-lg' : 'bg-paper text-ink border-ink hover:scale-105'}
                                ${!canSelect && !isMe ? 'opacity-50 grayscale' : ''}
                            `}
                            style={{ left: `calc(50% + ${seat.x}px)`, top: `calc(50% + ${seat.y}px)` }}
                          >
                              {isRevealed ? (
                                   <div className="w-full h-full rounded-full overflow-hidden relative">
                                       <img src={ROLES[role].imagePlaceholder} className="w-full h-full object-cover" />
                                       <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[8px] text-white font-bold uppercase">{ROLES[role].name.split('/')[0]}</div>
                                   </div>
                              ) : (
                                  <>
                                    <span className="font-woodcut text-lg leading-none">{player.name.charAt(0)}</span>
                                    <span className="text-[6px] uppercase font-bold max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-1">{player.name}</span>
                                  </>
                              )}
                              
                              {/* Seat Number Badge */}
                              <div className={`absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border ${isSelected ? 'bg-white text-rust border-white' : 'bg-ink text-white border-ink'}`}>
                                  {seat.id}
                              </div>
                          </button>
                      );
                  })}
              </div>

              {/* Confirm Action Button area */}
              <div className="absolute bottom-0 w-full px-6 flex justify-center">
                  {!hasActed ? (
                    <Button 
                      onClick={onConfirm}
                      disabled={(playerSelectLimit > 0 && selectedTargetIds.length !== playerSelectLimit) || (centerSelectLimit > 0 && seerSelectedCenterIndices.length !== centerSelectLimit)}
                      className="shadow-sketch-lg"
                    >
                        {confirmText}
                    </Button>
                  ) : (
                    <div className="bg-paper border-sketch px-6 py-2 text-center animate-pulse">
                        <span className="text-rust font-woodcut text-xl">已确认 / Confirmed</span>
                    </div>
                  )}
              </div>
          </div>
      );
  };


  // --- MAIN RENDER ---

  // Sleep Mode
  if (!isMyTurn) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink overflow-hidden relative p-8">
        {/* Host Timer */}
        {currentPlayer.isHost && (
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50">
             <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-rust rounded-full animate-ping"></div>
                 <div className="text-rust text-xs font-bold tracking-widest">
                    正在播报... / BROADCASTING
                 </div>
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
        
        <div className="absolute bottom-16 text-center w-full">
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
    <div className="flex flex-col items-center justify-start h-full pt-4 pb-20 overflow-hidden relative">
      
      {/* Title / Header */}
      <div className="text-center animate-glow w-full z-10 mb-2">
        <h2 className="text-3xl font-mystical text-ink mb-1 drop-shadow-sm tracking-wide">{roleDef?.name.split('/')[0]}</h2>
        <p className="text-inkLight font-serif italic text-xs opacity-80">{roleDef?.actionDescription}</p>
      </div>

      {/* Main Action Area - Radial UI */}
      <div className="w-full flex-1 relative z-10">
        
        {/* SEER */}
        {currentNightRole === RoleType.SEER && (
           <>
             {seerMode === 'CHOICE' && !hasActed && (
               <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in-up">
                  <button onClick={() => { setSeerMode('PLAYER'); setSelectedTargetIds([]); }} className="group sketch-border p-6 w-64 flex items-center justify-center gap-4 hover:bg-white transition-all bg-paper shadow-md">
                     <span className="text-4xl">👤</span>
                     <div className="text-left">
                        <span className="font-bold text-ink block">查看一位玩家</span>
                        <span className="text-xs text-inkDim font-serif">View 1 Player</span>
                     </div>
                  </button>
                  <button onClick={() => setSeerMode('CENTER')} className="group sketch-border p-6 w-64 flex items-center justify-center gap-4 hover:bg-white transition-all bg-paper shadow-md">
                     <span className="text-4xl">🃏</span>
                     <div className="text-left">
                        <span className="font-bold text-ink block">查看两张底牌</span>
                        <span className="text-xs text-inkDim font-serif">View 2 Center Cards</span>
                     </div>
                  </button>
               </div>
             )}
             {seerMode === 'PLAYER' && renderRadialUI("选择一位玩家查看身份", 1, 0, handleSeerAction, "揭示真身")}
             {seerMode === 'CENTER' && renderRadialUI("选择两张底牌查看", 0, 2, handleSeerAction, "翻开底牌")}
             {hasActed && (
                 <div className="absolute bottom-20 w-full text-center">
                    <button onClick={() => setSeerMode('CHOICE')} className="text-ink/50 text-sm underline hidden">Back</button>
                 </div>
             )}
           </>
        )}

        {/* ROBBER */}
        {currentNightRole === RoleType.ROBBER && renderRadialUI("选择一位玩家交换身份", 1, 0, handleRobberAction, "实施盗窃")}

        {/* TROUBLEMAKER */}
        {currentNightRole === RoleType.TROUBLEMAKER && renderRadialUI("选择两位玩家交换他们的牌", 2, 0, handleTroublemakerAction, "制造混乱")}
        
        {/* DRUNK */}
        {currentNightRole === RoleType.DRUNK && renderRadialUI("选择一张底牌与自己交换", 0, 1, handleDrunkAction, "盲目交换")}

        {/* WEREWOLF */}
        {currentNightRole === RoleType.WEREWOLF && (
           <div className="w-full h-full flex flex-col items-center justify-center">
              {(() => {
                  const teammates = gameState.players.filter(p => p.initialRole === RoleType.WEREWOLF && p.id !== currentPlayer.id);
                  const isLoneWolf = teammates.length === 0;

                  if (!isLoneWolf) {
                    return (
                       <div className="sketch-border p-8 rounded-xl text-center max-w-sm bg-red-50/50 w-full animate-fade-in-up mx-6">
                          <h3 className="font-mystical text-2xl text-danger mb-2">狼群集结</h3>
                          <div className="flex flex-wrap justify-center gap-4 my-6">
                            {teammates.map(p => (
                               <div key={p.id} className="flex flex-col items-center">
                                  <div className="w-16 h-16 rounded-full border-2 border-danger bg-paper flex items-center justify-center overflow-hidden">
                                     <img src={ROLES[p.initialRole].imagePlaceholder} className="w-full h-full object-cover" />
                                  </div>
                                  <span className="mt-2 font-bold text-danger text-sm">{p.name}</span>
                               </div>
                            ))}
                          </div>
                          {!hasActed ? (
                                <Button onClick={() => setHasActed(true)} variant="danger" fullWidth>确认同伴</Button>
                          ) : <div className="text-danger font-bold">已确认</div>}
                       </div>
                    );
                  } else {
                    return renderRadialUI("你是孤狼。你可以查看一张底牌。", 0, 1, () => {
                           if (seerSelectedCenterIndices.length !== 1) return;
                           const idx = seerSelectedCenterIndices[0];
                           const card = gameState.centerCards[idx];
                           setRevealedRoles({ [`center-${idx}`]: card });
                           setHasActed(true);
                        }, "窥探底牌");
                  }
              })()}
           </div>
        )}

        {/* INSOMNIAC */}
        {currentNightRole === RoleType.INSOMNIAC && (
           <div className="h-full flex flex-col items-center justify-center">
              {!hasActed ? (
                 <Button onClick={() => {
                    setRevealedRoles({ 'insomniac-self': currentPlayer.role! });
                    setHasActed(true);
                 }} className="shadow-sketch-lg">检查我的身份</Button>
              ) : (
                 <div className="text-center animate-fade-in-up">
                    <p className="text-inkDim mb-4 font-serif">当你醒来时...</p>
                    <div className="w-40 h-60 mx-auto transform scale-105">
                      <PlayingCard 
                        role={currentPlayer.role} 
                        isRevealed={true} 
                        isSelected={true}
                        label="Your Role"
                        size="md"
                      />
                    </div>
                 </div>
              )}
           </div>
        )}
        
        {/* Simple Roles */}
        {(currentNightRole === RoleType.MASON || currentNightRole === RoleType.MINION) && (
           <div className="h-full flex items-center justify-center px-6">
               <div className="text-center p-8 bg-paperDark rounded-xl border-sketch w-full max-w-sm">
                  <p className="text-2xl text-ink mb-2 font-bold">
                    {currentNightRole === RoleType.MINION ? "效忠狼人" : "守夜人兄弟会"}
                  </p>
                  
                  {currentNightRole === RoleType.MASON && (
                      <div className="my-4">
                          {gameState.players.filter(p => p.initialRole === RoleType.MASON && p.id !== currentPlayer.id).map(p => (
                             <div key={p.id} className="font-bold text-ink border-b border-ink/20 pb-1 mb-2">同伴: {p.name}</div>
                          ))}
                          {gameState.players.filter(p => p.initialRole === RoleType.MASON && p.id !== currentPlayer.id).length === 0 && (
                              <div className="text-inkDim italic">没有其他守夜人。</div>
                          )}
                      </div>
                  )}

                  {!hasActed ? (
                       <Button onClick={() => setHasActed(true)} fullWidth>确认</Button>
                  ) : (
                     <div className="text-inkDim mt-4 italic">等待天亮...</div>
                  )}
               </div>
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