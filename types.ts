
export enum GamePhase {
  LOBBY = 'LOBBY',
  ROLE_REVEAL = 'ROLE_REVEAL',
  NIGHT_INTRO = 'NIGHT_INTRO',
  NIGHT_ACTIVE = 'NIGHT_ACTIVE',
  DAY_DISCUSSION = 'DAY_DISCUSSION', 
  DAY_VOTING = 'DAY_VOTING',         
  DAY_RESULTS = 'DAY_RESULTS',       
  GAME_REVIEW = 'GAME_REVIEW',       
  GAME_OVER = 'GAME_OVER'
}

export enum RoleType {
  WEREWOLF = 'WEREWOLF',
  MINION = 'MINION',
  MASON = 'MASON',
  SEER = 'SEER',
  ROBBER = 'ROBBER',
  TROUBLEMAKER = 'TROUBLEMAKER',
  DRUNK = 'DRUNK',
  INSOMNIAC = 'INSOMNIAC',
  VILLAGER = 'VILLAGER',
  TANNER = 'TANNER',
  HUNTER = 'HUNTER'
}

export enum RoleTeam {
  VILLAGER = 'VILLAGER',
  WEREWOLF = 'WEREWOLF',
  TANNER = 'TANNER'
}

export interface Player {
  id: string;
  name: string;
  seatNumber: number | null; // 1-based index
  role: RoleType | null;
  initialRole: RoleType | null; // For Insomniac checking and Review
  isHost: boolean;
  isBot?: boolean;
}

export interface RoleDefinition {
  type: RoleType;
  name: string;
  team: RoleTeam;
  description: string; // Short flavor text
  ability: string; // Specific mechanical ability
  victoryCondition: string; // How to win specifically
  nightOrder: number; // 0 means no night action or wake up time
  wakeUpText: string;
  actionDescription: string;
  imagePlaceholder: string;
}

export interface GameResult {
  winners: RoleTeam[];
  deadPlayerIds: string[];
  winningReason: string;
}

export interface GameState {
  roomCode: string;
  players: Player[];
  centerCards: RoleType[];
  currentPhase: GamePhase;
  currentNightRoleIndex: number; // Index in the sorted night order
  timer: number;
  settings: {
    playerCount: number; // The target number of players set by host
    useDoppelganger: boolean;
  };
  votes: Record<string, string>; // voterId -> targetId
  speakerId?: string; // ID of the player randomly selected to start discussion
  gameResult?: GameResult; // The final calculated result
  log: string[];
}
