import React, { useEffect, useState, useRef } from 'react';
import { GameState, RoleType, Player } from '../../types';
import { ROLES, NIGHT_SEQUENCE, GAME_TIPS } from '../../constants';
import Button from '../ui/Button';
import PlayingCard from '../ui/PlayingCard';
import { geminiService } from '../../services/geminiService';
import { soundService } from '../../services/soundService';

interface NightPhaseProps {
  gameState: GameState;
  currentPlayer: Player;
  activeNightSequence: RoleType[];
  onPhaseComplete: () => void; 
  onGodSpeechComplete: () => void; 
  onAction: (actionType: string, targetIds: (string | number)[]) => void;
}

// --- SUB-COMPONENT: ACTION RESULT OVERLAY ---
interface ActionResultOverlayProps {
    title: string;
    cards: { role: RoleType | null, label: string }[];
    onClose: () => void;
}

const ActionResultOverlay: React.FC<ActionResultOverlayProps> = ({ title, cards, onClose }) => {
    const [revealed, setRevealed] = useState(false);

    useEffect(() => {
        // Force reveal immediately for UX snappiness
        const timer = setTimeout(() => setRevealed(true), 50);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl p-4 animate-fade-in">
            <h3 className="text-3xl font-woodcut text-paper mb-8 drop-shadow-lg text-center leading-relaxed max-w-lg">{title}</h3>
            
            <div className="flex flex-wrap justify-center gap-8 mb-10">
                {cards.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center" style={{ transitionDelay: `${idx * 150}ms` }}>
                        {/* CARD VISUAL */}
                        <div className={`transform transition-all duration-700 ${revealed ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
                            <PlayingCard 
                                role={item.role} 
                                isRevealed={true} // FORCE TRUE
                                label={item.label} 
                                size="lg" 
                            />
                        </div>
                        
                        {/* TEXT FALLBACK - CRITICAL FOR CLARITY */}
                        {revealed && item.role && (
                            <div className="mt-6 animate-fade-in-up text-center">
                                <div className="text-2xl font-bold text-rust font-woodcut bg-paper px-6 py-2 border-2 border-ink shadow-[0_0_15px_rgba(200,50,50,0.3)] rounded-sm">
                                    {ROLES[item.role].name.split('/')[0]}
                                </div>
                                <div className="text-[10px] text-paper/60 mt-2 uppercase tracking-widest font-mono border-t border-paper/20 pt-1">
                                    Identity Revealed
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <Button onClick={onClose} className="animate-bounce mt-8 shadow-[0_0_20px_rgba(255,255,255,0.2)]" variant="secondary">
                <span className="text-xl">我记住了 (Confirm)</span>
            </Button>
        </div>
    );
};

// ... (GameTipsCarousel remains unchanged) ...
const GameTipsCarousel: React.FC = () => {
    const [index, setIndex] = useState(0);
    const timerRef = useRef<any>(null);

    const nextTip = () => {
        setIndex(prev => (prev + 1) % GAME_TIPS.length);
        resetTimer();
    };
    
    const resetTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
             setIndex(prev => (prev + 1) % GAME_TIPS.length);
        }, 6000);
    };

    useEffect(() => {
        resetTimer();
        return () => clearInterval(timerRef.current);
    }, []);

    return (
        <div className="absolute bottom-20 w-full px-6 flex justify-center animate-fade-in cursor-pointer z-30" onClick={nextTip}>
           <div className="bg-paperDark border-sketch p-4 max-w-md w-full text-center relative shadow-lg group hover:scale-[1.02] transition-transform">
               <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-ink text-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm z-10">
                   生存指南 / Survival Tips
               </div>
               <div className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/10 group-hover:text-ink/30 transition-colors text-2xl font-bold">›</div>
               <p className="font-serif italic text-ink text-sm leading-relaxed transition-all duration-500 min-h-[3em] flex items-center justify-center select-none px-4">
                   {GAME_TIPS[index]}
               </p>
               <div className="flex justify-center gap-1 mt-2">
                   {GAME_TIPS.map((_, i) => (
                       <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-rust' : 'bg-ink/20'}`}></div>
                   ))}
               </div>
               <div className="text-[9px] text-inkDim mt-1 opacity-0 group-hover:opacity-100 transition-opacity">点击切换 / Tap for next</div>
           </div>
        </div>
    );
};

const NightPhase: React.FC<NightPhaseProps> = ({ 
  gameState, 
  currentPlayer,
  activeNightSequence,
  onAction
}) => {
  const currentNightRole = activeNightSequence[gameState.currentNightRoleIndex];
  const roleDef = ROLES[currentNightRole];
  
  const [hasActed, setHasActed] = useState(false);
  const isMyTurn = currentPlayer.initialRole === currentNightRole;
  const hasSpokenRef = useRef(false);

  const [seerMode, setSeerMode] = useState<'CHOICE' | 'PLAYER' | 'CENTER'>('CHOICE');
  const [seerSelectedCenterIndices, setSeerSelectedCenterIndices] = useState<number[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  
  const [resultData, setResultData] = useState<{ title: string, cards: {role: RoleType | null, label: string}[] } | null>(null);

  useEffect(() => {
    hasSpokenRef.current = false;
    setHasActed(false); 
    setResultData(null); 
    setSeerMode('CHOICE'); 
    setSelectedTargetIds([]); 
    setSeerSelectedCenterIndices([]); 
  }, [gameState.currentNightRoleIndex]);

  const confirmTurn = () => {
      setHasActed(true);
      onAction('CONFIRM_TURN', []);
  };

  // --- ACTION HANDLERS ---

  const handleSeerAction = () => {
    if (seerMode === 'PLAYER') {
       if (selectedTargetIds.length !== 1) return;
       const targetId = selectedTargetIds[0];
       const targetPlayer = gameState.players.find(p => p.id === targetId);
       
       onAction('SEER_VIEW_PLAYER', [targetId]);
       
       if (targetPlayer) {
         setResultData({
             title: `玩家 ${targetPlayer.name} 的身份`,
             cards: [{ role: targetPlayer.role, label: targetPlayer.name }]
         });
         // CRITICAL FIX: Do NOT call confirmTurn() here. Wait for user to close overlay.
       }
    } else if (seerMode === 'CENTER') {
       if (seerSelectedCenterIndices.length !== 2) return;
       
       onAction('SEER_VIEW_CENTER', seerSelectedCenterIndices);

       const c1 = gameState.centerCards[seerSelectedCenterIndices[0]];
       const c2 = gameState.centerCards[seerSelectedCenterIndices[1]];
       
       setResultData({
           title: "底牌身份",
           cards: [
               { role: c1, label: `底牌 ${seerSelectedCenterIndices[0] + 1}` },
               { role: c2, label: `底牌 ${seerSelectedCenterIndices[1] + 1}` }
           ]
       });
       // CRITICAL FIX: Do NOT call confirmTurn() here.
    }
  };

  const handleRobberAction = () => {
    if (selectedTargetIds.length !== 1) return;
    const targetId = selectedTargetIds[0];
    const targetPlayer = gameState.players.find(p => p.id === targetId);
    
    onAction('ROBBER_SWAP', [targetId]);
    
    if (targetPlayer) {
       setResultData({
           title: `你抢到了 ${targetPlayer.name} 的身份`,
           cards: [{ role: targetPlayer.role, label: "你现在是 (You are now)" }]
       });
       // CRITICAL FIX: Do NOT call confirmTurn() here.
    }
  };

  const handleTroublemakerAction = () => {
    if (selectedTargetIds.length !== 2) return;
    onAction('TROUBLEMAKER_SWAP', selectedTargetIds);
    // Troublemaker gets no info, so confirm immediately is fine, but UX feels better with a delay.
    // Let's force a small local pause or just confirm. 
    // For consistency, let's just confirm immediately for now as they have no overlay.
    confirmTurn();
  };
  
  const handleDrunkAction = () => {
      if (seerSelectedCenterIndices.length !== 1) return;
      onAction('DRUNK_SWAP', [seerSelectedCenterIndices[0]]);
      confirmTurn();
  };

  const handleLoneWolfAction = () => {
      if (seerSelectedCenterIndices.length !== 1) return;
      const idx = seerSelectedCenterIndices[0];
      const card = gameState.centerCards[idx];
      
      onAction('LONE_WOLF_VIEW', [idx]);

      setResultData({
          title: "底牌信息",
          cards: [{ role: card, label: `底牌 ${idx + 1}` }]
      });
      // CRITICAL FIX: Do NOT call confirmTurn() here.
  };

  const handleInsomniacAction = () => {
      // NOTE: Insomniac sees their FINAL role.
      // We rely on 'currentPlayer.role' being updated via SYNC_STATE from the host *before* this action?
      // Actually, local logic might lag if host hasn't processed previous swaps yet.
      // However, in this architecture, roles are updated on Host and synced. 
      // Assuming 'gameState.players' has the latest truth.
      
      // We need to look up OURSELF in the gameState to get the latest server truth, 
      // rather than relying on the potentially stale 'currentPlayer' prop passed down if the parent didn't update.
      const me = gameState.players.find(p => p.id === currentPlayer.id);
      const finalRole = me ? me.role : currentPlayer.role;

      setResultData({
          title: "你现在的身份",
          cards: [{ role: finalRole, label: "最终身份 (Final Role)" }]
      });
      // CRITICAL FIX: Do NOT call confirmTurn() here.
  };

  // ... renderRadialUI ...
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
          const radius = 110; 
          const x = Math.cos((angle * Math.PI) / 180) * radius;
          const y = Math.sin((angle * Math.PI) / 180) * radius;
          return { id: i + 1, x, y };
      });

      return (
          <div className="relative w-full h-[450px] flex flex-col items-center justify-center animate-fade-in-up">
              <h3 className="text-xl font-woodcut text-ink mb-4 absolute top-0 z-20 bg-paper/90 px-6 py-2 rounded-full border border-ink/20 shadow-sm whitespace-nowrap">
                  {instruction}
              </h3>
              
              <div className="relative w-[320px] h-[320px] mt-8">
                  <div className="absolute inset-0 m-auto w-48 h-48 rounded-full border-4 border-ink/20 bg-paperDark flex flex-col items-center justify-center shadow-inner z-0">
                      {centerSelectLimit > 0 && (
                          <div className="flex gap-2 z-10 justify-center">
                              {[0, 1, 2].map(idx => {
                                  const isSelected = seerSelectedCenterIndices.includes(idx);
                                  return (
                                      <div 
                                        key={idx}
                                        onClick={() => {
                                            if (hasActed) return;
                                            if (isSelected) {
                                                setSeerSelectedCenterIndices(prev => prev.filter(i => i !== idx));
                                            } else {
                                                if (centerSelectLimit === 1) {
                                                    setSeerSelectedCenterIndices([idx]);
                                                } else {
                                                    setSeerSelectedCenterIndices(prev => {
                                                        if (prev.length < centerSelectLimit) return [...prev, idx];
                                                        return [...prev.slice(1), idx];
                                                    });
                                                }
                                            }
                                        }}
                                        className={`relative transition-all cursor-pointer w-10 h-14 rounded ${isSelected ? 'border-2 border-rust -translate-y-2 shadow-md bg-paper' : 'border-2 border-ink/40 bg-paper hover:bg-white'}`}
                                      >
                                          <div className="w-full h-full flex items-center justify-center text-[8px] text-ink/30 font-woodcut">?</div>
                                          {isSelected && <div className="absolute -top-1 -right-1 w-3 h-3 bg-rust rounded-full"></div>}
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                      {centerSelectLimit > 0 && <span className="text-[9px] text-ink/40 mt-8 uppercase tracking-widest font-bold">Center Cards</span>}
                  </div>

                  {seats.map((seat) => {
                      const player = gameState.players.find(p => p.seatNumber === seat.id);
                      if (!player) return null; 
                      
                      const isMe = player.id === currentPlayer.id;
                      const isSelected = selectedTargetIds.includes(player.id);
                      const canSelect = !isMe && playerSelectLimit > 0 && !hasActed;

                      return (
                          <button 
                            key={seat.id}
                            onClick={() => {
                                if (!canSelect) return;
                                if (isSelected) {
                                    setSelectedTargetIds(prev => prev.filter(id => id !== player.id));
                                } else {
                                    if (playerSelectLimit === 1) {
                                        setSelectedTargetIds([player.id]);
                                    } else {
                                        setSelectedTargetIds(prev => {
                                            if (prev.length < playerSelectLimit) return [...prev, player.id];
                                            return [...prev.slice(1), player.id];
                                        });
                                    }
                                }
                            }}
                            disabled={!canSelect}
                            className={`absolute w-14 h-14 -ml-7 -mt-7 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-300 z-20
                                ${isMe ? 'bg-ink/5 border-ink/10 border-dashed cursor-not-allowed opacity-60 grayscale' : ''}
                                ${isSelected ? 'bg-rust text-white border-rust scale-110 shadow-lg' : canSelect ? 'bg-paper text-ink border-ink hover:scale-105' : 'bg-paper/50 text-ink/50 border-ink/20'}
                            `}
                            style={{ 
                                left: `calc(50% + ${seat.x}px)`, 
                                top: `calc(50% + ${seat.y}px)`,
                                backgroundColor: isMe ? undefined : (player.color || undefined),
                                color: isMe ? undefined : (player.color ? '#fff' : undefined)
                            }}
                          >
                              <span className="font-woodcut text-lg leading-none drop-shadow-sm">{player.name.charAt(0)}</span>
                              {isMe && <span className="absolute -bottom-4 bg-ink text-paper text-[8px] font-bold uppercase px-1 rounded">ME</span>}
                              <div className={`absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border ${isSelected ? 'bg-white text-rust border-white' : 'bg-ink text-white border-ink'}`}>
                                  {seat.id}
                              </div>
                              <div className={`absolute top-full mt-2 text-[8px] uppercase font-bold whitespace-nowrap px-1 bg-paper/90 rounded border border-ink/10 shadow-sm ${isSelected ? 'text-rust' : 'text-ink'}`}>
                                  {player.name}
                              </div>
                          </button>
                      );
                  })}
              </div>

              <div className="absolute bottom-0 w-full px-6 flex justify-center z-30">
                  {!hasActed ? (
                    <Button 
                      onClick={onConfirm}
                      disabled={(playerSelectLimit > 0 && selectedTargetIds.length !== playerSelectLimit) || (centerSelectLimit > 0 && seerSelectedCenterIndices.length !== centerSelectLimit)}
                      className="shadow-sketch-lg"
                    >
                        {confirmText}
                    </Button>
                  ) : (
                    <div className="flex flex-col items-center animate-pulse">
                        <div className="bg-paper border-sketch px-6 py-2 text-center mb-2">
                            <span className="text-rust font-woodcut text-xl">等待夜色褪去...</span>
                        </div>
                        <span className="text-xs text-inkDim font-mono">Waiting for others...</span>
                    </div>
                  )}
              </div>
          </div>
      );
  };

  // Main render logic (abbreviated)
  if (!isMyTurn) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink overflow-hidden relative p-8">
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-[100] pointer-events-none">
             <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-rust rounded-full animate-ping"></div>
                 <div className="text-rust text-xs font-bold tracking-widest shadow-white text-shadow-sm">
                    {currentPlayer.isHost ? "正在播报... / BROADCASTING" : "夜间行动中 / NIGHT PHASE"}
                 </div>
             </div>
             <div className="flex items-center gap-4 pointer-events-auto">
                 <div className="bg-paper border border-ink/30 px-3 py-1 rounded shadow-sm flex flex-col items-end">
                     <span className="text-[10px] uppercase text-inkDim font-bold">Current</span>
                     <span className="text-sm font-woodcut text-ink">{roleDef?.name.split('/')[0]}</span>
                 </div>
                 <div className="text-xl font-mono text-ink bg-paper/80 px-3 py-1 rounded border border-ink/20 shadow-sm backdrop-blur-sm min-w-[3rem] text-center">
                    {gameState.timer}s
                 </div>
             </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
           <div className="w-[500px] h-[500px] border-2 border-ink rounded-full animate-spin-slow"></div>
        </div>
        <div className="text-center relative z-10 animate-pulse-slow mt-10">
            <h2 className="text-5xl md:text-7xl font-mystical text-ink/80 tracking-widest">NIGHTFALL</h2>
            <p className="text-lg text-ink/60 mt-2 font-serif">夜幕降临，请闭眼</p>
        </div>
        <GameTipsCarousel />
      </div>
    );
  }

  // Active Turn
  return (
    <div className="flex flex-col items-center justify-start h-full pt-4 pb-20 overflow-hidden relative">
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
         <span className="text-xs uppercase font-bold text-rust animate-pulse">Your Turn</span>
         <div className="text-xl font-mono text-ink font-bold border-b-2 border-rust bg-paper/80 px-2">
            {gameState.timer}s
         </div>
      </div>
      
      <div className="text-center animate-glow w-full z-10 mb-2 mt-4">
        <h2 className="text-3xl font-mystical text-ink mb-1 drop-shadow-sm tracking-wide">{roleDef?.name.split('/')[0]}</h2>
        <p className="text-inkLight font-serif italic text-xs opacity-80">{roleDef?.actionDescription}</p>
      </div>

      <div className="w-full flex-1 relative z-10">
        {currentNightRole === RoleType.SEER && (
           <>
             {seerMode === 'CHOICE' && !hasActed && (
               <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in-up">
                  <button onClick={() => { setSeerMode('PLAYER'); setSelectedTargetIds([]); }} className="group sketch-border p-6 w-64 flex items-center justify-center gap-4 hover:bg-white transition-all bg-paper shadow-md">
                     <span className="text-4xl">👤</span>
                     <div className="text-left"><span className="font-bold text-ink block">查看一位玩家</span><span className="text-xs text-inkDim font-serif">View 1 Player</span></div>
                  </button>
                  <button onClick={() => setSeerMode('CENTER')} className="group sketch-border p-6 w-64 flex items-center justify-center gap-4 hover:bg-white transition-all bg-paper shadow-md">
                     <span className="text-4xl">🃏</span>
                     <div className="text-left"><span className="font-bold text-ink block">查看两张底牌</span><span className="text-xs text-inkDim font-serif">View 2 Center Cards</span></div>
                  </button>
               </div>
             )}
             {seerMode === 'PLAYER' && !hasActed && renderRadialUI("选择一位玩家查看身份", 1, 0, handleSeerAction, "揭示真身")}
             {seerMode === 'CENTER' && !hasActed && renderRadialUI("选择两张底牌查看", 0, 2, handleSeerAction, "翻开底牌")}
             {seerMode !== 'CHOICE' && !hasActed && (
                 <div className="absolute bottom-20 w-full text-center">
                    <button onClick={() => setSeerMode('CHOICE')} className="text-ink/50 text-sm underline">Back to Options</button>
                 </div>
             )}
           </>
        )}

        {currentNightRole === RoleType.ROBBER && !hasActed && renderRadialUI("选择一位玩家(非自己)交换身份", 1, 0, handleRobberAction, "实施盗窃")}
        {currentNightRole === RoleType.TROUBLEMAKER && !hasActed && renderRadialUI("选择两位玩家交换他们的牌", 2, 0, handleTroublemakerAction, "制造混乱")}
        {currentNightRole === RoleType.DRUNK && !hasActed && renderRadialUI("选择一张底牌与自己交换", 0, 1, handleDrunkAction, "盲目交换")}

        {currentNightRole === RoleType.WEREWOLF && (
           <div className="w-full h-full flex flex-col items-center justify-center">
              {(() => {
                  const teammates = gameState.players.filter(p => p.initialRole === RoleType.WEREWOLF && p.id !== currentPlayer.id);
                  const isLoneWolf = teammates.length === 0;
                  if (!isLoneWolf) {
                    return (
                       <div className="sketch-border p-8 rounded-xl text-center max-w-sm bg-red-50/50 w-full animate-fade-in-up mx-6">
                          <h3 className="font-mystical text-2xl text-danger mb-2">狼群集结 (Wolf Pack)</h3>
                          <div className="flex flex-wrap justify-center gap-4 my-6">
                            {teammates.map(p => (
                               <div key={p.id} className="flex flex-col items-center">
                                  <div className="w-16 h-16 rounded-full border-2 border-danger bg-paper flex items-center justify-center overflow-hidden shadow-md" style={{ backgroundColor: p.color }}>
                                     <span className="text-2xl text-white font-woodcut">{p.name.charAt(0)}</span>
                                  </div>
                                  <span className="mt-2 font-bold text-danger text-sm">{p.name}</span>
                               </div>
                            ))}
                          </div>
                          {!hasActed ? (<Button onClick={confirmTurn} variant="danger" fullWidth>确认同伴 (Ready)</Button>) : <div className="text-danger font-bold">已确认</div>}
                       </div>
                    );
                  } else {
                    return !hasActed ? renderRadialUI("你是孤狼。你可以查看一张底牌。", 0, 1, handleLoneWolfAction, "窥探底牌") : null;
                  }
              })()}
           </div>
        )}

        {currentNightRole === RoleType.INSOMNIAC && (
           <div className="h-full flex flex-col items-center justify-center">
              {!hasActed ? (<Button onClick={handleInsomniacAction} className="shadow-sketch-lg">检查我的身份</Button>) : null}
           </div>
        )}
        
        {(currentNightRole === RoleType.MASON || currentNightRole === RoleType.MINION) && (
           <div className="h-full flex items-center justify-center px-6">
               <div className="text-center p-8 bg-paperDark rounded-xl border-sketch w-full max-w-sm">
                  <p className="text-2xl text-ink mb-2 font-bold">{currentNightRole === RoleType.MINION ? "效忠狼人 (Minion)" : "守夜人兄弟会 (Mason)"}</p>
                  <div className="my-6 flex justify-center gap-4 flex-wrap">
                      {(() => {
                          let targets: Player[] = [];
                          if (currentNightRole === RoleType.MASON) targets = gameState.players.filter(p => p.initialRole === RoleType.MASON && p.id !== currentPlayer.id);
                          else targets = gameState.players.filter(p => p.initialRole === RoleType.WEREWOLF);
                          if (targets.length === 0) return <div className="text-inkDim italic">无同伴/无目标 (None)</div>;
                          return targets.map(p => (
                             <div key={p.id} className="flex flex-col items-center">
                                  <div className="w-14 h-14 rounded-full border-2 border-ink bg-paper flex items-center justify-center shadow-md mb-2" style={{ backgroundColor: p.color }}>
                                      <span className="text-xl text-white font-woodcut">{p.name.charAt(0)}</span>
                                  </div>
                                  <div className="font-bold text-ink text-sm">{p.name}</div>
                                  {currentNightRole === RoleType.MINION && <div className="text-[10px] text-rust font-bold">WEREWOLF</div>}
                             </div>
                          ));
                      })()}
                  </div>
                  {!hasActed ? (<Button onClick={confirmTurn} fullWidth>确认 (Done)</Button>) : (<div className="text-inkDim mt-4 italic">等待天亮...</div>)}
               </div>
           </div>
        )}
      </div>

      {resultData && (
          <ActionResultOverlay 
            title={resultData.title} 
            cards={resultData.cards} 
            onClose={() => { 
                setResultData(null); 
                confirmTurn(); // CONFIRM TURN HERE, AFTER OVERLAY CLOSE
            }} 
          />
      )}
      
      {hasActed && !resultData && (<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40 bg-paper border-sketch px-8 py-4 shadow-xl animate-fade-in-up"><h3 className="text-2xl font-woodcut text-ink mb-1 text-center">操作完成</h3><p className="text-xs text-inkDim uppercase tracking-widest text-center">等待其他人...</p></div>)}
    </div>
  );
};

export default NightPhase;