import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GamePhase, GameState, RoleType, Player, RoleTeam, GameResult } from './types';
import { ROLES, DEFAULT_PLAYER_COUNT, NIGHT_SEQUENCE, AVATAR_COLORS } from './constants';
import Button from './components/ui/Button';
import NightPhase from './components/game/NightPhase';
import RuleBook from './components/game/RuleBook';
import PlayingCard from './components/ui/PlayingCard'; 
import { soundService } from './services/soundService';
import { geminiService } from './services/geminiService';

// --- Safe ID Generator ---
const generateId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// --- Color Generator ---
const getRandomColor = () => {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
};

// P2P Message Types defined in types.ts now includes ACTION_NIGHT_ACTION
import { NetworkMessage } from './types';

const getInitialState = (): GameState => ({
  roomCode: '',
  players: [],
  centerCards: [],
  currentPhase: GamePhase.LOBBY,
  currentNightRoleIndex: 0,
  timer: 0,
  votes: {},
  settings: {
    playerCount: DEFAULT_PLAYER_COUNT,
    useDoppelganger: false,
  },
  log: [],
  finishedTurnPlayerIds: []
});

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(getInitialState());
  const [localPlayer, setLocalPlayer] = useState<Player | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [targetPlayerCount, setTargetPlayerCount] = useState(DEFAULT_PLAYER_COUNT);
  const [isRuleBookOpen, setIsRuleBookOpen] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [gameDeck, setGameDeck] = useState<RoleType[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [voteConfirmed, setVoteConfirmed] = useState(false); 
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  
  // Host Audio Mute State
  const [isMuted, setIsMuted] = useState(false);

  // P2P Refs
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]); 
  const hostConnRef = useRef<any>(null); 
  const myIdRef = useRef<string | null>(null);

  // --- DERIVED STATE: ACTIVE NIGHT SEQUENCE ---
  // Calculates which roles are actually present in the game (Initial Roles)
  // This ensures we skip roles like Minion/Mason if they aren't dealt to anyone.
  const activeNightSequence = useMemo(() => {
    // Only calculate this during game phases, otherwise return full list or empty
    if (gameState.currentPhase === GamePhase.LOBBY || gameState.currentPhase === GamePhase.ROLE_REVEAL) {
        return NIGHT_SEQUENCE;
    }

    // Get all initial roles held by players
    const rolesInPlay = new Set(gameState.players.map(p => p.initialRole));
    
    // Filter the master NIGHT_SEQUENCE to only include roles that are currently held by a player
    // We MUST use the master sequence order to preserve game logic
    const sequence = NIGHT_SEQUENCE.filter(role => rolesInPlay.has(role));
    
    return sequence;
  }, [gameState.players, gameState.currentPhase]);


  // --- Auto-fill Room from URL ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        setRoomInput(roomParam);
    }
  }, []);

  // --- GLOBAL NARRATION EFFECT (Host Only) ---
  useEffect(() => {
    if (!localPlayer?.isHost) return;
    
    // Handle Mute State Changes dynamically
    if (isMuted) {
        soundService.stopAmbience();
        return;
    }

    const playGlobalNarration = async () => {
        if (gameState.currentPhase === GamePhase.NIGHT_INTRO) {
            await soundService.init();
            soundService.startAmbience();
            setTimeout(() => {
                 if (!isMuted) geminiService.generateNarration("暗夜降临... 请所有人闭上眼睛。");
            }, 500);
            
        } else if (gameState.currentPhase === GamePhase.DAY_DISCUSSION) {
             if (!isMuted) geminiService.generateNarration("天亮了... 所有人请睁眼！");
        } else if (gameState.currentPhase === GamePhase.LOBBY) {
             soundService.stopAmbience();
        }
    };

    playGlobalNarration();
  }, [gameState.currentPhase, localPlayer?.isHost, isMuted]);


  // --- Utility: Broadcast (Host Only) ---
  const broadcastState = (newState: GameState) => {
    connectionsRef.current.forEach(conn => {
      if (conn.open) {
        conn.send({ type: 'SYNC_STATE', state: newState });
      }
    });
  };

  // --- Utility: Send to Host (Client Only) ---
  const sendToHost = (msg: NetworkMessage) => {
    if (hostConnRef.current && hostConnRef.current.open) {
      hostConnRef.current.send(msg);
    }
  };

  const projectedDeck = useMemo(() => {
    const count = Math.max(gameState.settings.playerCount, 3); 
    const balancedOrder = [
      RoleType.WEREWOLF, RoleType.SEER, RoleType.ROBBER, 
      RoleType.TROUBLEMAKER, RoleType.WEREWOLF, RoleType.TANNER,
      RoleType.DRUNK, RoleType.INSOMNIAC,
      RoleType.MINION, RoleType.MASON, RoleType.MASON, RoleType.HUNTER, RoleType.VILLAGER 
    ];
    return balancedOrder.slice(0, count + 3);
  }, [gameState.settings.playerCount]);

  const validateName = () => {
    if (!playerName.trim()) {
      setNameError(true);
      return false;
    }
    setNameError(false);
    return true;
  };

  const copyInvite = () => {
    if (!gameState.roomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${gameState.roomCode}`;
    navigator.clipboard.writeText(url);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleBack = (e?: React.MouseEvent) => {
      if (e) { e.stopPropagation(); e.preventDefault(); }
      if (isConnecting) {
          setIsConnecting(false);
          setConnectionError('');
          if (peerRef.current) {
              try { peerRef.current.destroy(); } catch(err) { console.error(err); }
              peerRef.current = null;
          }
          return;
      }
      if (gameState.roomCode) setShowExitDialog(true);
  };

  const confirmExit = () => {
      setShowExitDialog(false);
      if (peerRef.current) {
          try { peerRef.current.destroy(); } catch(err) { console.error("Peer destroy error", err); }
          peerRef.current = null;
      }
      connectionsRef.current = [];
      hostConnRef.current = null;
      myIdRef.current = null;
      soundService.stopAmbience();
      setGameState(getInitialState());
      setLocalPlayer(null);
      setGameDeck([]);
      setIsConnecting(false);
      setConnectionError('');
      setVoteConfirmed(false);
      setInviteCopied(false);
      setIsRuleBookOpen(false);
      setIsMuted(false);
      try {
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
      } catch (e) {}
  };

  // --- HOST: Create Room ---
  const createRoom = async () => {
    if (!validateName()) return;
    await soundService.init();
    setIsConnecting(true);
    
    if (!(window as any).Peer) {
        setConnectionError('网络组件未加载 (PeerJS missing)。');
        setIsConnecting(false);
        return;
    }

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const pid = generateId();
    myIdRef.current = pid;
    
    try {
        const Peer = (window as any).Peer;
        const peer = new Peer(`ns-wolf-${code}`);

        peer.on('open', (id: string) => {
          const newPlayer: Player = { 
              id: pid, 
              name: playerName.trim(), 
              color: getRandomColor(), 
              seatNumber: null, 
              role: null, 
              initialRole: null, 
              isHost: true 
          };
          setLocalPlayer(newPlayer);
          setGameState({ 
              ...getInitialState(), 
              roomCode: code, 
              players: [newPlayer],
              settings: { ...getInitialState().settings, playerCount: targetPlayerCount }
          });
          setIsConnecting(false);
        });

        peer.on('error', (err: any) => {
          console.error(err);
          setConnectionError('创建房间失败，请检查网络。');
          setIsConnecting(false);
        });

        peer.on('connection', (conn: any) => {
          // --- CONNECTION HANDLER ---
          conn.on('data', (data: NetworkMessage) => {
            if (data.type === 'HELLO') {
                (conn as any).playerId = data.player.id;
            }
            handleHostMessage(data, conn);
          });

          conn.on('open', () => {
             connectionsRef.current.push(conn);
             conn.send({ type: 'SYNC_STATE', state: gameState });
          });

          // --- AUTO-KICK ON DISCONNECT ---
          conn.on('close', () => {
             console.log("Client disconnected");
             connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
             const pid = (conn as any).playerId;
             if (pid) {
                 setGameState(prev => {
                     const exists = prev.players.find(p => p.id === pid);
                     if (exists) {
                         const nextState = {
                             ...prev,
                             players: prev.players.filter(p => p.id !== pid),
                             votes: Object.fromEntries(Object.entries(prev.votes).filter(([k]) => k !== pid))
                         };
                         broadcastState(nextState);
                         return nextState;
                     }
                     return prev;
                 });
             }
          });
        });

        peerRef.current = peer;
    } catch (e) {
        console.error(e);
        setConnectionError('初始化失败 (Init Failed)');
        setIsConnecting(false);
    }
  };

  const handleHostMessage = (data: NetworkMessage, conn: any) => {
    setGameState(prev => {
      let newState = { ...prev };
      let shouldBroadcast = false;

      switch (data.type) {
        case 'HELLO':
          const exists = newState.players.find(p => p.id === data.player.id);
          if (!exists) {
            const joiningPlayer = { ...data.player, color: data.player.color || getRandomColor() };
            newState.players = [...newState.players, joiningPlayer];
            shouldBroadcast = true;
          }
          if (conn && conn.open) conn.send({ type: 'SYNC_STATE', state: newState }); 
          break;

        case 'ACTION_CLAIM_SEAT':
          const pIdx = newState.players.findIndex(p => p.id === data.playerId);
          if (pIdx > -1) {
            const isTaken = newState.players.some(p => p.seatNumber === data.seatNumber);
            if (!isTaken) {
              newState.players[pIdx].seatNumber = data.seatNumber;
              shouldBroadcast = true;
            }
          }
          break;
        
        case 'ACTION_KICK':
          newState.players = newState.players.filter(p => p.id !== data.targetId);
          shouldBroadcast = true;
          break;

        case 'ACTION_VOTE':
          newState.votes = { ...newState.votes, [data.voterId]: data.targetId };
          shouldBroadcast = true;
          break;
          
        case 'ACTION_PHASE_CHANGE':
           newState.currentPhase = data.phase;
           if (data.speakerId) newState.speakerId = data.speakerId;
           shouldBroadcast = true;
           break;

        case 'ACTION_NIGHT_ACTION':
           const nightActionData = data as Extract<NetworkMessage, { type: 'ACTION_NIGHT_ACTION' }>;
           const { actionType, actorId, targets } = nightActionData;
           let logEntry = '';
           const actor = newState.players.find(p => p.id === actorId);
           const actorName = actor ? actor.name : 'Unknown';

           if (actionType === 'CONFIRM_TURN') {
              if (!newState.finishedTurnPlayerIds.includes(actorId)) {
                  newState.finishedTurnPlayerIds = [...newState.finishedTurnPlayerIds, actorId];
              }
           } else {
               // --- DETAILED LOGGING (GOD VIEW) ---
               // We perform the logic here on the host to ensure the log contains true state
               
               if (actionType === 'ROBBER_SWAP' && targets.length > 0) {
                  const robber = newState.players.find(p => p.id === actorId);
                  const target = newState.players.find(p => p.id === targets[0]);
                  if (robber && target && robber.role && target.role) {
                     const robberRole = robber.role;
                     const targetRole = target.role;
                     robber.role = targetRole;
                     target.role = robberRole;
                     logEntry = `[强盗] ${actorName} 抢夺了 ${target.name} 的身份 (${ROLES[targetRole].name.split('/')[0]})`;
                  }
               } else if (actionType === 'TROUBLEMAKER_SWAP' && targets.length > 1) {
                  const t1 = newState.players.find(p => p.id === targets[0]);
                  const t2 = newState.players.find(p => p.id === targets[1]);
                  if (t1 && t2 && t1.role && t2.role) {
                     const r1 = t1.role;
                     const r2 = t2.role;
                     t1.role = r2;
                     t2.role = r1;
                     const role1Name = ROLES[r1].name.split('/')[0];
                     const role2Name = ROLES[r2].name.split('/')[0];
                     logEntry = `[捣蛋鬼] ${actorName} 交换了 ${t1.name}(${role1Name}) 和 ${t2.name}(${role2Name})`;
                  }
               } else if (actionType === 'DRUNK_SWAP' && targets.length > 0) {
                  const drunk = newState.players.find(p => p.id === actorId);
                  const centerIdx = targets[0] as number;
                  if (drunk && drunk.role && newState.centerCards[centerIdx]) {
                     const drunkRole = drunk.role;
                     const centerRole = newState.centerCards[centerIdx];
                     drunk.role = centerRole;
                     newState.centerCards[centerIdx] = drunkRole;
                     logEntry = `[酒鬼] ${actorName} 盲换了底牌${centerIdx + 1} (换到了: ${ROLES[centerRole].name.split('/')[0]})`;
                  }
               } else if (actionType === 'SEER_VIEW_PLAYER' && targets.length > 0) {
                   const target = newState.players.find(p => p.id === targets[0]);
                   if (target && target.role) {
                       logEntry = `[预言家] ${actorName} 查看了 ${target.name} 的身份 (是: ${ROLES[target.role].name.split('/')[0]})`;
                   }
               } else if (actionType === 'SEER_VIEW_CENTER' && targets.length > 0) {
                   const idx1 = targets[0] as number;
                   const idx2 = targets[1] as number;
                   const c1 = newState.centerCards[idx1];
                   const c2 = newState.centerCards[idx2];
                   if (c1 && c2) {
                       logEntry = `[预言家] ${actorName} 查看了底牌: ${idx1+1}号(${ROLES[c1].name.split('/')[0]}) 和 ${idx2+1}号(${ROLES[c2].name.split('/')[0]})`;
                   }
               } else if (actionType === 'LONE_WOLF_VIEW' && targets.length > 0) {
                   const idx = targets[0] as number;
                   const card = newState.centerCards[idx];
                   if (card) {
                       logEntry = `[孤狼] ${actorName} 查看了底牌 ${idx+1} (${ROLES[card].name.split('/')[0]})`;
                   }
               }

               if (logEntry) newState.log = [...newState.log, logEntry];
               
               // Mark done
               if (!newState.finishedTurnPlayerIds.includes(actorId)) {
                   newState.finishedTurnPlayerIds = [...newState.finishedTurnPlayerIds, actorId];
               }
           }
           
           shouldBroadcast = true;
           break;
        
        case 'ACTION_RESET_GAME':
           newState.currentPhase = GamePhase.LOBBY;
           newState.votes = {};
           newState.centerCards = [];
           newState.log = [];
           newState.gameResult = undefined;
           newState.finishedTurnPlayerIds = [];
           newState.players = newState.players.map(p => ({ ...p, role: null, initialRole: null }));
           setVoteConfirmed(false);
           setGameDeck([]);
           shouldBroadcast = true;
           break;
      }

      if (shouldBroadcast) broadcastState(newState);
      return newState;
    });
  };

  // --- CLIENT: Join Room ---
  const joinRoom = async () => {
    if (!validateName()) return;
    if (!roomInput) return;
    await soundService.init();
    setIsConnecting(true);
    setConnectionError('');
    if (!(window as any).Peer) { setConnectionError('网络组件未加载。'); setIsConnecting(false); return; }

    try {
        const Peer = (window as any).Peer;
        const peer = new Peer(); 
        peer.on('open', () => {
           const conn = peer.connect(`ns-wolf-${roomInput}`);
           conn.on('open', () => {
             hostConnRef.current = conn;
             const pid = generateId();
             myIdRef.current = pid; 
             const newPlayer: Player = { 
                 id: pid, name: playerName.trim(), color: getRandomColor(), seatNumber: null, role: null, initialRole: null, isHost: false 
             };
             setLocalPlayer(newPlayer);
             conn.send({ type: 'HELLO', player: newPlayer });
             setIsConnecting(false);
           });
           conn.on('data', (data: NetworkMessage) => {
             if (data.type === 'SYNC_STATE') {
                setGameState(prev => {
                    const newState = data.state;
                    if (prev.currentPhase !== GamePhase.DAY_VOTING && newState.currentPhase === GamePhase.DAY_VOTING) setVoteConfirmed(false);
                    if (prev.currentPhase !== GamePhase.LOBBY && newState.currentPhase === GamePhase.LOBBY) setVoteConfirmed(false);
                    if (myIdRef.current) {
                        const meOnServer = newState.players.find(p => p.id === myIdRef.current);
                        if (!meOnServer && prev.players.some(p => p.id === myIdRef.current)) {
                             alert("你已被房主移出房间。");
                             window.location.reload(); 
                             return prev;
                        }
                        
                        if (meOnServer) {
                            setLocalPlayer(prevLocal => {
                                if (newState.currentPhase === GamePhase.DAY_RESULTS || newState.currentPhase === GamePhase.GAME_OVER) {
                                     return meOnServer;
                                }
                                if (!prevLocal || prevLocal.role !== meOnServer.role || prevLocal.seatNumber !== meOnServer.seatNumber || prevLocal.initialRole !== meOnServer.initialRole || prevLocal.color !== meOnServer.color) return meOnServer;
                                return prevLocal;
                            });
                        }
                    }
                    return newState;
                });
             }
           });
           conn.on('error', () => { setConnectionError('无法连接房间'); setIsConnecting(false); });
           setTimeout(() => { if (!hostConnRef.current?.open) { setConnectionError('连接超时'); setIsConnecting(false); } }, 5000);
        });
        peer.on('error', () => { setConnectionError('连接服务失败'); setIsConnecting(false); });
        peerRef.current = peer;
    } catch (e) { setConnectionError('初始化失败'); setIsConnecting(false); }
  };

  const claimSeat = (seatNum: number) => {
      if (!localPlayer) return;
      const msg = { type: 'ACTION_CLAIM_SEAT' as const, playerId: localPlayer.id, seatNumber: seatNum };
      if (localPlayer.isHost) { handleHostMessage(msg, null); setLocalPlayer(prev => prev ? ({...prev, seatNumber: seatNum}) : null); }
      else { sendToHost(msg); setLocalPlayer(prev => prev ? ({...prev, seatNumber: seatNum}) : null); }
  };

  const kickPlayer = (targetId: string) => {
      if (!localPlayer?.isHost) return;
      handleHostMessage({ type: 'ACTION_KICK', targetId }, null);
  };

  const castVote = (targetId: string) => {
    if (!localPlayer) return;
    const msg = { type: 'ACTION_VOTE' as const, voterId: localPlayer.id, targetId };
    if (localPlayer.isHost) handleHostMessage(msg, null);
    else sendToHost(msg);
  };
  
  const hostTriggerPhase = (phase: GamePhase, extra?: any) => {
      if (!localPlayer?.isHost) return;
      if (phase === GamePhase.DAY_RESULTS) { processVotingResults(); }
      else {
          handleHostMessage({ type: 'ACTION_PHASE_CHANGE', phase, ...extra }, null); 
          if (phase === GamePhase.DAY_VOTING) setVoteConfirmed(false);
      }
  };

  const handleNightAction = (actionType: string, targets: (string | number)[]) => {
      if (!localPlayer) return;
      const msg: NetworkMessage = { type: 'ACTION_NIGHT_ACTION', actionType, actorId: localPlayer.id, targets };
      if (localPlayer.isHost) handleHostMessage(msg, null);
      else sendToHost(msg);
  };

  const handleResetGame = () => {
     if (!localPlayer?.isHost) return;
     setGameState(prev => {
         const activeIds = [localPlayer.id];
         connectionsRef.current.forEach((c: any) => {
             if (c.open && c.playerId) activeIds.push(c.playerId);
         });
         const validPlayers = prev.players.filter(p => activeIds.includes(p.id));
         if (validPlayers.length !== prev.players.length) {
             console.log("Removing ghost players before restart...");
         }
         return { ...prev, players: validPlayers };
     });
     handleHostMessage({ type: 'ACTION_RESET_GAME' }, null);
  };

  const startGame = async () => {
    if (!localPlayer?.isHost) return;
    const validPlayers = gameState.players.filter(p => p.seatNumber !== null);
    const shuffled = [...projectedDeck].sort(() => 0.5 - Math.random());
    setGameDeck([...shuffled]);
    const sortedPlayers = [...validPlayers].sort((a,b) => (a.seatNumber!) - (b.seatNumber!));
    const updatedPlayers = sortedPlayers.map((p, idx) => ({ ...p, role: shuffled[idx], initialRole: shuffled[idx] }));
    const centerCards = shuffled.slice(updatedPlayers.length);
    const newState = { 
        ...gameState, players: updatedPlayers, centerCards, currentPhase: GamePhase.ROLE_REVEAL, timer: 5, votes: {}, gameResult: undefined, log: [], finishedTurnPlayerIds: []
    };
    setGameState(newState);
    broadcastState(newState);
    const me = updatedPlayers.find(p => p.id === localPlayer.id);
    if (me) setLocalPlayer(me);
  };

  const processVotingResults = () => {
      if (!localPlayer?.isHost) return;
      
      const votes = gameState.votes;
      const logEntries: string[] = [];

      // --- LOGGING VOTES (Time Rewind) ---
      Object.entries(votes).forEach(([voterId, targetId]) => {
          const voter = gameState.players.find(p => p.id === voterId);
          const target = gameState.players.find(p => p.id === targetId);
          if (voter && target) {
              const voterRoleName = ROLES[voter.role!].name.split('/')[0];
              logEntries.push(`[投票] ${voter.name}(${voterRoleName}) 投给了 ${target.name}`);
          }
      });
      
      // Calculate Winners logic...
      const voteCounts: Record<string, number> = {};
      Object.values(votes).forEach(tid => { voteCounts[tid as string] = (voteCounts[tid as string] || 0) + 1; });
      let maxVotes = 0;
      Object.values(voteCounts).forEach(c => { if (c > maxVotes) maxVotes = c; });
      const deadPlayerIds: string[] = [];
      if (maxVotes > 0) Object.keys(voteCounts).forEach(pid => { if (voteCounts[pid] === maxVotes) deadPlayerIds.push(pid); });
      
      const initialDead = [...deadPlayerIds];
      initialDead.forEach(deadId => {
          const p = gameState.players.find(pl => pl.id === deadId);
          if (p && p.role === RoleType.HUNTER) {
              const hunterTarget = gameState.votes[deadId as string];
              if (hunterTarget && !deadPlayerIds.includes(hunterTarget)) deadPlayerIds.push(hunterTarget);
          }
      });

      let winners: RoleTeam[] = [];
      let winningReason = '';
      const deadPlayers = gameState.players.filter(p => deadPlayerIds.includes(p.id));
      const hasTannerDied = deadPlayers.some(p => p.role === RoleType.TANNER);
      const hasWerewolfDied = deadPlayers.some(p => p.role === RoleType.WEREWOLF);
      const wolfCount = gameState.players.filter(p => p.role === RoleType.WEREWOLF).length;

      if (hasTannerDied) { winners = [RoleTeam.TANNER]; winningReason = "皮匠被处决，皮匠获胜！(The Tanner died)"; }
      else if (hasWerewolfDied) { winners = [RoleTeam.VILLAGER]; winningReason = "狼人被处决，好人阵营获胜！(A Werewolf died)"; }
      else if (wolfCount === 0 && deadPlayers.length === 0) { winners = [RoleTeam.VILLAGER]; winningReason = "没有狼人且无人死亡，好人获胜！(No Wolves, No Deaths)"; }
      else if (wolfCount === 0 && deadPlayers.length > 0) { winners = [RoleTeam.WEREWOLF]; winningReason = "没有狼人但误杀了无辜者，大家输了。(Innocent killed, Village lost)"; }
      else { winners = [RoleTeam.WEREWOLF]; winningReason = "狼人潜伏在村庄中幸存，狼人阵营获胜！(Werewolves Survived)"; }

      const result: GameResult = { winners, deadPlayerIds, winningReason };
      const newState = { 
          ...gameState, 
          currentPhase: GamePhase.DAY_RESULTS, 
          gameResult: result,
          log: [...gameState.log, ...logEntries] // Append vote logs
      };
      setGameState(newState);
      broadcastState(newState);
  };

  useEffect(() => {
    if (!localPlayer?.isHost) return;
    let interval: ReturnType<typeof setInterval>;
    if (gameState.currentPhase === GamePhase.ROLE_REVEAL) {
      interval = setInterval(() => {
        setGameState(prev => {
          if (prev.timer <= 1) { const nextState = { ...prev, currentPhase: GamePhase.NIGHT_INTRO, timer: 0 }; broadcastState(nextState); return nextState; }
          const nextState = { ...prev, timer: prev.timer - 1 }; if (prev.timer % 5 === 0 || prev.timer < 5) broadcastState(nextState); return nextState;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState.currentPhase, localPlayer?.isHost]);

  useEffect(() => {
    if (!localPlayer?.isHost) return;
    if (gameState.currentPhase === GamePhase.NIGHT_INTRO) {
      setTimeout(() => {
         // Determine first role dynamically
         const sequence = activeNightSequence;
         if (sequence.length > 0) {
             const firstRole = sequence[0];
             const initialTime = (firstRole === RoleType.WEREWOLF || firstRole === RoleType.SEER) ? 15 : 10;
             const nextState = { ...gameState, currentPhase: GamePhase.NIGHT_ACTIVE, currentNightRoleIndex: 0, timer: initialTime, finishedTurnPlayerIds: [] };
             setGameState(nextState);
             broadcastState(nextState);
         } else {
             // Edge case: No night roles
             const randomIdx = Math.floor(Math.random() * gameState.players.length);
             const nextState = { ...gameState, currentPhase: GamePhase.DAY_DISCUSSION, timer: 0, speakerId: gameState.players[randomIdx].id };
             setGameState(nextState);
             broadcastState(nextState);
         }
      }, 3000);
    }
  }, [gameState.currentPhase, localPlayer?.isHost]); 

  useEffect(() => {
    if (!localPlayer?.isHost) return;
    if (gameState.currentPhase !== GamePhase.NIGHT_ACTIVE) return;

    const checkAutoAdvance = () => {
         // Use Derived Active Sequence
         const sequence = activeNightSequence;
         const currentRole = sequence[gameState.currentNightRoleIndex];
         
         const actors = gameState.players.filter(p => p.initialRole === currentRole);
         if (actors.length > 0) {
             const allDone = actors.every(p => gameState.finishedTurnPlayerIds.includes(p.id));
             if (allDone) { advanceNightPhase(); return true; }
         }
         return false;
    };
    
    const advanced = checkAutoAdvance();
    if (advanced) return; 

    const interval = setInterval(() => {
        setGameState(prev => {
            if (prev.timer <= 1) { advanceNightPhase(); return prev; }
            const nextState = { ...prev, timer: prev.timer - 1 };
            broadcastState(nextState);
            return nextState;
        });
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.currentPhase, gameState.currentNightRoleIndex, gameState.finishedTurnPlayerIds, localPlayer?.isHost]); 

  useEffect(() => {
      if (!localPlayer?.isHost) return;
      if (gameState.currentPhase === GamePhase.DAY_VOTING) {
          if (Object.keys(gameState.votes).length > 0 && Object.keys(gameState.votes).length === gameState.players.length) processVotingResults();
      }
  }, [gameState.votes, gameState.currentPhase, localPlayer?.isHost]);

  const advanceNightPhase = () => {
    setGameState(prev => {
      const nextIndex = prev.currentNightRoleIndex + 1;
      let nextState = { ...prev };
      
      // Re-calculate sequence inside setter to be safe, or use the stable Night Sequence Logic
      const rolesInPlay = new Set(prev.players.map(p => p.initialRole));
      const dynamicSeq = NIGHT_SEQUENCE.filter(role => rolesInPlay.has(role));
      
      if (nextIndex >= dynamicSeq.length) {
          const randomIdx = Math.floor(Math.random() * prev.players.length);
          nextState = { ...prev, currentPhase: GamePhase.DAY_DISCUSSION, timer: 0, speakerId: prev.players[randomIdx].id, finishedTurnPlayerIds: [] };
      } else {
          const nextRole = dynamicSeq[nextIndex];
          const nextTime = (nextRole === RoleType.WEREWOLF || nextRole === RoleType.SEER) ? 15 : 10;
          nextState = { ...prev, currentNightRoleIndex: nextIndex, timer: nextTime, finishedTurnPlayerIds: [] };
      }
      broadcastState(nextState);
      return nextState;
    });
  };

  // --- RENDER HELPERS ---
  const renderLobbyBoardConfig = () => {
      const grouped: Record<string, RoleType[]> = { [RoleTeam.WEREWOLF]: [], [RoleTeam.VILLAGER]: [], [RoleTeam.TANNER]: [] };
      projectedDeck.forEach(r => { const def = ROLES[r]; if (grouped[def.team]) grouped[def.team].push(r); });
      return (
          <div className="w-full mt-6 bg-paperDark border-sketch p-6 relative">
             <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-rust opacity-80 border border-ink"></div>
             <div className="absolute -bottom-3 -right-3 w-8 h-8 rounded-full bg-rust opacity-80 border border-ink"></div>
             <div className="text-center mb-6"><h3 className="font-woodcut text-2xl text-ink">本局仪式配置</h3><p className="text-xs mt-1 font-bold">{gameState.settings.playerCount} 玩家 + 3 底牌</p></div>
             <div className="space-y-4">
                 <div className="flex items-center gap-4"><div className="w-16 font-woodcut text-sm text-right text-rust font-bold uppercase tracking-wider">狼人阵营</div><div className="flex-1 flex flex-wrap gap-2">{grouped[RoleTeam.WEREWOLF].map((r, i) => (<div key={i} className="px-2 py-1 border border-rust text-rust text-xs font-serif bg-white/50 rounded-sm">{ROLES[r].name.split('/')[0]}</div>))}</div></div>
                 <div className="flex items-center gap-4"><div className="w-16 font-woodcut text-sm text-right text-ink font-bold uppercase tracking-wider">村民阵营</div><div className="flex-1 flex flex-wrap gap-2">{grouped[RoleTeam.VILLAGER].map((r, i) => (<div key={i} className="px-2 py-1 border border-ink text-ink text-xs font-serif bg-white/50 rounded-sm">{ROLES[r].name.split('/')[0]}</div>))}</div></div>
                 {grouped[RoleTeam.TANNER].length > 0 && (<div className="flex items-center gap-4"><div className="w-16 font-woodcut text-sm text-right text-inkLight font-bold uppercase tracking-wider">其他</div><div className="flex-1 flex flex-wrap gap-2">{grouped[RoleTeam.TANNER].map((r, i) => (<div key={i} className="px-2 py-1 border border-dashed border-ink text-inkLight text-xs font-serif bg-white/50 rounded-sm">{ROLES[r].name.split('/')[0]}</div>))}</div></div>)}
             </div>
          </div>
      );
  };

  const renderSeatingChart = () => {
      const totalSeats = gameState.settings.playerCount;
      const seats = Array.from({ length: totalSeats }, (_, i) => {
          const angle = (i * (360 / totalSeats)) - 90;
          const radius = 100; 
          const x = Math.cos((angle * Math.PI) / 180) * radius;
          const y = Math.sin((angle * Math.PI) / 180) * radius;
          return { id: i + 1, x, y };
      });
      return (
          <div className="relative w-72 h-72 mx-auto my-8">
              <div className="absolute inset-0 m-auto w-40 h-40 rounded-full border-4 border-ink bg-paperDark flex items-center justify-center shadow-sketch"><span className="font-woodcut text-2xl text-ink/20 transform -rotate-12">RITUAL</span></div>
              {seats.map((seat) => {
                  const player = gameState.players.find(p => p.seatNumber === seat.id);
                  const isOccupied = !!player;
                  const isMe = player?.id === localPlayer?.id;
                  const canSit = !isOccupied;
                  return (
                      <div key={seat.id} className="absolute flex flex-col items-center" style={{ left: `calc(50% + ${seat.x}px)`, top: `calc(50% + ${seat.y}px)` }}>
                      <button onClick={() => canSit && claimSeat(seat.id)} disabled={isOccupied && !isMe}
                        className={`w-16 h-16 -ml-8 -mt-8 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-300 relative ${isMe ? 'border-ink scale-110 z-20 shadow-sketch-lg' : ''} ${isOccupied && !isMe ? 'border-ink z-10' : ''} ${!isOccupied ? 'bg-paper border-dashed border-ink/40 text-ink/40 hover:border-ink hover:text-ink hover:bg-white cursor-pointer' : ''}`}
                        style={{ backgroundColor: isOccupied ? (player.color || '#e8e0d2') : undefined, color: isOccupied ? '#f5f0e6' : undefined }}>
                          {isOccupied ? ( <> <div className="absolute -top-1 -right-1 w-5 h-5 bg-paperDark border border-ink rounded-full flex items-center justify-center text-[10px] font-bold z-30 text-ink shadow-sm cursor-default">{seat.id}</div> <span className="font-woodcut text-2xl leading-none drop-shadow-md">{player.name.charAt(0)}</span> <div className="absolute -bottom-8 w-28 text-center flex flex-col items-center z-40 pointer-events-none"> <span className="text-[10px] uppercase font-bold bg-paper border border-ink text-ink px-2 py-0.5 rounded shadow-sm break-words leading-tight block max-w-full"> {isMe ? `${player.name} (Me)` : player.name} </span> {player.isHost && (<span className="text-[8px] bg-rust text-white px-1.5 py-px rounded-full mt-0.5 shadow-sm font-bold tracking-wider border border-white animate-pulse-slow">房主 HOST</span>)} </div> </>) : (<span className="font-woodcut text-sm">{seat.id}号</span>)}
                      </button>
                      {localPlayer?.isHost && isOccupied && !isMe && (<button onClick={() => kickPlayer(player.id)} className="absolute -top-8 -right-8 w-6 h-6 bg-red-800 text-white rounded-full flex items-center justify-center border border-white shadow-md z-50 text-xs font-bold hover:scale-110 transition-transform" title="Kick Player">✕</button>)}
                      </div>
                  );
              })}
          </div>
      );
  };

  const renderLobby = () => {
    const seatedCount = gameState.players.filter(p => p.seatNumber !== null).length;
    const totalSeats = gameState.settings.playerCount;
    const canStart = seatedCount === totalSeats;

    return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 w-full text-ink">
      <div className="text-center mb-6 animate-float"><h1 className="text-6xl font-woodcut text-ink mb-1 tracking-tight">Network School</h1><h2 className="text-sm font-antique italic text-inkLight tracking-[0.4em] uppercase">One Night Ritual</h2></div>
      <div className="w-12 h-1 bg-rust mx-auto mb-6"></div>
      <div className="w-full max-w-lg z-10 p-2">
        {!gameState.roomCode && !isConnecting ? (
          <div className="bg-paper p-8 border-sketch shadow-sketch-lg space-y-8">
            <div className="text-center"><label className="block text-xs text-ink font-bold tracking-[0.2em] uppercase mb-2">签署契约 (Sign Name)</label><input type="text" placeholder="你的名字 / YOUR NAME" className={`w-full bg-transparent border-b-2 border-ink py-2 text-3xl font-woodcut text-center focus:outline-none focus:border-rust placeholder-ink/20 transition-colors uppercase ${nameError ? 'text-rust border-rust' : ''}`} value={playerName} onChange={e => { setPlayerName(e.target.value); if(e.target.value) setNameError(false); }} /></div>
            <div className="space-y-6"><div className="bg-paperDark p-4 border-sketch-sm"><label className="block text-center text-xs text-ink font-bold tracking-[0.2em] uppercase mb-3">选择仪式人数 (Players)</label><div className="flex justify-between items-center px-4"><button onClick={() => setTargetPlayerCount(Math.max(3, targetPlayerCount - 1))} className="w-8 h-8 rounded-full border-2 border-ink flex items-center justify-center hover:bg-ink hover:text-paper font-bold">-</button><span className="font-woodcut text-3xl">{targetPlayerCount}</span><button onClick={() => setTargetPlayerCount(Math.min(10, targetPlayerCount + 1))} className="w-8 h-8 rounded-full border-2 border-ink flex items-center justify-center hover:bg-ink hover:text-paper font-bold">+</button></div></div><Button fullWidth onClick={createRoom}><span className="text-xl">创建房间 (Create)</span></Button><div className="flex gap-3 items-center"><div className="h-px bg-ink flex-1 opacity-20"></div><span className="font-woodcut text-ink/40 text-lg">OR</span><div className="h-px bg-ink flex-1 opacity-20"></div></div><div className="flex gap-2"><input type="number" placeholder="房间号" className="w-24 bg-paperDark border-2 border-ink p-2 text-center font-woodcut text-xl focus:outline-none focus:shadow-sketch" value={roomInput} onChange={e => setRoomInput(e.target.value)} /><Button variant="secondary" onClick={joinRoom} className="flex-1"><span className="text-lg">加入房间 (Join)</span></Button></div>{connectionError && <p className="text-center text-red-700 text-sm font-bold">{connectionError}</p>}</div>
          </div>
        ) : isConnecting ? (
          <div className="text-center p-10 bg-paper border-sketch shadow-sketch"><div className="w-12 h-12 border-4 border-ink border-t-transparent rounded-full animate-spin mx-auto mb-4"></div><p className="font-woodcut text-xl">正在连接灵魂网络...</p><p className="text-xs text-inkDim">Connecting to Spirit Network...</p></div>
        ) : (
          <div className="space-y-6">
            <div className="bg-paper p-6 border-sketch shadow-sketch text-center relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-2 bg-ink/5"></div><div className="flex justify-between items-center border-b-2 border-ink pb-2 mb-4 border-dashed"><div className="text-left"><span className="block text-[10px] uppercase tracking-widest text-inkLight">Room Code</span><div className="flex items-center gap-2"><span className="font-woodcut text-3xl text-rust">{gameState.roomCode}</span><button onClick={copyInvite} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-ink/40 hover:bg-ink hover:text-paper transition-all rounded-sm ${inviteCopied ? 'bg-ink text-paper' : ''}`}>{inviteCopied ? '已复制 Copied' : '复制邀请 Copy'}</button></div></div><div className="text-right"><span className="block text-[10px] uppercase tracking-widest text-inkLight">Joined</span><span className="font-woodcut text-3xl text-ink">{gameState.players.length}<span className="text-base text-inkLight">/{gameState.settings.playerCount}</span></span></div></div>{renderSeatingChart()}{!localPlayer?.seatNumber && <p className="text-center text-rust font-bold animate-pulse mt-4">请点击空位入座 / Click a seat to join</p>}</div>{renderLobbyBoardConfig()}{localPlayer?.isHost ? (<Button fullWidth onClick={startGame} className="mt-4 shadow-sketch-lg" disabled={!canStart}><span className="text-2xl">开启今夜 (Begin)</span>{!canStart && (<span className="text-xs">等待全员入座... ({seatedCount}/{totalSeats})</span>)}</Button>) : (<div className="text-center p-4"><p className="animate-pulse font-woodcut text-xl text-ink">等待房主...</p><p className="text-xs font-serif italic text-inkLight">Waiting for Host to begin ritual...</p></div>)}
          </div>
        )}
      </div>
    </div>
    );
  };

  const renderRoleReveal = () => (
     <div className="flex flex-col items-center justify-center h-full p-4">
        <div className="bg-paper p-1 border-sketch shadow-sketch-lg max-w-sm w-full mx-auto relative mt-10">
            <div className="border border-ink p-6 text-center bg-paper relative overflow-hidden">
                <h2 className="text-4xl font-woodcut text-ink mb-1">你的命运</h2>
                <div className="w-12 h-1 bg-rust mx-auto mb-6"></div>
                <div className="perspective-1000 mb-8">
                {localPlayer?.initialRole && (
                    <div className="w-48 h-72 mx-auto relative transform-style-3d animate-float">
                        <div className="absolute inset-0 bg-paper border-4 border-ink shadow-lg flex flex-col p-2">
                           <div className="flex-1 border border-ink/50 relative overflow-hidden bg-white/20"><img src={ROLES[localPlayer.initialRole].imagePlaceholder} className="w-full h-full object-cover woodcut-filter opacity-80" /></div>
                           <div className="mt-2 text-center border-t-2 border-ink pt-1"><div className="text-xl font-woodcut text-ink">{ROLES[localPlayer.initialRole].name.split('/')[0]}</div><div className="text-[9px] uppercase tracking-widest font-bold">{ROLES[localPlayer.initialRole].name.split('/')[1]}</div></div>
                        </div>
                    </div>
                )}
                </div>
                <div className="font-serif text-inkLight italic text-sm mb-4">入夜倒计时 <span className="text-rust font-bold text-lg font-woodcut ml-1">{gameState.timer}</span>s</div>
            </div>
        </div>
     </div>
  );

  const renderDiscussionPhase = () => (
    <div className="flex flex-col items-center justify-center min-h-full p-6 text-center">
        <h2 className="text-5xl font-woodcut text-ink mb-2">天亮了</h2>
        <p className="font-antique italic text-inkLight text-sm mb-8">Daybreak - Discussion</p>
        {gameState.speakerId && (
            <div className="p-8 bg-paperDark border-sketch shadow-sketch animate-float max-w-md w-full mb-10">
                <p className="text-xs uppercase tracking-widest text-rust font-bold mb-2">古老的灵魂指定发言人</p>
                <div className="w-16 h-16 bg-ink text-paper rounded-full flex items-center justify-center font-woodcut text-3xl mx-auto mb-4 border-4 border-paper" style={{ backgroundColor: gameState.players.find(p => p.id === gameState.speakerId)?.color, color: '#fff' }}>{gameState.players.find(p => p.id === gameState.speakerId)?.name.charAt(0)}</div>
                <div className="font-woodcut text-3xl text-ink mb-2">{gameState.players.find(p => p.id === gameState.speakerId)?.name || 'Unknown'}</div>
                <p className="text-sm text-ink/60 italic font-serif leading-relaxed">请从这位玩家开始，<br/><strong className="text-rust">顺时针</strong> 进行 <strong className="text-rust">三轮</strong> 陈述。<br/><span className="text-xs opacity-70">(Three rounds of clockwise discussion)</span></p>
            </div>
        )}
        {localPlayer?.isHost ? (<div className="fixed bottom-10 w-full max-w-md px-6"><Button fullWidth onClick={() => hostTriggerPhase(GamePhase.DAY_VOTING)}><span className="text-xl">开始投票 (Start Voting)</span></Button></div>) : (<p className="text-inkDim animate-pulse">等待房主开启投票...</p>)}
    </div>
  );

  const renderVotingPhase = () => {
    const myVoteTargetId = gameState.votes[localPlayer?.id || ''];
    const myVoteTarget = gameState.players.find(p => p.id === myVoteTargetId);
    return (
      <div className="flex flex-col items-center justify-start min-h-full p-4 pb-20 relative">
        <div className="w-full bg-paperDark border-y border-ink/20 py-2 px-4 mb-4 flex justify-between items-center shadow-sm"><span className="text-xs font-bold uppercase tracking-widest text-inkDim">当前操作账号 (Current Identity)</span><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold" style={{backgroundColor: localPlayer?.color}}>{localPlayer?.name.charAt(0)}</div><span className="font-woodcut text-lg text-ink">{localPlayer?.name}</span></div></div>
        <div className="text-center mb-8"><h2 className="text-4xl font-woodcut text-rust">审判时刻</h2><p className="font-antique italic text-inkLight text-sm">Point your finger. Choose wisely.</p></div>
        <div className="w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {gameState.players.map(p => {
                const isMe = p.id === localPlayer?.id;
                const isSelectedByMe = gameState.votes[localPlayer?.id || ''] === p.id;
                return (
                    <div key={p.id} onClick={() => { if (!isMe && !voteConfirmed) castVote(p.id); }} className={`relative flex flex-col items-center p-4 transition-all cursor-pointer bg-paper border-2 ${isSelectedByMe ? 'border-rust shadow-sketch scale-105' : 'border-ink hover:-translate-y-1 hover:shadow-sketch'} ${isMe ? 'opacity-100 border-dashed bg-ink/5' : ''} ${voteConfirmed && !isSelectedByMe ? 'opacity-50 grayscale' : ''}`} style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}>
                        <div className="w-12 h-12 bg-ink text-paper rounded-full mb-2 flex items-center justify-center border-2 border-transparent shadow-md" style={{ backgroundColor: p.color, color: '#fff' }}><span className="text-xl font-woodcut">{p.name.charAt(0)}</span></div>
                        <div className="font-woodcut text-base text-ink">{p.name}</div>
                        <div className="absolute top-2 left-2 w-5 h-5 bg-paperDark border border-ink rounded-full flex items-center justify-center text-[10px] font-bold">{p.seatNumber}</div>
                        {isMe && (<div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-ink text-white px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-widest z-20">我 (ME)</div>)}
                        {isSelectedByMe && (<div className="absolute -top-3 -right-3 bg-rust text-white rounded-full w-8 h-8 flex items-center justify-center font-bold border-2 border-paper shadow-sm z-10 animate-bounce">⚔</div>)}
                    </div>
                )
            })}
        </div>
        <div className="fixed bottom-6 w-full max-w-md px-6 z-20 space-y-4">
            {!voteConfirmed ? (<div className="space-y-2"><div className="text-center"><span className="text-xs text-inkDim uppercase tracking-widest mr-2">准备投给 (Targeting):</span><span className="font-woodcut text-xl text-rust">{myVoteTarget ? myVoteTarget.name : "..."}</span></div><Button fullWidth variant="danger" disabled={!myVoteTarget} onClick={() => setVoteConfirmed(true)}><span className="text-xl">确认投票 (Confirm)</span></Button></div>) : (<div className="text-center p-4 bg-paper border-sketch"><p className="font-woodcut text-rust text-xl">已锁定 (Locked)</p><p className="text-sm text-ink mb-1">你投给了: <strong>{myVoteTarget?.name}</strong></p><p className="text-xs text-inkDim">{Object.keys(gameState.votes).length} / {gameState.players.length} 已投票...</p></div>)}
            {localPlayer?.isHost && Object.keys(gameState.votes).length !== gameState.players.length && (<div className="pt-4 border-t border-ink/20 text-center"><p className="text-xs mb-2 text-inkDim">等待全员投票自动结算...</p></div>)}
        </div>
      </div>
    );
  };

  const renderResultsPhase = () => {
      const result = gameState.gameResult;
      if (!result) return <div className="p-10">Calculating...</div>;
      return (
          <div className="flex flex-col items-center justify-start min-h-full p-4 pb-20 animate-fade-in-up">
              <div className="text-center mb-8 mt-4 p-6 bg-paper border-sketch shadow-sketch-lg w-full max-w-2xl"><h2 className="text-2xl font-woodcut text-ink mb-2">结局 (Finale)</h2><div className="text-3xl md:text-4xl font-bold text-rust mb-4 leading-tight">{result.winningReason}</div><div className="text-sm font-mono text-inkDim uppercase tracking-widest border-t border-ink/20 pt-2">Winning Team: {result.winners.join(', ')}</div></div>
              <div className="w-full max-w-2xl space-y-4 mb-10">
                  <h3 className="text-xl font-woodcut text-center mb-4 text-inkDim border-b border-ink/10 pb-2">身份揭示 (Identity Reveal)</h3>
                  {gameState.players.map(p => {
                      const isDead = result.deadPlayerIds.includes(p.id);
                      // Use p.role (final role) from gameState which comes from Host, ensuring sync
                      const isWinner = result.winners.includes(ROLES[p.role!].team);
                      const roleChanged = p.initialRole !== p.role;
                      return (
                          <div key={p.id} className="flex items-center justify-between bg-paper border-sketch p-3 relative overflow-hidden group">
                              <div className="flex items-center gap-3 w-1/3"><div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm flex-none" style={{ backgroundColor: p.color }}>{p.name.charAt(0)}</div><div className="flex flex-col overflow-hidden"><span className="font-woodcut text-ink text-base truncate">{p.name}</span><span className="text-[10px] text-inkDim uppercase tracking-wider font-bold">Seat {p.seatNumber}</span></div></div>
                              <div className="flex items-center justify-center gap-2 flex-1"><div className="flex flex-col items-center opacity-70 scale-90"><span className="text-[10px] uppercase font-bold text-inkDim mb-0.5">Start</span><div className="px-2 py-1 bg-ink/5 border border-ink/20 rounded text-xs font-serif font-bold whitespace-nowrap">{ROLES[p.initialRole!].name.split('/')[0]}</div></div><div className="text-rust font-bold text-lg px-1">→</div><div className="flex flex-col items-center"><span className="text-[10px] uppercase font-bold text-inkDim mb-0.5">Final</span><div className={`px-2 py-1 border rounded text-xs font-serif font-bold whitespace-nowrap shadow-sm ${roleChanged ? 'bg-white border-rust text-rust' : 'bg-ink text-white border-ink'}`}>{ROLES[p.role!].name.split('/')[0]}</div></div></div>
                              <div className="w-1/4 flex flex-col items-end justify-center pl-2">{isDead && (<span className="text-[10px] font-bold bg-black text-white px-2 py-0.5 rounded-full mb-1 animate-pulse">💀 DIED</span>)}<span className={`text-xs font-bold border px-2 py-0.5 rounded ${isWinner ? 'border-green-800 text-green-900 bg-green-100' : 'border-red-800 text-red-900 bg-red-100'}`}>{isWinner ? "WIN" : "LOSE"}</span></div>
                          </div>
                      );
                  })}
              </div>
               <div className="w-full max-w-2xl text-center mb-10 bg-paperDark border-sketch p-4"><h3 className="text-sm font-woodcut mb-4 text-inkDim uppercase tracking-widest">Center Cards</h3><div className="flex justify-center gap-4">{gameState.centerCards.map((c, i) => (<PlayingCard key={i} role={c} isRevealed={true} label={`Center ${i+1}`} size="sm" />))}</div></div>
               <div className="w-full max-w-4xl p-6 mb-20 space-y-4"><h3 className="text-xl font-woodcut text-center text-inkDim uppercase tracking-widest border-b border-ink/10 pb-2">时间回溯 (Time Rewind)</h3><div className="bg-paper p-4 rounded border-2 border-dashed border-ink/20 space-y-2 text-sm font-mono h-64 overflow-y-auto custom-scrollbar">{gameState.log.length > 0 ? (gameState.log.map((entry, i) => (<div key={i} className="border-b border-dashed border-ink/10 pb-1 last:border-0 flex gap-2 text-left"><span className="opacity-40 select-none flex-none w-8">[{String(i+1).padStart(2, '0')}]</span><span>{entry}</span></div>))) : (<div className="text-center italic opacity-50 py-4">平静的夜晚，没有行动发生...</div>)}</div></div>
               {localPlayer?.isHost && (<div className="fixed bottom-6 w-full max-w-md px-6 z-20"><Button fullWidth onClick={handleResetGame}><span className="text-lg">再来一局 (New Ritual)</span></Button></div>)}
          </div>
      );
  };

  const renderGameContent = () => {
    if (gameState.currentPhase === GamePhase.ROLE_REVEAL) return renderRoleReveal();
    if (gameState.currentPhase === GamePhase.NIGHT_ACTIVE && localPlayer) {
      return (
        <NightPhase 
          gameState={gameState} 
          currentPlayer={localPlayer}
          activeNightSequence={activeNightSequence} 
          onPhaseComplete={() => {}} 
          onGodSpeechComplete={() => {}} 
          onAction={handleNightAction}
        />
      );
    }
    if (gameState.currentPhase === GamePhase.DAY_DISCUSSION) return renderDiscussionPhase();
    if (gameState.currentPhase === GamePhase.DAY_VOTING) return renderVotingPhase();
    if (gameState.currentPhase === GamePhase.DAY_RESULTS) return renderResultsPhase();
    if (gameState.currentPhase === GamePhase.GAME_OVER) return <div className="p-10 text-center text-ink font-woodcut text-4xl mt-20">Game Over</div>;
    return <div className="flex flex-col items-center justify-center h-full"><div className="w-12 h-12 border-4 border-ink border-t-transparent rounded-full animate-spin"></div><p className="mt-4 font-woodcut text-ink">仪式进行中...</p></div>;
  };

  return (
    <div className="min-h-screen text-ink relative overflow-hidden font-serif selection:bg-rust selection:text-white">
      <div className="fixed top-0 left-0 w-full h-16 z-[9000] pointer-events-none flex justify-between items-center px-4">
          <div className="pointer-events-auto">{(gameState.roomCode || isConnecting) && (<button type="button" onClick={handleBack} className="w-12 h-12 bg-paper border-2 border-ink rounded-full flex items-center justify-center hover:bg-rust hover:text-white hover:border-rust transition-all shadow-sketch font-serif font-bold text-2xl group cursor-pointer active:scale-90 active:bg-rust active:text-white" title={isConnecting ? "取消连接 / Cancel" : "退出房间 / Exit Room"}><span className="group-hover:-translate-x-0.5 transition-transform pb-1">←</span></button>)}</div>
          <div className="flex gap-2 pointer-events-auto">
             {/* Host Mute Button */}
             {localPlayer?.isHost && (
                 <button onClick={() => setIsMuted(!isMuted)} className="w-12 h-12 bg-paper border-2 border-ink rounded-full flex items-center justify-center hover:bg-ink hover:text-paper transition-colors shadow-sketch font-serif font-bold text-xl cursor-pointer">
                    {isMuted ? '🔇' : '🔊'}
                 </button>
             )}

             <button onClick={() => setIsRuleBookOpen(true)} className="w-12 h-12 bg-paper border-2 border-ink rounded-full flex items-center justify-center hover:bg-ink hover:text-paper transition-colors shadow-sketch font-serif font-bold text-xl cursor-pointer">?</button>
          </div>
      </div>
      
      {showExitDialog && (<div className="fixed inset-0 z-[11000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"><div className="bg-paper p-6 border-sketch shadow-sketch-lg max-w-sm w-full text-center relative"><h3 className="font-woodcut text-2xl text-ink mb-2">离开房间?</h3><div className="w-12 h-1 bg-rust mx-auto mb-4"></div><p className="font-serif text-inkDim mb-8 text-sm leading-relaxed">这也将结束当前的连接。<br/><span className="text-xs opacity-70">Disconnect and return to the main hall?</span></p><div className="grid grid-cols-2 gap-4"><Button variant="secondary" onClick={() => setShowExitDialog(false)}><span className="text-base">取消 (Stay)</span></Button><Button variant="danger" onClick={confirmExit}><span className="text-base">离开 (Exit)</span></Button></div></div></div>)}

      <div className="h-screen w-full pt-16 pb-10 overflow-y-auto relative z-10">
        {gameState.currentPhase === GamePhase.LOBBY ? renderLobby() : renderGameContent()}
      </div>
      
      <RuleBook isOpen={isRuleBookOpen} onClose={() => setIsRuleBookOpen(false)} activeRoleTypes={gameDeck.length > 0 ? gameDeck : projectedDeck} myRole={localPlayer?.initialRole} />
    </div>
  );
};

export default App;