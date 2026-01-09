import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GamePhase, GameState, RoleType, Player, RoleTeam, GameResult } from './types';
import { ROLES, DEFAULT_PLAYER_COUNT, NIGHT_SEQUENCE } from './constants';
import Button from './components/ui/Button';
import NightPhase from './components/game/NightPhase';
import RuleBook from './components/game/RuleBook';
import PlayingCard from './components/ui/PlayingCard'; 
import { soundService } from './services/soundService';

// --- Safe ID Generator (Fixes Vercel Crash) ---
// crypto.randomUUID() causes crashes in non-secure contexts (http) or some environments.
const generateId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// P2P Message Types
type NetworkMessage = 
  | { type: 'HELLO'; player: Player } 
  | { type: 'SYNC_STATE'; state: GameState } 
  | { type: 'ACTION_CLAIM_SEAT'; playerId: string; seatNumber: number }
  | { type: 'ACTION_VOTE'; voterId: string; targetId: string }
  | { type: 'ACTION_PHASE_CHANGE'; phase: GamePhase; speakerId?: string }
  | { type: 'ACTION_GAME_OVER'; result: GameResult }; 

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
  log: []
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

  // P2P Refs
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]); 
  const hostConnRef = useRef<any>(null); 
  
  // CRITICAL: Keep track of my ID in a ref so callbacks can always access the stable ID
  const myIdRef = useRef<string | null>(null);

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

  // --- Dynamic Deck Logic ---
  const projectedDeck = useMemo(() => {
    const count = Math.max(gameState.settings.playerCount, 3); 
    const balanceOrder = [
      RoleType.WEREWOLF, RoleType.WEREWOLF,
      RoleType.SEER, RoleType.ROBBER, RoleType.TROUBLEMAKER, 
      RoleType.VILLAGER, RoleType.TANNER, RoleType.INSOMNIAC,
      RoleType.MASON, RoleType.MASON, RoleType.MINION, RoleType.DRUNK, RoleType.HUNTER
    ];
    return balanceOrder.slice(0, count + 3);
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
    navigator.clipboard.writeText(gameState.roomCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  // --- HOST: Create Room ---
  const createRoom = () => {
    if (!validateName()) return;
    setIsConnecting(true);
    
    // Check if Peer is loaded
    if (!(window as any).Peer) {
        setConnectionError('网络组件未加载，请刷新页面重试。');
        setIsConnecting(false);
        return;
    }

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const peerId = `ns-wolf-${code}`; 
    const pid = generateId();
    myIdRef.current = pid; // Store ID immediately
    
    try {
        const Peer = (window as any).Peer;
        const peer = new Peer(peerId);

        peer.on('open', (id: string) => {
          const newPlayer: Player = { id: pid, name: playerName.trim(), seatNumber: 1, role: null, initialRole: null, isHost: true };
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
          setConnectionError('无法创建房间，代码可能已被占用或网络受限。');
          setIsConnecting(false);
        });

        peer.on('connection', (conn: any) => {
          conn.on('data', (data: NetworkMessage) => {
            handleHostMessage(data, conn);
          });
          conn.on('open', () => {
             connectionsRef.current.push(conn);
          });
          conn.on('close', () => {
             connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          });
        });

        peerRef.current = peer;
    } catch (e) {
        console.error(e);
        setConnectionError('初始化失败');
        setIsConnecting(false);
    }
  };

  // --- HOST: Process Messages ---
  const handleHostMessage = (data: NetworkMessage, conn: any) => {
    setGameState(prev => {
      let newState = { ...prev };
      let shouldBroadcast = false;

      switch (data.type) {
        case 'HELLO':
          const exists = newState.players.find(p => p.id === data.player.id);
          if (!exists) {
            newState.players = [...newState.players, data.player];
          }
          shouldBroadcast = true;
          // IMPORTANT: Send immediate sync to this specific client so they receive the FULL state including their own role if game started
          if (conn && conn.open) {
              conn.send({ type: 'SYNC_STATE', state: newState }); 
          }
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
        
        case 'ACTION_VOTE':
          newState.votes = { ...newState.votes, [data.voterId]: data.targetId };
          shouldBroadcast = true;
          break;
          
        case 'ACTION_PHASE_CHANGE':
           newState.currentPhase = data.phase;
           if (data.speakerId) newState.speakerId = data.speakerId;
           shouldBroadcast = true;
           break;
      }

      if (shouldBroadcast) {
        broadcastState(newState);
      }
      return newState;
    });
  };

  // --- CLIENT: Join Room ---
  const joinRoom = () => {
    if (!validateName()) return;
    if (!roomInput) return;
    
    setIsConnecting(true);
    setConnectionError('');

    if (!(window as any).Peer) {
        setConnectionError('网络组件未加载。');
        setIsConnecting(false);
        return;
    }

    try {
        const Peer = (window as any).Peer;
        const peer = new Peer(); 

        peer.on('open', () => {
           const hostPeerId = `ns-wolf-${roomInput}`;
           const conn = peer.connect(hostPeerId);

           conn.on('open', () => {
             console.log('Connected to Host');
             hostConnRef.current = conn;
             
             const pid = generateId();
             myIdRef.current = pid; 

             const newPlayer: Player = { id: pid, name: playerName.trim(), seatNumber: null, role: null, initialRole: null, isHost: false };
             setLocalPlayer(newPlayer);
             conn.send({ type: 'HELLO', player: newPlayer });
             setIsConnecting(false);
           });

           conn.on('data', (data: NetworkMessage) => {
             if (data.type === 'SYNC_STATE') {
                setGameState(prev => {
                    // SYNC LOGIC: Check if my role is updated in the server state
                    if (myIdRef.current) {
                        const meOnServer = data.state.players.find(p => p.id === myIdRef.current);
                        if (meOnServer) {
                            setLocalPlayer(prevLocal => {
                                // Update local player if server has more info (e.g. Assigned Role)
                                if (!prevLocal 
                                    || prevLocal.role !== meOnServer.role 
                                    || prevLocal.seatNumber !== meOnServer.seatNumber
                                    || prevLocal.initialRole !== meOnServer.initialRole) {
                                    return meOnServer;
                                }
                                return prevLocal;
                            });
                        }
                    }
                    return data.state;
                });
             }
           });

           conn.on('error', (err: any) => {
             setConnectionError('无法连接房间，请检查房间号。');
             setIsConnecting(false);
           });
           
           setTimeout(() => {
               if (!hostConnRef.current?.open) {
                   setConnectionError('连接超时。请确保房主在线。');
                   setIsConnecting(false);
               }
           }, 5000);
        });

        peer.on('error', (err: any) => {
            setConnectionError('连接服务失败 (PeerJS Error)。');
            setIsConnecting(false);
        });

        peerRef.current = peer;
    } catch (e) {
        console.error(e);
        setConnectionError('初始化失败');
        setIsConnecting(false);
    }
  };


  // --- Game Logic Actions ---

  const claimSeat = (seatNum: number) => {
      if (!localPlayer) return;
      if (localPlayer.isHost) {
          handleHostMessage({ type: 'ACTION_CLAIM_SEAT', playerId: localPlayer.id, seatNumber: seatNum }, null);
          setLocalPlayer(prev => prev ? ({...prev, seatNumber: seatNum}) : null);
      } else {
          sendToHost({ type: 'ACTION_CLAIM_SEAT', playerId: localPlayer.id, seatNumber: seatNum });
          setLocalPlayer(prev => prev ? ({...prev, seatNumber: seatNum}) : null);
      }
  };

  const castVote = (targetId: string) => {
    if (!localPlayer) return;
    if (localPlayer.isHost) {
        handleHostMessage({ type: 'ACTION_VOTE', voterId: localPlayer.id, targetId }, null);
    } else {
        sendToHost({ type: 'ACTION_VOTE', voterId: localPlayer.id, targetId });
    }
  };
  
  const hostTriggerPhase = (phase: GamePhase, extra?: any) => {
      if (!localPlayer?.isHost) return;
      // If triggering Results, we need to calculate them first
      if (phase === GamePhase.DAY_RESULTS) {
          processVotingResults();
      } else {
          const msg: NetworkMessage = { type: 'ACTION_PHASE_CHANGE', phase, ...extra };
          handleHostMessage(msg, null); 
      }
  };

  const startGame = async () => {
    if (!localPlayer?.isHost) return;
    
    await soundService.init();
    const shuffled = [...projectedDeck].sort(() => 0.5 - Math.random());
    setGameDeck([...shuffled]);
    
    const sortedPlayers = [...gameState.players].sort((a,b) => (a.seatNumber || 99) - (b.seatNumber || 99));
    const updatedPlayers = sortedPlayers.map((p, idx) => ({ ...p, role: shuffled[idx], initialRole: shuffled[idx] }));
    
    const newState = { 
        ...gameState, 
        players: updatedPlayers, 
        centerCards: shuffled.slice(updatedPlayers.length), 
        currentPhase: GamePhase.ROLE_REVEAL, 
        timer: 5, 
        votes: {},
        gameResult: undefined
    };
    
    setGameState(newState);
    broadcastState(newState);

    const me = updatedPlayers.find(p => p.id === localPlayer.id);
    if (me) setLocalPlayer(me);
  };

  // --- Result Logic ---

  const processVotingResults = () => {
      if (!localPlayer?.isHost) return;

      const votes = gameState.votes;
      const voteCounts: Record<string, number> = {};
      
      // Count votes
      Object.values(votes).forEach(targetId => {
          voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
      });

      // Find Max Votes
      let maxVotes = 0;
      Object.values(voteCounts).forEach(c => {
          if (c > maxVotes) maxVotes = c;
      });

      // Identify Dead Players 
      const deadPlayerIds: string[] = [];
      if (maxVotes > 0) {
          Object.keys(voteCounts).forEach(pid => {
              if (voteCounts[pid] === maxVotes) {
                  deadPlayerIds.push(pid);
              }
          });
      }

      // Determine Winners
      let winners: RoleTeam[] = [];
      let winningReason = '';

      const deadPlayers = gameState.players.filter(p => deadPlayerIds.includes(p.id));
      const hasTannerDied = deadPlayers.some(p => p.role === RoleType.TANNER);
      const hasWerewolfDied = deadPlayers.some(p => p.role === RoleType.WEREWOLF);
      
      // Check if any Wolves exist in game
      const wolfCount = gameState.players.filter(p => p.role === RoleType.WEREWOLF).length;

      if (hasTannerDied) {
          winners = [RoleTeam.TANNER];
          winningReason = "皮匠被处决，皮匠获胜！(The Tanner died)";
      } else if (hasWerewolfDied) {
          winners = [RoleTeam.VILLAGER];
          winningReason = "狼人被处决，好人阵营获胜！(A Werewolf died)";
      } else if (wolfCount === 0 && deadPlayers.length === 0) {
           winners = [RoleTeam.VILLAGER];
           winningReason = "没有狼人且无人死亡，好人获胜！(No Wolves, No Deaths)";
      } else if (wolfCount === 0 && deadPlayers.length > 0) {
           winners = [RoleTeam.WEREWOLF]; // Treat as a loss for Village
           winningReason = "没有狼人但误杀了无辜者，大家输了。(Innocent killed, Village lost)";
      } else {
          winners = [RoleTeam.WEREWOLF];
          winningReason = "狼人潜伏在村庄中幸存，狼人阵营获胜！(Werewolves Survived)";
      }

      const result: GameResult = {
          winners,
          deadPlayerIds,
          winningReason
      };

      const newState = {
          ...gameState,
          currentPhase: GamePhase.DAY_RESULTS,
          gameResult: result
      };

      setGameState(newState);
      broadcastState(newState);
  };


  // --- Timers & Phase Transitions (Host Authority) ---
  
  useEffect(() => {
    if (!localPlayer?.isHost) return;

    let interval: ReturnType<typeof setInterval>;
    
    if (gameState.currentPhase === GamePhase.ROLE_REVEAL) {
      interval = setInterval(() => {
        setGameState(prev => {
          if (prev.timer <= 1) {
             const nextState = { ...prev, currentPhase: GamePhase.NIGHT_INTRO, timer: 0 };
             broadcastState(nextState);
             return nextState;
          }
          const nextState = { ...prev, timer: prev.timer - 1 };
          if (prev.timer % 5 === 0 || prev.timer < 5) broadcastState(nextState); 
          return nextState;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState.currentPhase, localPlayer?.isHost]);

  useEffect(() => {
    if (!localPlayer?.isHost) return;

    if (gameState.currentPhase === GamePhase.NIGHT_INTRO) {
      setTimeout(() => {
         const nextState = { ...gameState, currentPhase: GamePhase.NIGHT_ACTIVE, currentNightRoleIndex: 0 };
         setGameState(nextState);
         broadcastState(nextState);
      }, 3000);
    }
  }, [gameState.currentPhase, localPlayer?.isHost]);


  // Host Action: Advance Night
  const advanceNightPhase = () => {
    if (!localPlayer?.isHost) return;

    setGameState(prev => {
      const nextIndex = prev.currentNightRoleIndex + 1;
      let nextState = { ...prev };
      
      if (nextIndex >= NIGHT_SEQUENCE.length) {
          // Night Over -> Day Discussion
          const randomIdx = Math.floor(Math.random() * prev.players.length);
          const speakerId = prev.players[randomIdx].id;
          nextState = { 
              ...prev, 
              currentPhase: GamePhase.DAY_DISCUSSION, 
              timer: 0,
              speakerId: speakerId
          };
      } else {
          nextState = { ...prev, currentNightRoleIndex: nextIndex };
      }
      
      broadcastState(nextState);
      return nextState;
    });
  };
  
  const handleNightAction = (actionType: string, targetIds: string[]) => {
       // Placeholder for night logic
  };


  // --- Render Components ---

  const renderLobbyBoardConfig = () => {
      const grouped: Record<string, RoleType[]> = {
          [RoleTeam.WEREWOLF]: [],
          [RoleTeam.VILLAGER]: [],
          [RoleTeam.TANNER]: []
      };
      projectedDeck.forEach(r => {
          const def = ROLES[r];
          if (grouped[def.team]) grouped[def.team].push(r);
      });

      return (
          <div className="w-full mt-6 bg-paperDark border-sketch p-6 relative">
             <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-rust opacity-80 border border-ink"></div>
             <div className="absolute -bottom-3 -right-3 w-8 h-8 rounded-full bg-rust opacity-80 border border-ink"></div>
             <div className="text-center mb-6">
                 <h3 className="font-woodcut text-2xl text-ink">本局仪式配置</h3>
                 <p className="text-xs mt-1 font-bold">{gameState.settings.playerCount} 玩家 + 3 底牌</p>
             </div>
             <div className="space-y-4">
                 <div className="flex items-center gap-4">
                     <div className="w-16 font-woodcut text-sm text-right text-rust font-bold uppercase tracking-wider">狼人阵营</div>
                     <div className="flex-1 flex flex-wrap gap-2">
                        {grouped[RoleTeam.WEREWOLF].map((r, i) => (
                            <div key={i} className="px-2 py-1 border border-rust text-rust text-xs font-serif bg-white/50 rounded-sm">{ROLES[r].name.split('/')[0]}</div>
                        ))}
                     </div>
                 </div>
                 <div className="flex items-center gap-4">
                     <div className="w-16 font-woodcut text-sm text-right text-ink font-bold uppercase tracking-wider">村民阵营</div>
                     <div className="flex-1 flex flex-wrap gap-2">
                        {grouped[RoleTeam.VILLAGER].map((r, i) => (
                            <div key={i} className="px-2 py-1 border border-ink text-ink text-xs font-serif bg-white/50 rounded-sm">{ROLES[r].name.split('/')[0]}</div>
                        ))}
                     </div>
                 </div>
                 {grouped[RoleTeam.TANNER].length > 0 && (
                    <div className="flex items-center gap-4">
                        <div className="w-16 font-woodcut text-sm text-right text-inkLight font-bold uppercase tracking-wider">其他</div>
                        <div className="flex-1 flex flex-wrap gap-2">
                            {grouped[RoleTeam.TANNER].map((r, i) => (
                                <div key={i} className="px-2 py-1 border border-dashed border-ink text-inkLight text-xs font-serif bg-white/50 rounded-sm">{ROLES[r].name.split('/')[0]}</div>
                            ))}
                        </div>
                    </div>
                 )}
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
              <div className="absolute inset-0 m-auto w-40 h-40 rounded-full border-4 border-ink bg-paperDark flex items-center justify-center shadow-sketch">
                  <span className="font-woodcut text-2xl text-ink/20 transform -rotate-12">RITUAL</span>
              </div>
              {seats.map((seat) => {
                  const player = gameState.players.find(p => p.seatNumber === seat.id);
                  const isOccupied = !!player;
                  const isMe = player?.id === localPlayer?.id;
                  const canSit = !isOccupied && localPlayer?.seatNumber === null;
                  return (
                      <button 
                        key={seat.id}
                        onClick={() => canSit && claimSeat(seat.id)}
                        disabled={isOccupied && !isMe}
                        className={`absolute w-16 h-16 -ml-8 -mt-8 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-300
                            ${isMe ? 'bg-ink text-paper border-ink scale-110 z-20 shadow-sketch-lg' : ''}
                            ${isOccupied && !isMe ? 'bg-paperDark text-ink border-ink z-10' : ''}
                            ${!isOccupied ? 'bg-paper border-dashed border-ink/40 text-ink/40 hover:border-ink hover:text-ink hover:bg-white cursor-pointer' : ''}
                        `}
                        style={{ left: `calc(50% + ${seat.x}px)`, top: `calc(50% + ${seat.y}px)` }}
                      >
                          {isOccupied ? (
                              <>
                                <span className="font-woodcut text-lg leading-none">{player.name.charAt(0)}</span>
                                <span className="text-[8px] uppercase font-bold max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-1">{player.id === 'host' ? '房主' : (isMe ? '我' : player.name)}</span>
                              </>
                          ) : (
                              <span className="font-woodcut text-sm">{seat.id}号</span>
                          )}
                          {player?.isHost && <div className="absolute -top-1 -right-1 bg-rust text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center border border-paper">H</div>}
                      </button>
                  );
              })}
          </div>
      );
  };

  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 w-full text-ink">
      <div className="text-center mb-6 animate-float">
        <h1 className="text-6xl font-woodcut text-ink mb-1 tracking-tight">Network School</h1>
        <h2 className="text-sm font-antique italic text-inkLight tracking-[0.4em] uppercase">One Night Ritual</h2>
      </div>
      <div className="w-full max-w-lg z-10 p-2">
        {!gameState.roomCode && !isConnecting ? (
          <div className="bg-paper p-8 border-sketch shadow-sketch-lg space-y-8">
            <div className="text-center">
                <label className="block text-xs text-ink font-bold tracking-[0.2em] uppercase mb-2">签署契约 (Sign Name)</label>
                <input 
                    type="text" placeholder="你的名字 / YOUR NAME" 
                    className={`w-full bg-transparent border-b-2 border-ink py-2 text-3xl font-woodcut text-center focus:outline-none focus:border-rust placeholder-ink/20 transition-colors uppercase ${nameError ? 'text-rust border-rust' : ''}`}
                    value={playerName}
                    onChange={e => { setPlayerName(e.target.value); if(e.target.value) setNameError(false); }}
                />
            </div>
            <div className="space-y-6">
                <div className="bg-paperDark p-4 border-sketch-sm">
                    <label className="block text-center text-xs text-ink font-bold tracking-[0.2em] uppercase mb-3">选择仪式人数 (Players)</label>
                    <div className="flex justify-between items-center px-4">
                        <button onClick={() => setTargetPlayerCount(Math.max(3, targetPlayerCount - 1))} className="w-8 h-8 rounded-full border-2 border-ink flex items-center justify-center hover:bg-ink hover:text-paper font-bold">-</button>
                        <span className="font-woodcut text-3xl">{targetPlayerCount}</span>
                        <button onClick={() => setTargetPlayerCount(Math.min(10, targetPlayerCount + 1))} className="w-8 h-8 rounded-full border-2 border-ink flex items-center justify-center hover:bg-ink hover:text-paper font-bold">+</button>
                    </div>
                </div>
                <Button fullWidth onClick={createRoom}><span className="text-xl">创建房间 (Create)</span></Button>
                <div className="flex gap-3 items-center"><div className="h-px bg-ink flex-1 opacity-20"></div><span className="font-woodcut text-ink/40 text-lg">OR</span><div className="h-px bg-ink flex-1 opacity-20"></div></div>
                <div className="flex gap-2">
                    <input type="number" placeholder="房间号" className="w-24 bg-paperDark border-2 border-ink p-2 text-center font-woodcut text-xl focus:outline-none focus:shadow-sketch" value={roomInput} onChange={e => setRoomInput(e.target.value)} />
                    <Button variant="secondary" onClick={joinRoom} className="flex-1"><span className="text-lg">加入房间 (Join)</span></Button>
                </div>
                {connectionError && <p className="text-center text-red-700 text-sm font-bold">{connectionError}</p>}
            </div>
          </div>
        ) : isConnecting ? (
          <div className="text-center p-10 bg-paper border-sketch shadow-sketch">
             <div className="w-12 h-12 border-4 border-ink border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
             <p className="font-woodcut text-xl">正在连接灵魂网络...</p>
             <p className="text-xs text-inkDim">Connecting to Spirit Network...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-paper p-6 border-sketch shadow-sketch text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-ink/5"></div>
                
                {/* Lobby Room Code Display with Copy Button */}
                <div className="flex justify-between items-center border-b-2 border-ink pb-2 mb-4 border-dashed">
                    <div className="text-left">
                        <span className="block text-[10px] uppercase tracking-widest text-inkLight">Room Code</span>
                        <div className="flex items-center gap-2">
                            <span className="font-woodcut text-3xl text-rust">{gameState.roomCode}</span>
                            <button 
                                onClick={copyInvite}
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-ink/40 hover:bg-ink hover:text-paper transition-all rounded-sm ${inviteCopied ? 'bg-ink text-paper' : ''}`}
                            >
                                {inviteCopied ? '已复制 Copied' : '复制邀请 Copy'}
                            </button>
                        </div>
                    </div>
                    <div className="text-right"><span className="block text-[10px] uppercase tracking-widest text-inkLight">Joined</span><span className="font-woodcut text-3xl text-ink">{gameState.players.length}<span className="text-base text-inkLight">/{gameState.settings.playerCount}</span></span></div>
                </div>

                {renderSeatingChart()}
                {!localPlayer?.seatNumber && <p className="text-center text-rust font-bold animate-pulse mt-4">请点击空位入座 / Click a seat to join</p>}
            </div>
            {renderLobbyBoardConfig()}
            {localPlayer?.isHost ? (
                <Button fullWidth onClick={startGame} className="mt-4 shadow-sketch-lg" disabled={gameState.players.length < gameState.settings.playerCount}>
                     <span className="text-2xl">开启今夜 (Begin)</span>
                     {gameState.players.length < gameState.settings.playerCount && <span className="text-xs">等待全员入座...</span>}
                </Button>
              ) : (
                <div className="text-center p-4"><p className="animate-pulse font-woodcut text-xl text-ink">等待房主...</p><p className="text-xs font-serif italic text-inkLight">Waiting for Host to begin ritual...</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  );

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
                           <div className="flex-1 border border-ink/50 relative overflow-hidden bg-white/20">
                                <img src={ROLES[localPlayer.initialRole].imagePlaceholder} className="w-full h-full object-cover woodcut-filter opacity-80" />
                           </div>
                           <div className="mt-2 text-center border-t-2 border-ink pt-1">
                                <div className="text-xl font-woodcut text-ink">{ROLES[localPlayer.initialRole].name.split('/')[0]}</div>
                                <div className="text-[9px] uppercase tracking-widest font-bold">{ROLES[localPlayer.initialRole].name.split('/')[1]}</div>
                           </div>
                        </div>
                    </div>
                )}
                </div>
                <div className="font-serif text-inkLight italic text-sm mb-4">
                    入夜倒计时 <span className="text-rust font-bold text-lg font-woodcut ml-1">{gameState.timer}</span>s
                </div>
            </div>
        </div>
     </div>
  );

  const renderDiscussionPhase = () => (
    <div className="flex flex-col items-center justify-center min-h-full p-6 text-center">
        <h2 className="text-5xl font-woodcut text-ink mb-2">天亮了</h2>
        <p className="font-antique italic text-inkLight text-sm mb-8">Daybreak - Discussion</p>
        
        {/* Speaker Announcement */}
        {gameState.speakerId && (
            <div className="p-8 bg-paperDark border-sketch shadow-sketch animate-float max-w-md w-full mb-10">
                <p className="text-xs uppercase tracking-widest text-rust font-bold mb-2">古老的灵魂指定发言人</p>
                <div className="w-16 h-16 bg-ink text-paper rounded-full flex items-center justify-center font-woodcut text-3xl mx-auto mb-4 border-4 border-paper">
                    {gameState.players.find(p => p.id === gameState.speakerId)?.name.charAt(0)}
                </div>
                <div className="font-woodcut text-3xl text-ink mb-2">
                    {gameState.players.find(p => p.id === gameState.speakerId)?.name || 'Unknown'}
                </div>
                <p className="text-sm text-ink/60 italic font-serif">"请从这位玩家开始，顺时针进行陈述..."</p>
            </div>
        )}

        {localPlayer?.isHost ? (
            <div className="fixed bottom-10 w-full max-w-md px-6">
                <Button fullWidth onClick={() => hostTriggerPhase(GamePhase.DAY_VOTING)}>
                    <span className="text-xl">开始投票 (Start Voting)</span>
                </Button>
            </div>
        ) : (
            <p className="text-inkDim animate-pulse">等待房主开启投票...</p>
        )}
    </div>
  );

  const renderVotingPhase = () => (
    <div className="flex flex-col items-center justify-start min-h-full p-4 pb-20">
        <div className="text-center mb-8 mt-4">
            <h2 className="text-4xl font-woodcut text-rust">审判时刻</h2>
            <p className="font-antique italic text-inkLight text-sm">Point your finger. Choose wisely.</p>
        </div>

        <div className="w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {gameState.players.map(p => {
                const isMe = p.id === localPlayer?.id;
                // Determine if *I* have selected this person
                const isSelectedByMe = gameState.votes[localPlayer?.id || ''] === p.id;
                
                return (
                    <div 
                        key={p.id} 
                        onClick={() => {
                            if (!isMe && !voteConfirmed) castVote(p.id);
                        }}
                        className={`
                            relative flex flex-col items-center p-4 transition-all cursor-pointer bg-paper
                            border-2 ${isSelectedByMe ? 'border-rust shadow-sketch scale-105' : 'border-ink hover:-translate-y-1 hover:shadow-sketch'}
                            ${isMe ? 'opacity-50 cursor-not-allowed border-dashed' : ''}
                            ${voteConfirmed ? 'pointer-events-none grayscale opacity-80' : ''}
                        `}
                        style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
                    >
                        <div className="w-12 h-12 bg-ink text-paper rounded-full mb-2 flex items-center justify-center border-2 border-transparent">
                            <span className="text-xl font-woodcut">{p.name.charAt(0)}</span>
                        </div>
                        <div className="font-woodcut text-base text-ink">{p.name}</div>
                        <div className="absolute top-2 left-2 w-5 h-5 bg-paperDark border border-ink rounded-full flex items-center justify-center text-[10px] font-bold">
                            {p.seatNumber}
                        </div>
                        
                        {isSelectedByMe && (
                            <div className="absolute -top-3 -right-3 bg-rust text-white rounded-full w-8 h-8 flex items-center justify-center font-bold border-2 border-paper shadow-sm z-10 animate-bounce">
                                ⚔
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
        
        <div className="fixed bottom-6 w-full max-w-md px-6 z-20 space-y-4">
            {!voteConfirmed ? (
                <Button fullWidth variant="danger" 
                    disabled={!gameState.votes[localPlayer?.id || '']}
                    onClick={() => setVoteConfirmed(true)}
                >
                     <span className="text-xl">确认投票 (Confirm)</span>
                </Button>
            ) : (
                <div className="text-center p-4 bg-paper border-sketch">
                    <p className="font-woodcut text-rust text-xl">已锁定 (Locked)</p>
                    <p className="text-xs text-inkDim">等待其他人...</p>
                </div>
            )}

            {localPlayer?.isHost && (
                <div className="pt-4 border-t border-ink/20">
                     <p className="text-center text-xs mb-2 text-inkDim">已投票: {Object.keys(gameState.votes).length} / {gameState.players.length}</p>
                     <Button fullWidth variant="primary" onClick={() => hostTriggerPhase(GamePhase.DAY_RESULTS)}>
                        <span className="text-lg">公布结果 (Reveal Results)</span>
                     </Button>
                </div>
            )}
        </div>
    </div>
  );

  const renderResultsPhase = () => {
      const result = gameState.gameResult;
      if (!result) return <div className="p-10">Calculating...</div>;

      const isWinner = result.winners.some(team => {
          // Visual check only
          return true; 
      });

      return (
          <div className="flex flex-col items-center justify-start min-h-full p-4 pb-20 animate-fade-in-up">
              <div className="text-center mb-8 mt-4 p-6 bg-paper border-sketch shadow-sketch-lg">
                  <h2 className="text-2xl font-woodcut text-ink mb-2">结局 (Finale)</h2>
                  <div className="text-4xl font-bold text-rust mb-4 leading-tight">{result.winningReason}</div>
                  <div className="text-sm font-mono text-inkDim uppercase tracking-widest border-t border-ink/20 pt-2">
                      Winning Team: {result.winners.join(', ')}
                  </div>
              </div>
              
              <div className="w-full max-w-5xl grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 mb-12">
                  {gameState.players.map(p => {
                      const isDead = result.deadPlayerIds.includes(p.id);
                      return (
                          <div key={p.id} className="flex flex-col items-center group relative">
                              {isDead && (
                                  <div className="absolute top-10 z-20 text-5xl drop-shadow-lg animate-bounce">💀</div>
                              )}
                              <PlayingCard 
                                  role={p.role} 
                                  isRevealed={true} 
                                  isSelected={isDead}
                                  label={`#${p.seatNumber} ${p.name}`}
                                  size="md"
                                  disabled={isDead}
                              />
                              <div className="mt-2 text-center">
                                  <div className="font-bold text-ink">{p.name}</div>
                                  <div className="text-xs text-inkDim">{isDead ? '已处决 (Executed)' : '幸存 (Survived)'}</div>
                              </div>
                          </div>
                      );
                  })}
              </div>

               <div className="w-full max-w-2xl text-center mb-10">
                   <h3 className="text-xl font-woodcut mb-4 text-inkDim">底牌揭示 (Center Cards)</h3>
                   <div className="flex justify-center gap-4">
                       {gameState.centerCards.map((c, i) => (
                           <PlayingCard key={i} role={c} isRevealed={true} label={`Center ${i+1}`} size="sm" />
                       ))}
                   </div>
               </div>
               
               {localPlayer?.isHost && (
                    <div className="fixed bottom-6 w-full max-w-md px-6 z-20">
                         <Button fullWidth onClick={() => window.location.reload()}>
                            <span className="text-lg">再来一局 (New Ritual)</span>
                         </Button>
                    </div>
               )}
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
          onPhaseComplete={() => {}}
          onGodSpeechComplete={advanceNightPhase}
          onAction={handleNightAction}
        />
      );
    }
    if (gameState.currentPhase === GamePhase.DAY_DISCUSSION) {
        return renderDiscussionPhase();
    }
    if (gameState.currentPhase === GamePhase.DAY_VOTING) {
        return renderVotingPhase();
    }
    if (gameState.currentPhase === GamePhase.DAY_RESULTS) {
        return renderResultsPhase();
    }
    if (gameState.currentPhase === GamePhase.GAME_OVER) {
        return <div className="p-10 text-center text-ink font-woodcut text-4xl mt-20">Game Over</div>;
    }
    // Default safe loading state
    return (
        <div className="flex flex-col items-center justify-center h-full">
            <div className="w-12 h-12 border-4 border-ink border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 font-woodcut text-ink">仪式进行中...</p>
        </div>
    );
  };

  return (
    <div className="min-h-screen text-ink relative overflow-hidden font-serif selection:bg-rust selection:text-white">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50 pointer-events-none">
        <div 
            className="font-woodcut text-ink text-sm tracking-widest pointer-events-auto border-b-2 border-ink pb-1 ml-2 flex items-center gap-2 cursor-pointer hover:text-rust transition-colors"
            onClick={copyInvite}
        >
          {gameState.roomCode && `RITUAL #${gameState.roomCode}`}
           {inviteCopied && <span className="text-rust text-xs font-bold animate-pulse ml-2">COPIED</span>}
        </div>
        
        <div className="flex gap-2 pointer-events-auto mr-2">
           <button onClick={() => setIsRuleBookOpen(true)} className="w-10 h-10 bg-paper border-2 border-ink rounded-full flex items-center justify-center hover:bg-ink hover:text-paper transition-colors shadow-sketch font-serif font-bold text-lg">?</button>
        </div>
      </div>
      <div className="h-screen w-full pt-16 pb-10 overflow-y-auto relative z-10">
        {gameState.currentPhase === GamePhase.LOBBY ? renderLobby() : renderGameContent()}
      </div>
      <RuleBook isOpen={isRuleBookOpen} onClose={() => setIsRuleBookOpen(false)} activeRoleTypes={gameDeck.length > 0 ? gameDeck : projectedDeck} myRole={localPlayer?.initialRole} />
    </div>
  );
};

export default App;