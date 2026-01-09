import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GamePhase, GameState, RoleType, Player, RoleTeam } from './types';
import { ROLES, DEFAULT_PLAYER_COUNT, NIGHT_SEQUENCE } from './constants';
import Button from './components/ui/Button';
import NightPhase from './components/game/NightPhase';
import RuleBook from './components/game/RuleBook';
import PlayingCard from './components/ui/PlayingCard'; 
import { soundService } from './services/soundService';

// P2P Message Types
type NetworkMessage = 
  | { type: 'HELLO'; player: Player } // Client -> Host: I am joining
  | { type: 'SYNC_STATE'; state: GameState } // Host -> Client: Here is the truth
  | { type: 'ACTION_CLAIM_SEAT'; playerId: string; seatNumber: number }
  | { type: 'ACTION_VOTE'; voterId: string; targetId: string }
  | { type: 'ACTION_NIGHT'; actionType: string; targetIds: string[]; playerId: string }
  | { type: 'ADMIN_START_GAME'; };

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

  // P2P Refs
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]); // For Host: list of client connections
  const hostConnRef = useRef<any>(null); // For Client: connection to host

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

  // --- HOST: Create Room ---
  const createRoom = () => {
    if (!validateName()) return;
    setIsConnecting(true);
    
    // Generate simple 4-digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const peerId = `ns-wolf-${code}`; // Namespace to avoid collisions on public server
    
    const Peer = (window as any).Peer;
    const peer = new Peer(peerId);

    peer.on('open', (id: string) => {
      console.log('Host Peer Open:', id);
      const newPlayer: Player = { id: crypto.randomUUID(), name: playerName.trim(), seatNumber: 1, role: null, initialRole: null, isHost: true };
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
      setConnectionError('无法创建房间，代码可能已被占用，请重试。');
      setIsConnecting(false);
    });

    // HOST: Handle incoming connections
    peer.on('connection', (conn: any) => {
      conn.on('data', (data: NetworkMessage) => {
        handleHostMessage(data, conn);
      });
      conn.on('open', () => {
         // Connection opened, wait for HELLO
         connectionsRef.current.push(conn);
      });
      conn.on('close', () => {
         connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
      });
    });

    peerRef.current = peer;
  };

  // --- HOST: Process Messages ---
  const handleHostMessage = (data: NetworkMessage, conn: any) => {
    setGameState(prev => {
      let newState = { ...prev };
      let shouldBroadcast = false;

      switch (data.type) {
        case 'HELLO':
          // Check if player already exists (reconnect)
          const exists = newState.players.find(p => p.id === data.player.id);
          if (!exists) {
            newState.players = [...newState.players, data.player];
          }
          shouldBroadcast = true;
          // Send immediate sync to this specific client
          conn.send({ type: 'SYNC_STATE', state: newState }); 
          break;

        case 'ACTION_CLAIM_SEAT':
          const pIdx = newState.players.findIndex(p => p.id === data.playerId);
          if (pIdx > -1) {
            // Check if seat is taken
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

        // Note: Night actions usually just update server state privately, 
        // but for this P2P model we sync everything but UI hides secrets based on local identity
        // In a real cheat-proof app, we wouldn't broadcast full state.
        case 'ACTION_NIGHT': 
           // For simplicity in this demo, night actions don't change shared state visibly 
           // except transitioning phases. 
           // Complex logic would go here.
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

    const Peer = (window as any).Peer;
    const peer = new Peer(); // Random ID for client

    peer.on('open', () => {
       const hostPeerId = `ns-wolf-${roomInput}`;
       const conn = peer.connect(hostPeerId);

       conn.on('open', () => {
         console.log('Connected to Host');
         hostConnRef.current = conn;
         
         // Send Hello
         const newPlayer: Player = { id: crypto.randomUUID(), name: playerName.trim(), seatNumber: null, role: null, initialRole: null, isHost: false };
         setLocalPlayer(newPlayer);
         conn.send({ type: 'HELLO', player: newPlayer });
         setIsConnecting(false);
       });

       conn.on('data', (data: NetworkMessage) => {
         if (data.type === 'SYNC_STATE') {
            setGameState(data.state);
            // Also sync deck for visuals if game started
            if (data.state.players[0]?.role) {
                // If roles are assigned, we need to infer the deck or pass it. 
                // For simplicity, we just rely on state.players having roles.
            }
         }
       });

       conn.on('error', (err: any) => {
         console.error('Conn Error', err);
         setConnectionError('无法连接房间，请检查房间号。');
         setIsConnecting(false);
       });
       
       // Fallback timeout
       setTimeout(() => {
           if (!hostConnRef.current?.open) {
               setConnectionError('连接超时。请确保房主在线。');
               setIsConnecting(false);
           }
       }, 5000);
    });

    peer.on('error', (err: any) => {
        setConnectionError('连接服务失败。');
        setIsConnecting(false);
    });

    peerRef.current = peer;
  };


  // --- Game Logic Actions (Wrappers) ---

  const claimSeat = (seatNum: number) => {
      if (!localPlayer) return;
      if (localPlayer.isHost) {
          // Host updates directly
          handleHostMessage({ type: 'ACTION_CLAIM_SEAT', playerId: localPlayer.id, seatNumber: seatNum }, null);
          // Update local ref immediately for responsiveness
          setLocalPlayer(prev => prev ? ({...prev, seatNumber: seatNum}) : null);
      } else {
          // Client sends request
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

  const startGame = async () => {
    if (!localPlayer?.isHost) return;
    
    // Logic: Only Host runs this
    await soundService.init();
    const shuffled = [...projectedDeck].sort(() => 0.5 - Math.random());
    setGameDeck([...shuffled]);
    
    // Assign roles based on current players in state
    const sortedPlayers = [...gameState.players].sort((a,b) => (a.seatNumber || 99) - (b.seatNumber || 99));
    const updatedPlayers = sortedPlayers.map((p, idx) => ({ ...p, role: shuffled[idx], initialRole: shuffled[idx] }));
    
    const newState = { 
        ...gameState, 
        players: updatedPlayers, 
        centerCards: shuffled.slice(updatedPlayers.length), 
        currentPhase: GamePhase.ROLE_REVEAL, 
        timer: 10, 
        votes: {} 
    };
    
    setGameState(newState);
    broadcastState(newState);

    // Update my local player reference to match the assigned role
    const me = updatedPlayers.find(p => p.id === localPlayer.id);
    if (me) setLocalPlayer(me);
  };


  // --- Timers & Phase Transitions (Host Authority) ---
  
  useEffect(() => {
    // Only Host manages the timer and phase transitions
    if (!localPlayer?.isHost) return;

    let interval: ReturnType<typeof setInterval>;
    
    if (gameState.currentPhase === GamePhase.ROLE_REVEAL) {
      interval = setInterval(() => {
        setGameState(prev => {
          if (prev.timer <= 1) {
             const nextState = { ...prev, currentPhase: GamePhase.NIGHT_INTRO, timer: 0 };
             broadcastState(nextState); // Sync Phase Change
             return nextState;
          }
          const nextState = { ...prev, timer: prev.timer - 1 };
          // Optional: Don't broadcast every second to save bandwidth, 
          // but for <10 players it's fine.
          if (prev.timer % 5 === 0) broadcastState(nextState); 
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
          // Night Over -> Day
          const randomIdx = Math.floor(Math.random() * prev.players.length);
          const speakerId = prev.players[randomIdx].id;
          nextState = { 
              ...prev, 
              currentPhase: GamePhase.DAY_DISCUSSION, 
              timer: 300,
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
       // Night actions are tricky in P2P without a dedicated server to keep secrets.
       // For this prototype, we handle logic locally in NightPhase and just confirm "I acted"
       // Real state updates are minimal or local-only for info gathering.
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
                 <p className="font-serif italic text-inkLight text-sm">Ritual Configuration</p>
                 <div className="h-px w-24 bg-ink mx-auto mt-2 opacity-50"></div>
                 <p className="text-xs mt-1 font-bold">
                    {gameState.settings.playerCount} 玩家 + 3 底牌
                 </p>
             </div>

             <div className="space-y-4">
                 <div className="flex items-center gap-4">
                     <div className="w-16 font-woodcut text-sm text-right text-rust font-bold uppercase tracking-wider">狼人阵营</div>
                     <div className="flex-1 flex flex-wrap gap-2">
                        {grouped[RoleTeam.WEREWOLF].map((r, i) => (
                            <div key={i} className="px-2 py-1 border border-rust text-rust text-xs font-serif bg-white/50 rounded-sm">
                                {ROLES[r].name.split('/')[0]}
                            </div>
                        ))}
                     </div>
                 </div>
                 <div className="flex items-center gap-4">
                     <div className="w-16 font-woodcut text-sm text-right text-ink font-bold uppercase tracking-wider">村民阵营</div>
                     <div className="flex-1 flex flex-wrap gap-2">
                        {grouped[RoleTeam.VILLAGER].map((r, i) => (
                            <div key={i} className="px-2 py-1 border border-ink text-ink text-xs font-serif bg-white/50 rounded-sm">
                                {ROLES[r].name.split('/')[0]}
                            </div>
                        ))}
                     </div>
                 </div>
                 {grouped[RoleTeam.TANNER].length > 0 && (
                    <div className="flex items-center gap-4">
                        <div className="w-16 font-woodcut text-sm text-right text-inkLight font-bold uppercase tracking-wider">其他</div>
                        <div className="flex-1 flex flex-wrap gap-2">
                            {grouped[RoleTeam.TANNER].map((r, i) => (
                                <div key={i} className="px-2 py-1 border border-dashed border-ink text-inkLight text-xs font-serif bg-white/50 rounded-sm">
                                    {ROLES[r].name.split('/')[0]}
                                </div>
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
                                <span className="text-[8px] uppercase font-bold max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-1">
                                    {player.id === 'host' ? '房主' : (isMe ? '我' : player.name)}
                                </span>
                              </>
                          ) : (
                              <span className="font-woodcut text-sm">{seat.id}号</span>
                          )}
                          {player?.isHost && (
                              <div className="absolute -top-1 -right-1 bg-rust text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center border border-paper">H</div>
                          )}
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
                    type="text" 
                    placeholder="你的名字 / YOUR NAME" 
                    className={`w-full bg-transparent border-b-2 border-ink py-2 text-3xl font-woodcut text-center focus:outline-none focus:border-rust placeholder-ink/20 transition-colors uppercase ${nameError ? 'text-rust border-rust' : ''}`}
                    value={playerName}
                    onChange={e => { setPlayerName(e.target.value); if(e.target.value) setNameError(false); }}
                />
            </div>
            
            <div className="space-y-6">
                <div className="bg-paperDark p-4 border-sketch-sm">
                    <label className="block text-center text-xs text-ink font-bold tracking-[0.2em] uppercase mb-3">
                        选择仪式人数 (Players)
                    </label>
                    <div className="flex justify-between items-center px-4">
                        <button 
                            onClick={() => setTargetPlayerCount(Math.max(3, targetPlayerCount - 1))}
                            className="w-8 h-8 rounded-full border-2 border-ink flex items-center justify-center hover:bg-ink hover:text-paper font-bold"
                        >-</button>
                        <span className="font-woodcut text-3xl">{targetPlayerCount}</span>
                        <button 
                            onClick={() => setTargetPlayerCount(Math.min(10, targetPlayerCount + 1))}
                            className="w-8 h-8 rounded-full border-2 border-ink flex items-center justify-center hover:bg-ink hover:text-paper font-bold"
                        >+</button>
                    </div>
                </div>

                <Button fullWidth onClick={createRoom}>
                    <span className="text-xl">创建房间 (Create)</span>
                </Button>
                
                <div className="flex gap-3 items-center">
                    <div className="h-px bg-ink flex-1 opacity-20"></div>
                    <span className="font-woodcut text-ink/40 text-lg">OR</span>
                    <div className="h-px bg-ink flex-1 opacity-20"></div>
                </div>
                
                <div className="flex gap-2">
                    <input 
                        type="number" 
                        placeholder="房间号"
                        className="w-24 bg-paperDark border-2 border-ink p-2 text-center font-woodcut text-xl focus:outline-none focus:shadow-sketch"
                        value={roomInput}
                        onChange={e => setRoomInput(e.target.value)}
                    />
                    <Button variant="secondary" onClick={joinRoom} className="flex-1">
                        <span className="text-lg">加入房间 (Join)</span>
                    </Button>
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
                <div className="flex justify-between items-center border-b-2 border-ink pb-2 mb-4 border-dashed">
                    <div className="text-left">
                        <span className="block text-[10px] uppercase tracking-widest text-inkLight">Room Code</span>
                        <span className="font-woodcut text-3xl text-rust">{gameState.roomCode}</span>
                    </div>
                    <div className="text-right">
                        <span className="block text-[10px] uppercase tracking-widest text-inkLight">Joined</span>
                        <span className="font-woodcut text-3xl text-ink">{gameState.players.length}<span className="text-base text-inkLight">/{gameState.settings.playerCount}</span></span>
                    </div>
                </div>
                {renderSeatingChart()}
                {!localPlayer?.seatNumber && (
                    <p className="text-center text-rust font-bold animate-pulse">请点击空位入座 / Click a seat to join</p>
                )}
            </div>

            {renderLobbyBoardConfig()}

            {localPlayer?.isHost ? (
                <Button fullWidth onClick={startGame} className="mt-4 shadow-sketch-lg" disabled={gameState.players.length < gameState.settings.playerCount}>
                     <span className="text-2xl">开启今夜 (Begin)</span>
                     {gameState.players.length < gameState.settings.playerCount && <span className="text-xs">等待全员入座...</span>}
                </Button>
              ) : (
                <div className="text-center p-4">
                    <p className="animate-pulse font-woodcut text-xl text-ink">等待房主...</p>
                    <p className="text-xs font-serif italic text-inkLight">Waiting for Host to begin ritual...</p>
                </div>
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

  const renderDayPhase = () => (
    <div className="flex flex-col items-center justify-start min-h-full p-4 pb-20">
        <div className="text-center mb-8 mt-4">
            <h2 className="text-5xl font-woodcut text-ink">天亮了</h2>
            <p className="font-antique italic text-inkLight text-sm">Daybreak - Discussion</p>
            
            {/* Random Speaker Announcement */}
            {gameState.speakerId && (
                <div className="mt-4 p-4 bg-paperDark border-sketch animate-float max-w-xs mx-auto">
                    <p className="text-xs uppercase tracking-widest text-inkLight mb-1">被选中的发言人 / First Speaker</p>
                    <div className="font-woodcut text-2xl text-rust">
                        {gameState.players.find(p => p.id === gameState.speakerId)?.name || 'Unknown'}
                    </div>
                    <p className="text-[10px] text-ink/60 italic">古老的灵魂指定此人率先打破沉默。</p>
                </div>
            )}
        </div>

        <div className="w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {gameState.players.map(p => {
                const isMe = p.id === localPlayer?.id;
                const isSelected = gameState.votes[localPlayer?.id || ''] === p.id;
                
                return (
                    <div 
                        key={p.id} 
                        onClick={() => !isMe && castVote(p.id)}
                        className={`
                            relative flex flex-col items-center p-4 transition-all cursor-pointer bg-paper
                            border-2 ${isSelected ? 'border-rust shadow-sketch' : 'border-ink hover:-translate-y-1 hover:shadow-sketch'}
                            ${isMe ? 'opacity-50 cursor-not-allowed border-dashed' : ''}
                        `}
                        style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
                    >
                        <div className="w-12 h-12 bg-ink text-paper rounded-full mb-2 flex items-center justify-center border-2 border-transparent">
                            <span className="text-xl font-woodcut">{p.name.charAt(0)}</span>
                        </div>
                        <div className="font-woodcut text-base text-ink">{p.name}</div>
                        {/* Seat Badge */}
                        <div className="absolute top-2 left-2 w-5 h-5 bg-paperDark border border-ink rounded-full flex items-center justify-center text-[10px] font-bold">
                            {p.seatNumber}
                        </div>
                        
                        {isSelected && (
                            <div className="absolute -top-2 -right-2 bg-rust text-white rounded-full w-8 h-8 flex items-center justify-center font-bold border-2 border-paper shadow-sm z-10">
                                ⚔
                            </div>
                        )}
                    </div>
                )
            })}
        </div>

        <div className="flex gap-4 justify-center mb-8">
             {[1,2,3].map(i => (
                 <div key={i} className="w-16 h-24 bg-ink border-2 border-paper flex items-center justify-center shadow-sketch-lg">
                     <span className="text-paper/20 font-woodcut text-xl">?</span>
                 </div>
             ))}
        </div>

        <div className="fixed bottom-6 w-full max-w-md px-6 z-20">
            <Button fullWidth variant="danger" disabled={!gameState.votes[localPlayer?.id || '']}>
                 <span className="text-xl">确认投票 (Vote)</span>
            </Button>
        </div>
    </div>
  );

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
    if (gameState.currentPhase === GamePhase.DAY_DISCUSSION || gameState.currentPhase === GamePhase.DAY_VOTING) {
        return renderDayPhase();
    }
    return <div className="p-10 text-center text-ink font-woodcut text-4xl mt-20">Game Over</div>;
  };

  return (
    <div className="min-h-screen text-ink relative overflow-hidden font-serif selection:bg-rust selection:text-white">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50 pointer-events-none">
        <div className="font-woodcut text-ink text-sm tracking-widest pointer-events-auto border-b-2 border-ink pb-1 ml-2">
          {gameState.roomCode && `RITUAL #${gameState.roomCode}`}
        </div>
        <button 
          onClick={() => setIsRuleBookOpen(true)} 
          className="pointer-events-auto w-10 h-10 bg-paper border-2 border-ink rounded-full flex items-center justify-center hover:bg-ink hover:text-paper transition-colors shadow-sketch mr-2 font-serif font-bold text-lg"
        >
          ?
        </button>
      </div>

      <div className="h-screen w-full pt-16 pb-10 overflow-y-auto relative z-10">
        {gameState.currentPhase === GamePhase.LOBBY 
          ? renderLobby()
          : renderGameContent()
        }
      </div>

      <RuleBook 
        isOpen={isRuleBookOpen} 
        onClose={() => setIsRuleBookOpen(false)}
        activeRoleTypes={gameDeck.length > 0 ? gameDeck : projectedDeck}
        myRole={localPlayer?.initialRole}
      />
    </div>
  );
};

export default App;