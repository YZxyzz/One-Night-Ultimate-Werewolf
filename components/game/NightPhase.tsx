import React, { useEffect, useState, useRef } from 'react';
import { GameState, RoleType, Player } from '../../types';
import { ROLES, NIGHT_SEQUENCE } from '../../constants';
import Button from '../ui/Button';
import PlayingCard from '../ui/PlayingCard';
import { geminiService } from '../../services/geminiService';
import { soundService } from '../../services/soundService';

interface NightPhaseProps {
  gameState: GameState;
  currentPlayer: Player;
  onPhaseComplete: () => void; 
  onGodSpeechComplete: () => void; 
  onAction: (actionType: string, targetIds: (string | number)[]) => void;
}

// --- SUB-COMPONENT: ACTION RESULT OVERLAY ---
// Used to show the result of an action (e.g. Seer seeing a card, Robber seeing new card)
interface ActionResultOverlayProps {
    title: string;
    cards: { role: RoleType, label: string }[];
    onClose: () => void;
}

const ActionResultOverlay: React.FC<ActionResultOverlayProps> = ({ title, cards, onClose }) => {
    const [revealed, setRevealed] = useState(false);

    useEffect(() => {
        // Auto trigger reveal animation
        const timer = setTimeout(() => setRevealed(true), 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
            <h3 className="text-3xl font-woodcut text-paper mb-8 drop-shadow-lg text-center">{title}</h3>
            
            <div className="flex flex-wrap justify-center gap-6 mb-10">
                {cards.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center" style={{ transitionDelay: `${idx * 150}ms` }}>
                        <div className={`transform transition-all duration-700 ${revealed ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
                            <PlayingCard 
                                role={item.role} 
                                isRevealed={revealed} 
                                label={item.label} 
                                size="lg" // Use Large cards for reveal
                            />
                        </div>
                    </div>
                ))}
            </div>

            <Button onClick={onClose} className="animate-bounce" variant="secondary">
                <span className="text-xl">我记住了 (Got it)</span>
            </Button>
        </div>
    );
};


const NightPhase: React.FC<NightPhaseProps> = ({ 
  gameState, 
  currentPlayer, 
  onPhaseComplete,
  onGodSpeechComplete,
  onAction
}) => {
  const currentNightRole = NIGHT_SEQUENCE[gameState.currentNightRoleIndex];
  const roleDef = ROLES[currentNightRole];
  
  // State for interaction
  const [hasActed, setHasActed] = useState(false);
  const [roleTimer, setRoleTimer] = useState(20); 
  const isMyTurn = currentPlayer.initialRole === currentNightRole;
  const hasSpokenRef = useRef(false);

  // State for Seer/Selection logic
  const [seerMode, setSeerMode] = useState<'CHOICE' | 'PLAYER' | 'CENTER'>('CHOICE');
  const [seerSelectedCenterIndices, setSeerSelectedCenterIndices] = useState<number[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  
  // State for Result Reveal (Modal)
  const [resultData, setResultData] = useState<{ title: string, cards: {role: RoleType, label: string}[] } | null>(null);

  // --- AUDIO NARRATION (HOST ONLY) ---
  useEffect(() => {
    hasSpokenRef.current = false;
    
    const playNarration = async () => {
        if (!currentPlayer.isHost || !roleDef) return;
        if (hasSpokenRef.current) return;
        hasSpokenRef.current = true;

        console.log("Generating narration for:", roleDef.name);
        await soundService.init();
        
        const text = roleDef.wakeUpText + "。 " + roleDef.actionDescription;
        const audioBuffer = await geminiService.generateNarration(text);
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

  // --- ACTION HANDLERS ---

  const handleSeerAction = () => {
    if (seerMode === 'PLAYER') {
       if (selectedTargetIds.length !== 1) return;
       const targetId = selectedTargetIds[0];
       const targetPlayer = gameState.players.find(p => p.id === targetId);
       
       if (targetPlayer && targetPlayer.role) {
         setResultData({
             title: `玩家 ${targetPlayer.name} 的身份`,
             cards: [{ role: targetPlayer.role, label: targetPlayer.name }]
         });
         setHasActed(true);
       }
    } else if (seerMode === 'CENTER') {
       if (seerSelectedCenterIndices.length !== 2) return;
       const c1 = gameState.centerCards[seerSelectedCenterIndices[0]];
       const c2 = gameState.centerCards[seerSelectedCenterIndices[1]];
       
       setResultData({
           title: "底牌身份",
           cards: [
               { role: c1, label: `底牌 ${seerSelectedCenterIndices[0] + 1}` },
               { role: c2, label: `底牌 ${seerSelectedCenterIndices[1] + 1}` }
           ]
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
       // Show the card we STOLE (which is now OUR card)
       setResultData({
           title: `你抢到了 ${targetPlayer.name} 的身份`,
           cards: [{ role: targetPlayer.role, label: "你现在的身份" }]
       });
       setHasActed(true);
    }
  };

  const handleTroublemakerAction = () => {
    if (selectedTargetIds.length !== 2) return;
    onAction('TROUBLEMAKER_SWAP', selectedTargetIds);
    setHasActed(true);
    // No reveal for Troublemaker, just success state
  };
  
  const handleDrunkAction = () => {
      if (seerSelectedCenterIndices.length !== 1) return;
      onAction('DRUNK_SWAP', [seerSelectedCenterIndices[0]]);
      setHasActed(true);
      // No reveal for Drunk
  };

  const handleLoneWolfAction = () => {
      if (seerSelectedCenterIndices.length !== 1) return;
      const idx = seerSelectedCenterIndices[0];
      const card = gameState.centerCards[idx];
      
      setResultData({
          title: "底牌信息",
          cards: [{ role: card, label: `底牌 ${idx + 1}` }]
      });
      setHasActed(true);
  };

  const handleInsomniacAction = () => {
      setResultData({
          title: "你现在的身份",
          cards: [{ role: currentPlayer.role!, label: "Current Role" }]
      });
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
                  {/* Center Circle (Table) */}
                  <div className="absolute inset-0 m-auto w-48 h-48 rounded-full border-4 border-ink/20 bg-paperDark flex flex-col items-center justify-center shadow-inner z-0">
                      {/* Center Cards Area */}
                      {centerSelectLimit > 0 && (
                          <div className="flex gap-2 z-10 justify-center">
                              {[0, 1, 2].map(idx => {
                                  const isSelected = seerSelectedCenterIndices.includes(idx);
                                  return (
                                      <div 
                                        key={idx}
                                        onClick={() => {
                                            if (hasActed) return;
                                            if (isSelected) setSeerSelectedCenterIndices(prev => prev.filter(i => i !== idx));
                                            else if (seerSelectedCenterIndices.length < centerSelectLimit) setSeerSelectedCenterIndices(prev => [...prev, idx]);
                                        }}
                                        className={`
                                            relative transition-all cursor-pointer w-10 h-14 rounded
                                            ${isSelected ? 'border-2 border-rust -translate-y-2 shadow-md bg-paper' : 'border-2 border-ink/40 bg-paper hover:bg-white'}
                                        `}
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

                  {/* Player Seats */}
                  {seats.map((seat) => {
                      const player = gameState.players.find(p => p.seatNumber === seat.id);
                      if (!player) return null; 
                      
                      const isMe = player.id === currentPlayer.id;
                      const isSelected = selectedTargetIds.includes(player.id);
                      
                      // Explicitly disable interaction for Self if rule doesn't allow self-select
                      // (Most roles like Robber/Seer/Troublemaker cannot select self)
                      const canSelect = !isMe && playerSelectLimit > 0 && !hasActed;

                      return (
                          <button 
                            key={seat.id}
                            onClick={() => {
                                if (!canSelect) return;
                                if (isSelected) setSelectedTargetIds(prev => prev.filter(id => id !== player.id));
                                else if (selectedTargetIds.length < playerSelectLimit) setSelectedTargetIds(prev => [...prev, player.id]);
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
                              
                              {/* Seat Number Badge */}
                              <div className={`absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border ${isSelected ? 'bg-white text-rust border-white' : 'bg-ink text-white border-ink'}`}>
                                  {seat.id}
                              </div>
                              
                              {/* Name Label */}
                              <div className={`absolute top-full mt-2 text-[8px] uppercase font-bold whitespace-nowrap px-1 bg-paper/90 rounded border border-ink/10 shadow-sm ${isSelected ? 'text-rust' : 'text-ink'}`}>
                                  {player.name}
                              </div>
                          </button>
                      );
                  })}
              </div>

              {/* Confirm Action Button area */}
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
                    <div className="bg-paper border-sketch px-6 py-2 text-center animate-pulse">
                        <span className="text-rust font-woodcut text-xl">行动已完成 / Done</span>
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

        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
           <div className="w-[500px] h-[500px] border-2 border-ink rounded-full animate-spin-slow"></div>
        </div>

        <div className="text-center relative z-10 animate-pulse-slow">
            <h2 className="text-5xl md:text-7xl font-mystical text-ink/80 tracking-widest">NIGHTFALL</h2>
            <p className="text-lg text-ink/60 mt-2 font-serif">夜幕降临，请闭眼</p>
        </div>
        
        <div className="absolute bottom-20 text-center w-full px-6 animate-fade-in-up">
           <div className="p-6 bg-paper border-sketch shadow-sketch-lg max-w-md mx-auto relative">
               <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rust text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm">Current Order</div>
               <h3 className="font-woodcut text-2xl text-ink mb-2">{roleDef?.wakeUpText}</h3>
               <p className="font-serif italic text-inkDim text-sm">{roleDef?.actionDescription}</p>
           </div>
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

      {/* Main Action Area */}
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
             {seerMode === 'PLAYER' && !hasActed && renderRadialUI("选择一位玩家查看身份", 1, 0, handleSeerAction, "揭示真身")}
             {seerMode === 'CENTER' && !hasActed && renderRadialUI("选择两张底牌查看", 0, 2, handleSeerAction, "翻开底牌")}
             
             {/* Back Button for Choice */}
             {seerMode !== 'CHOICE' && !hasActed && (
                 <div className="absolute bottom-20 w-full text-center">
                    <button onClick={() => setSeerMode('CHOICE')} className="text-ink/50 text-sm underline">Back to Options</button>
                 </div>
             )}
           </>
        )}

        {/* ROBBER */}
        {currentNightRole === RoleType.ROBBER && !hasActed && renderRadialUI("选择一位玩家(非自己)交换身份", 1, 0, handleRobberAction, "实施盗窃")}

        {/* TROUBLEMAKER */}
        {currentNightRole === RoleType.TROUBLEMAKER && !hasActed && renderRadialUI("选择两位玩家交换他们的牌", 2, 0, handleTroublemakerAction, "制造混乱")}
        
        {/* DRUNK */}
        {currentNightRole === RoleType.DRUNK && !hasActed && renderRadialUI("选择一张底牌与自己交换", 0, 1, handleDrunkAction, "盲目交换")}

        {/* WEREWOLF */}
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
                                  {/* Visual Avatar for Teammate */}
                                  <div 
                                      className="w-16 h-16 rounded-full border-2 border-danger bg-paper flex items-center justify-center overflow-hidden shadow-md"
                                      style={{ backgroundColor: p.color }}
                                  >
                                     <span className="text-2xl text-white font-woodcut">{p.name.charAt(0)}</span>
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
                    // LONE WOLF UI
                    return !hasActed ? renderRadialUI("你是孤狼。你可以查看一张底牌。", 0, 1, handleLoneWolfAction, "窥探底牌") : null;
                  }
              })()}
           </div>
        )}

        {/* INSOMNIAC */}
        {currentNightRole === RoleType.INSOMNIAC && (
           <div className="h-full flex flex-col items-center justify-center">
              {!hasActed ? (
                 <Button onClick={handleInsomniacAction} className="shadow-sketch-lg">检查我的身份</Button>
              ) : null}
           </div>
        )}
        
        {/* Simple Roles (Mason/Minion) */}
        {(currentNightRole === RoleType.MASON || currentNightRole === RoleType.MINION) && (
           <div className="h-full flex items-center justify-center px-6">
               <div className="text-center p-8 bg-paperDark rounded-xl border-sketch w-full max-w-sm">
                  <p className="text-2xl text-ink mb-2 font-bold">
                    {currentNightRole === RoleType.MINION ? "效忠狼人 (Minion)" : "守夜人兄弟会 (Mason)"}
                  </p>
                  
                  <div className="my-6 flex justify-center gap-4 flex-wrap">
                      {/* Logic to find teammates/wolves */}
                      {(() => {
                          let targets: Player[] = [];
                          if (currentNightRole === RoleType.MASON) {
                              targets = gameState.players.filter(p => p.initialRole === RoleType.MASON && p.id !== currentPlayer.id);
                          } else {
                              targets = gameState.players.filter(p => p.initialRole === RoleType.WEREWOLF);
                          }
                          
                          if (targets.length === 0) {
                              return <div className="text-inkDim italic">无同伴/无目标 (None)</div>;
                          }

                          return targets.map(p => (
                             <div key={p.id} className="flex flex-col items-center">
                                  <div 
                                      className="w-14 h-14 rounded-full border-2 border-ink bg-paper flex items-center justify-center shadow-md mb-2"
                                      style={{ backgroundColor: p.color }}
                                  >
                                      <span className="text-xl text-white font-woodcut">{p.name.charAt(0)}</span>
                                  </div>
                                  <div className="font-bold text-ink text-sm">{p.name}</div>
                                  {currentNightRole === RoleType.MINION && <div className="text-[10px] text-rust font-bold">WEREWOLF</div>}
                             </div>
                          ));
                      })()}
                  </div>

                  {!hasActed ? (
                       <Button onClick={() => setHasActed(true)} fullWidth>确认</Button>
                  ) : (
                     <div className="text-inkDim mt-4 italic">等待天亮...</div>
                  )}
               </div>
           </div>
        )}

      </div>

      {/* RESULT MODAL */}
      {resultData && (
          <ActionResultOverlay 
              title={resultData.title}
              cards={resultData.cards}
              onClose={() => { setResultData(null); }}
          />
      )}

      {/* Success Feedback for Non-Reveal Roles */}
      {hasActed && !resultData && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40 bg-paper border-sketch px-8 py-4 shadow-xl animate-fade-in-up">
              <h3 className="text-2xl font-woodcut text-ink mb-1 text-center">操作完成</h3>
              <p className="text-xs text-inkDim uppercase tracking-widest text-center">Action Completed</p>
          </div>
      )}
      
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