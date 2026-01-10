import { RoleType, RoleDefinition, RoleTeam } from './types';
import React from 'react';

// Using Pollinations.ai for consistent, style-specific image generation without API keys.
// Style: 3D Render, Fantasy, Isometric/Card Art, Cinematic Lighting
const getImageUrl = (prompt: string) => {
  const seed = Math.floor(Math.random() * 1000); // Fixed seed per reload effectively
  const basePrompt = `3d render of ${prompt}, fantasy board game card art, arcane style, mystical lighting, detailed texture, 2d to 3d style, dark background, tarot card style`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(basePrompt)}?width=400&height=600&nologo=true&seed=${42}`; // Fixed seed for consistency across re-renders
};

// Distinct colors for player avatars (Mystical/Muted tones for white text contrast)
export const AVATAR_COLORS = [
  '#7f1d1d', // Red 900
  '#14532d', // Green 900
  '#1e3a8a', // Blue 900
  '#581c87', // Purple 900
  '#78350f', // Amber 900
  '#312e81', // Indigo 900
  '#831843', // Pink 900
  '#4c1d95', // Violet 900
  '#3f3f46', // Zinc 700
  '#0f766e', // Teal 700
];

export const GAME_TIPS = [
  "💡 即使你是村民，也可以假装自己是别的身份来炸出狼人。",
  "💡 狼人如果发现同伴是强盗，可能意味着同伴已经把狼牌换给了别人。",
  "💡 捣蛋鬼的操作不会改变自己的阵营，但会极大地干扰局势。",
  "💡 只有失眠者能确切知道自己最终的牌是什么（除非被强盗抢了）。",
  "💡 预言家查看底牌风险较小，但查看玩家身份能提供更直接的线索。",
  "💡 皮匠不仅要装得像狼，还要装得像'想赢的狼'，才能骗到票。",
  "💡 如果你是酒鬼，你现在的身份大概率已经变成了底牌的一张，祝你好运。",
  "💡 强盗抢到狼人牌后，原来的狼人变成了好人，而你变成了狼人！",
  "💡 投票平局时，所有平票玩家都会出局。利用这一点可以一网打尽。",
  "💡 即使你没有任何夜间行动，你的发言也是游戏中最重要的一环。"
];

export const ROLES: Record<RoleType, RoleDefinition> = {
  [RoleType.WEREWOLF]: {
    type: RoleType.WEREWOLF,
    name: '狼人 / Werewolf',
    team: RoleTeam.WEREWOLF,
    description: '隐藏在人群中的捕食者。 / The predator hidden among us.',
    ability: '晚上醒来确认同伴。如果是独狼，可查看一张底牌。 / Wake up to find other werewolves. If lone wolf, view a center card.',
    victoryCondition: '如果没有狼人被投票处决，狼人阵营获胜。 / Wins if no Werewolf dies.',
    nightOrder: 2,
    wakeUpText: '狼人，请睁眼。',
    actionDescription: '寻找你的同伴。如果你是孤狼，可以查看一张底牌。',
    imagePlaceholder: getImageUrl('a fearsome werewolf with glowing red eyes in a dark forest, fur texture')
  },
  [RoleType.MINION]: {
    type: RoleType.MINION,
    name: '爪牙 / Minion',
    team: RoleTeam.WEREWOLF,
    description: '狼人的疯狂崇拜者。 / A fanatic follower of the Werewolves.',
    ability: '知道谁是狼人，但狼人不知道你是谁。 / Knows who the Werewolves are.',
    victoryCondition: '只要狼人获胜，爪牙就获胜。 / Wins if the Werewolves win.',
    nightOrder: 3,
    wakeUpText: '爪牙，请睁眼。',
    actionDescription: '看看谁是你的主人。狼人请竖起大拇指。',
    imagePlaceholder: getImageUrl('a hooded dark cultist minion holding a dagger, evil grin, purple magic')
  },
  [RoleType.MASON]: {
    type: RoleType.MASON,
    name: '守夜人 / Mason',
    team: RoleTeam.VILLAGER,
    description: '互相确认身份的兄弟会成员。 / Brotherhood members.',
    ability: '晚上醒来确认另一位守夜人是谁。 / Wake up and look for the other Mason.',
    victoryCondition: '好人阵营胜利条件。 / Standard Villager victory.',
    nightOrder: 4,
    wakeUpText: '守夜人，请睁眼。',
    actionDescription: '寻找你的兄弟。',
    imagePlaceholder: getImageUrl('two stone masons shaking hands, secret society symbol, stone texture')
  },
  [RoleType.SEER]: {
    type: RoleType.SEER,
    name: '预言家 / Seer',
    team: RoleTeam.VILLAGER,
    description: '洞察真相的智者。 / The one who sees the truth.',
    ability: '可以查看一位玩家的身份，或者查看两张底牌。 / View cards.',
    victoryCondition: '好人阵营胜利条件。 / Standard Villager victory.',
    nightOrder: 5,
    wakeUpText: '预言家，请睁眼。',
    actionDescription: '你想知道谁的身份？查看一位玩家，或者两张底牌。',
    imagePlaceholder: getImageUrl('mystic female seer looking into a glowing crystal ball, magical aura')
  },
  [RoleType.ROBBER]: {
    type: RoleType.ROBBER,
    name: '强盗 / Robber',
    team: RoleTeam.VILLAGER,
    description: '喜欢窃取他人身份的小偷。 / A thief who steals identities.',
    ability: '交换自己与另一位玩家的牌，并查看新牌。 / Swap and view.',
    victoryCondition: '根据你抢到的新身份决定。 / Depends on new role.',
    nightOrder: 6,
    wakeUpText: '强盗，请睁眼。',
    actionDescription: '你想成为谁？交换一张牌，并看看你变成了什么。',
    imagePlaceholder: getImageUrl('a sneaky thief robber stealing a pouch of gold coins, shadows')
  },
  [RoleType.TROUBLEMAKER]: {
    type: RoleType.TROUBLEMAKER,
    name: '捣蛋鬼 / Troublemaker',
    team: RoleTeam.VILLAGER,
    description: '喜欢制造混乱的恶作剧者。 / A prankster who creates chaos.',
    ability: '交换另外两名玩家的牌，但不能查看。 / Swap two others.',
    victoryCondition: '好人阵营胜利条件。 / Standard Villager victory.',
    nightOrder: 7,
    wakeUpText: '捣蛋鬼，请睁眼。',
    actionDescription: '制造一些混乱吧。交换另外两名玩家的卡牌。',
    imagePlaceholder: getImageUrl('a mischievous jester troublemaker juggling chaotic magic orbs')
  },
  [RoleType.DRUNK]: {
    type: RoleType.DRUNK,
    name: '酒鬼 / Drunk',
    team: RoleTeam.VILLAGER,
    description: '喝得烂醉，连自己是谁都不知道。 / So drunk he doesn\'t know who he is.',
    ability: '将自己的牌与一张底牌交换，但不能查看。 / Swap with center.',
    victoryCondition: '你现在的身份其实是底牌的那张。 / You are your new card.',
    nightOrder: 8,
    wakeUpText: '酒鬼，请醒一醒。',
    actionDescription: '你喝醉了。把你的牌和桌子中间的一张牌换一下。',
    imagePlaceholder: getImageUrl('a drunk man passed out on a barrel of ale, tavern setting')
  },
  [RoleType.INSOMNIAC]: {
    type: RoleType.INSOMNIAC,
    name: '失眠者 / Insomniac',
    team: RoleTeam.VILLAGER,
    description: '晚上睡不着，最后才确认自己身份。 / Wakes up last.',
    ability: '游戏夜结束前，查看自己的身份牌是否被交换。 / Check your card.',
    victoryCondition: '根据你最终看到的身份决定。 / Depends on final role.',
    nightOrder: 9,
    wakeUpText: '失眠者，请睁眼。',
    actionDescription: '漫长的一夜。看看你的身份有没有发生变化。',
    imagePlaceholder: getImageUrl('a wide-eyed insomniac person in bed looking at a clock, night time')
  },
  [RoleType.VILLAGER]: {
    type: RoleType.VILLAGER,
    name: '村民 / Villager',
    team: RoleTeam.VILLAGER,
    description: '普通的农夫，没有任何特殊能力。 / A simple farmer.',
    ability: '无特殊能力。依靠推理找出狼人。 / No ability.',
    victoryCondition: '好人阵营胜利条件。 / Standard Villager victory.',
    nightOrder: -1,
    wakeUpText: '',
    actionDescription: '',
    imagePlaceholder: 'https://image.pollinations.ai/prompt/3d%20render%20of%20a%20simple%20medieval%20villager%20farmer%20holding%20a%20pitchfork,%20fantasy%20art?width=400&height=600&nologo=true'
  },
  [RoleType.TANNER]: {
    type: RoleType.TANNER,
    name: '皮匠 / Tanner',
    team: RoleTeam.TANNER,
    description: '厌世者，一心求死。 / Hates his job and wants to die.',
    ability: '无特殊夜间能力。 / No night ability.',
    victoryCondition: '只有你自己被投票处决，你才获胜。 / Wins only if he dies.',
    nightOrder: -1,
    wakeUpText: '',
    actionDescription: '',
    imagePlaceholder: getImageUrl('a depressed tanner working with leather, gloomy atmosphere')
  },
  [RoleType.HUNTER]: {
    type: RoleType.HUNTER,
    name: '猎人 / Hunter',
    team: RoleTeam.VILLAGER,
    description: '临死也要拉个垫背的。 / If he dies, he takes someone with him.',
    ability: '如果你被处死，你手指的那个人也一起死。 / Revenge kill.',
    victoryCondition: '好人阵营胜利条件。 / Standard Villager victory.',
    nightOrder: -1,
    wakeUpText: '',
    actionDescription: '',
    imagePlaceholder: getImageUrl('a fierce hunter with a crossbow, forest background, leather armor')
  }
};

// Sort roles by night order
export const NIGHT_SEQUENCE = Object.values(ROLES)
  .filter(r => r.nightOrder > 0)
  .sort((a, b) => a.nightOrder - b.nightOrder)
  .map(r => r.type);

export const DEFAULT_PLAYER_COUNT = 4;
export const MAX_PLAYER_COUNT = 10;
export const MIN_PLAYER_COUNT = 3;