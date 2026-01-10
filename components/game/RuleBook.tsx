import React, { useState, useMemo, useEffect } from 'react';
import { ROLES } from '../../constants';
import { RoleType, RoleTeam } from '../../types';
import Button from '../ui/Button';
import PlayingCard from '../ui/PlayingCard';
import { geminiService } from '../../services/geminiService';

interface RuleBookProps {
  isOpen: boolean;
  onClose: () => void;
  activeRoleTypes: RoleType[]; 
  myRole?: RoleType | null; 
}

// --- STRATEGY CONTENT ---
const STRATEGIES = {
    overview: [
        { title: "核心：身份流动", text: "一夜狼人杀和传统狼人杀最大的区别在于：你闭眼时的身份，不一定是你睁眼时的身份。所有的逻辑推理都必须建立在“我的牌可能被换了”以及“别人的牌可能也被换了”这个基础之上。" },
        { title: "好人不用“挡刀”", text: "本游戏没有夜晚杀人环节，只有白天一次投票。好人阵营的目标是【投死至少一只狼】。平民不需要像传统游戏那样替神职去死。平民的任务是提供清晰的逻辑，或者通过适度的“诈身份”来逼出狼人的破绽。" },
        { title: "投票即决战", text: "一旦有狼人被投出，狼队即刻判负（除非有皮匠等特殊情况）。如果最高票平票，所有平票者都会死。利用这个规则，如果你们无法确定谁是狼，可以尝试让多个人平票（前提是里面大概率有狼）。" },
    ],
    roles: [
        { 
            role: RoleType.WEREWOLF, 
            title: "狼人：绝处逢生", 
            sections: [
                { subtitle: "卖队友的唯一准则", text: "绝对不要为了“做好身份”而踩死队友，因为只要一个狼死，全队输。但是！如果你确信队友被【强盗】换了（队友现在是好人，你是狼），或者你自己被换成了好人，为了新阵营的胜利，你必须毫不犹豫地指认以前的队友！" },
                { subtitle: "独狼悍跳", text: "如果只有你一只狼，你可以查看一张底牌。最好的策略是直接跳那个底牌的身份。例如底牌是预言家，你就跳预言家。因为真正的预言家不可能在场上，没人能从身份上反驳你。" },
                { subtitle: "被查杀怎么办？", text: "如果不幸被预言家查杀，不要慌。不要承认。你可以反咬他是狼人，或者声称自己是【捣蛋鬼】或【强盗】，说你把身份换走了，把局面搅浑，争取让好人弃票或投错人。" }
            ]
        },
        { 
            role: RoleType.MINION, 
            title: "爪牙：混乱制造者", 
            sections: [
                { subtitle: "替死鬼战术", text: "你的胜利条件是狼人活着。所以如果狼人被怀疑，你要立刻跳出来承认自己是狼人，或者跳一个神职身份（如预言家）故意聊爆，表现得像个“拙劣的狼人”，吸引大家的选票投死你。你死了，狼人没死，你们就赢了。" },
                { subtitle: "搅局", text: "你可以声称自己是捣蛋鬼，说换了A和B。这会让A和B互相猜疑，让好人阵营内乱，分散他们的推理精力。" }
            ]
        },
        { 
            role: RoleType.SEER, 
            title: "预言家：钓鱼执法", 
            sections: [
                { subtitle: "延迟报警", text: "天亮后不要立刻报出你的查验结果。先听一圈。如果有狼人正好悍跳了你查验的那张底牌，或者悍跳了你的身份，这时候你再拍死他，力度最大。过早暴露会让狼人有时间编造新的谎言。" },
                { subtitle: "查人 vs 查底牌", text: "查人风险大（可能查到强盗变成狼，或者查到好人被捣蛋鬼换了），但收益高，直接定性一个人。查底牌安全，能排坑，适合稳健型打法。" }
            ]
        },
        { 
            role: RoleType.ROBBER, 
            title: "强盗：阵营摇摆人", 
            sections: [
                { subtitle: "抢到狼人怎么办？", text: "恭喜你，你现在是狼人了！原来的狼人变成了好人（但他自己不知道）。你千万不要跳强盗，因为原来的狼人（现好人）为了赢会毫不犹豫地把你投出去。你需要潜伏下来，帮助狼队，或者误导好人去投别人。" },
                { subtitle: "抢到好人怎么办？", text: "第一天就要跳出来，大声说“我抢了X，X现在是好人”。这样直接保住了两个人（你和X），大大缩小了狼坑范围。X就是你的铁盟友。" }
            ]
        },
        { 
            role: RoleType.TROUBLEMAKER, 
            title: "捣蛋鬼：信息测试员", 
            sections: [
                { subtitle: "空跳/诈身份", text: "你可以实际上什么都没换，但声称你换了A和B。观察A和B的反应。如果有人极力否认或者显得很慌张，他心里可能有鬼（比如他是狼人，拿了一张好牌不想被换走）。" },
                { subtitle: "保护身份", text: "如果你真的换了两个你认为是好人的人，可以先不说，防止狼人知道身份后重新编逻辑。等大家都聊完一圈，你再公布交换结果，打狼人一个措手不及。" }
            ]
        },
        { 
            role: RoleType.TANNER, 
            title: "皮匠：求死之道", 
            sections: [
                { subtitle: "别死得太假", text: "如果你直接说“投我吧”，大家会知道你是皮匠而不投你。你需要装成一个“聊爆了的狼人”。比如：前言不搭后语、假装看错牌、或者跳一个场上已经有的身份然后被揭穿。你要激起好人的愤怒或恐惧，让他们觉得非投你不可。" }
            ]
        },
        {
            role: RoleType.INSOMNIAC,
            title: "失眠者：最后的目击者",
            sections: [
                { subtitle: "排坑机器", text: "如果你醒来发现身份没变，那么你确信自己是好人。你可以强势带队。如果身份变了（比如变成了狼人），请参照狼人战术，不要暴露自己身份变了的事实。" }
            ]
        },
        {
            role: RoleType.VILLAGER,
            title: "村民：并不只是看客",
            sections: [
                { subtitle: "适当诈身份", text: "虽然你没有技能，但你可以假装有。例如，你可以假装是捣蛋鬼，说“我换了A和B”，看他们的反应。如果有狼人就在A或B中，他可能会露出马脚。注意：一定要在投票前澄清你的真实身份（脱衣服），以免误导好人投错票。" },
                { subtitle: "寻找逻辑漏洞", text: "你的武器是耳朵。仔细听谁的发言前后矛盾，谁在跟风，谁不敢看别人的眼睛。" }
            ]
        }
    ]
};

const RuleBook: React.FC<RuleBookProps> = ({ isOpen, onClose, activeRoleTypes, myRole }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'identity' | 'overview' | 'roles' | 'glossary' | 'tactics'>('overview');
  const [isIdentityRevealed, setIsIdentityRevealed] = useState(false); 
  
  const [wasOpen, setWasOpen] = useState(false);

  useEffect(() => {
    if (isOpen && !wasOpen) {
      setWasOpen(true);
      setIsIdentityRevealed(false);
      
      if (myRole) {
        setActiveTab('identity');
      } else if (activeRoleTypes.length > 0) {
        setActiveTab('roles');
      } else {
        setActiveTab('overview');
      }
    } else if (!isOpen) {
      setWasOpen(false);
    }
  }, [isOpen, myRole, activeRoleTypes.length]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    activeRoleTypes.forEach(t => {
      const key = t as string;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [activeRoleTypes]);

  const uniqueRoles = useMemo(() => {
    return Array.from(new Set(activeRoleTypes)).sort((a, b) => {
       const roleA = ROLES[a as RoleType];
       const roleB = ROLES[b as RoleType];
       if (roleA.team !== roleB.team) return roleA.team.localeCompare(roleB.team);
       return roleA.nightOrder - roleB.nightOrder;
    });
  }, [activeRoleTypes]);

  const allRoles = useMemo(() => {
    return Object.values(ROLES).sort((a, b) => {
       if (a.team !== b.team) return a.team.localeCompare(b.team);
       return a.nightOrder - b.nightOrder;
    });
  }, []);

  if (!isOpen) return null;

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer(null);
    const roleNames = uniqueRoles.map(t => ROLES[t].name);
    const result = await geminiService.askRuleQuestion(question, roleNames);
    setAnswer(result);
    setLoading(false);
  };

  const getTeamColor = (team: RoleTeam) => {
    switch(team) {
      case RoleTeam.WEREWOLF: return 'text-red-900 border-red-900/20 bg-red-50';
      case RoleTeam.VILLAGER: return 'text-blue-900 border-blue-900/20 bg-blue-50';
      case RoleTeam.TANNER: return 'text-amber-900 border-amber-900/20 bg-amber-50';
      default: return 'text-ink';
    }
  };

  const getTeamLabel = (team: RoleTeam) => {
    switch(team) {
      case RoleTeam.WEREWOLF: return '狼人 / Werewolf';
      case RoleTeam.VILLAGER: return '村民 / Villager';
      case RoleTeam.TANNER: return '独立 / Independent';
    }
  };

  const renderRoleCard = (type: RoleType, showCount = false) => {
    const role = ROLES[type];
    const count = roleCounts[type];
    const colorClass = getTeamColor(role.team);
    
    return (
      <div key={type} className={`border-sketch p-5 ${colorClass} relative overflow-hidden mb-4 shadow-sm bg-paper`}>
         <div className="flex justify-between items-start mb-3 relative z-10">
            <div>
              <h3 className="text-2xl font-bold font-woodcut leading-none">
                {role.name.split('/')[0]}
                {showCount && <span className="text-sm opacity-70 ml-2 font-mono text-ink">x{count}</span>}
              </h3>
              <div className="text-xs uppercase tracking-wider opacity-70 font-bold mb-1 mt-1 font-serif">{role.name.split('/')[1]}</div>
              <span className="text-[10px] uppercase tracking-widest font-bold border border-current px-2 py-0.5 rounded opacity-80 inline-block font-sans">
                {getTeamLabel(role.team)}
              </span>
            </div>
            {role.nightOrder > 0 && (
              <div className="text-xs font-bold border border-current rounded px-2 py-1 text-center bg-white/50 font-serif">
                Action<br/>#{role.nightOrder}
              </div>
            )}
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10 mt-4 pt-4 border-t border-current/20">
            <div>
              <p className="font-bold mb-1 opacity-80 uppercase text-xs tracking-wider font-sans">技能 / ABILITY</p>
              <p className="text-base font-serif leading-snug">{role.ability.split('/')[0]}</p>
              <p className="text-xs italic opacity-60 mt-1">{role.ability.split('/')[1]}</p>
            </div>
            <div>
              <p className="font-bold mb-1 opacity-80 uppercase text-xs tracking-wider font-sans">胜利条件 / VICTORY</p>
              <p className="text-base font-serif leading-snug">{role.victoryCondition.split('/')[0]}</p>
              <p className="text-xs italic opacity-60 mt-1">{role.victoryCondition.split('/')[1]}</p>
            </div>
         </div>
      </div>
    );
  };

  const TabButton = ({ id, labelCn, labelEn }: { id: typeof activeTab, labelCn: string, labelEn: string }) => (
    <button 
      className={`flex-none py-3 px-4 border-b-2 transition-colors flex flex-col items-center justify-center min-w-[80px] font-woodcut
        ${activeTab === id 
          ? 'border-ink text-ink bg-black/5' 
          : 'border-transparent text-inkDim hover:text-ink'}`}
      onClick={() => setActiveTab(id)}
    >
      <span className="text-lg font-bold leading-none">{labelCn}</span>
      <span className="text-[9px] uppercase tracking-widest font-normal mt-1 opacity-70 font-sans">{labelEn}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-paper text-ink w-full max-w-4xl max-h-[90vh] overflow-hidden border-sketch relative flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="p-5 border-b-2 border-ink/10 flex justify-between items-center bg-paperDark flex-none relative">
          <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-ink opacity-30"></div>
          <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-ink opacity-30"></div>

          <div>
            <h2 className="text-3xl font-woodcut text-ink tracking-tight">魔法全书</h2>
            <p className="text-[10px] uppercase tracking-[0.4em] text-inkDim font-serif ml-1">The Grimoire</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-ink hover:text-paper transition-colors border-2 border-transparent hover:border-ink"
          >
            <span className="font-woodcut text-2xl leading-none mt-1">X</span>
          </button>
        </div>

        {/* Tabs - Reordered Tactics to end */}
        <div className="flex border-b-2 border-ink/10 overflow-x-auto flex-none w-full bg-paper scrollbar-hide">
          {myRole && <TabButton id="identity" labelCn="身份" labelEn="Role" />}
          <TabButton id="overview" labelCn="规则" labelEn="Rules" />
          {activeRoleTypes.length > 0 && <TabButton id="roles" labelCn="配置" labelEn="Deck" />}
          <TabButton id="glossary" labelCn="图鉴" labelEn="Codex" />
          <TabButton id="tactics" labelCn="战术手札" labelEn="Tactics" />
        </div>

        {/* Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar bg-paper relative">
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/ag-square.png')]"></div>
          
          {/* TAB: IDENTITY (SAFE REVEAL UI) */}
          {activeTab === 'identity' && myRole && (
            <div className="space-y-6 animate-fade-in-up relative z-10 h-full flex flex-col items-center">
              <div className="text-center mb-2">
                 <p className="text-2xl font-woodcut text-ink">你的初始身份</p>
                 <p className="text-xs text-inkDim font-mono mt-1 uppercase tracking-widest">Initial Role</p>
                 <p className="text-xs text-red-700 bg-red-100/50 inline-block px-2 py-1 rounded mt-2 border border-red-200">
                    注意：此身份可能已被交换
                 </p>
              </div>

              <div 
                className="cursor-pointer group flex flex-col items-center gap-4"
                onClick={() => setIsIdentityRevealed(!isIdentityRevealed)}
              >
                  <PlayingCard 
                      role={myRole} 
                      isRevealed={isIdentityRevealed} 
                      label={isIdentityRevealed ? ROLES[myRole].name.split('/')[0] : "点击翻开 / Tap to Reveal"} 
                      size="lg" 
                  />
                  
                  <div className="text-sm font-bold animate-pulse text-inkDim">
                      {isIdentityRevealed ? "点击隐藏 (Tap to Hide)" : "点击卡牌查看 (Tap Card to View)"}
                  </div>
              </div>

              {isIdentityRevealed && (
                  <div className="w-full max-w-md mt-6 animate-fade-in">
                      {renderRoleCard(myRole, false)}
                  </div>
              )}
            </div>
          )}

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-fade-in-up relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Villager Goal */}
                <div className="border-sketch p-4 bg-blue-50/50 border-blue-900/30">
                  <h3 className="text-xl font-woodcut text-blue-900 mb-1">村民阵营</h3>
                  <p className="text-[10px] font-sans uppercase tracking-widest text-blue-800 mb-3 border-b border-blue-900/20 pb-2">Villagers Team</p>
                  <p className="font-bold text-blue-900 text-sm mb-1 font-serif">胜利条件 / Victory:</p>
                  <ul className="list-disc ml-5 text-sm space-y-1 text-blue-800 font-serif">
                    <li>处决至少一名狼人。<br/><span className="text-xs opacity-60 italic">Kill at least one Werewolf.</span></li>
                    <li>若无狼人，所有人平安。<br/><span className="text-xs opacity-60 italic">If NO Werewolves, NO ONE dies.</span></li>
                  </ul>
                </div>

                {/* Werewolf Goal */}
                <div className="border-sketch p-4 bg-red-50/50 border-red-900/30">
                  <h3 className="text-xl font-woodcut text-red-900 mb-1">狼人阵营</h3>
                  <p className="text-[10px] font-sans uppercase tracking-widest text-red-800 mb-3 border-b border-red-900/20 pb-2">Werewolf Team</p>
                  <p className="font-bold text-red-900 text-sm mb-1 font-serif">胜利条件 / Victory:</p>
                  <ul className="list-disc ml-5 text-sm space-y-1 text-red-800 font-serif">
                    <li>狼人均存活。<br/><span className="text-xs opacity-60 italic">No Werewolf dies.</span></li>
                    <li>爪牙即使死也算赢。<br/><span className="text-xs opacity-60 italic">Minions win if Wolves win.</span></li>
                  </ul>
                </div>

                {/* Tanner Goal */}
                <div className="border-sketch p-4 bg-amber-50/50 border-amber-900/30">
                  <h3 className="text-xl font-woodcut text-amber-900 mb-1">皮匠</h3>
                  <p className="text-[10px] font-sans uppercase tracking-widest text-amber-800 mb-3 border-b border-amber-900/20 pb-2">Tanner (Independent)</p>
                  <p className="font-bold text-amber-900 text-sm mb-1 font-serif">胜利条件 / Victory:</p>
                  <ul className="list-disc ml-5 text-sm space-y-1 text-amber-800 font-serif">
                    <li>只有你死，你才赢。<br/><span className="text-xs opacity-60 italic">You win if you die.</span></li>
                  </ul>
                </div>
              </div>

              <div className="p-6 border-2 border-dashed border-ink/20 rounded bg-white/40">
                <h3 className="text-2xl font-woodcut mb-4 text-ink">基础规则 / Basic Rules</h3>
                <ul className="list-disc ml-5 space-y-4 font-serif text-ink text-lg">
                  <li>
                    <strong className="text-rust">天亮请勿看牌：</strong> 你的身份可能在夜里被交换了。
                    <br/><span className="text-sm text-inkDim italic">Daybreak: DO NOT look at your card. Information is your weapon.</span>
                  </li>
                  <li>
                    <strong>投票：</strong> 讨论结束后，倒数321同时指人，票数最多者出局。
                    <br/><span className="text-sm text-inkDim italic">Voting: Count to 3. Point. Majority dies.</span>
                  </li>
                  <li>
                    <strong>平票：</strong> 若最高票平票，所有平票者一起死。
                    <br/><span className="text-sm text-inkDim italic">Ties: If max votes are tied, all tied players die.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB: ROLES (Active) */}
          {activeTab === 'roles' && (
            <div className="space-y-6 animate-fade-in-up relative z-10">
              <div className="text-center mb-6 text-ink">
                 <span className="font-woodcut text-xl">本局配置</span>
                 <div className="text-sm opacity-60 font-serif">{activeRoleTypes.length} 张牌 (包含3张底牌)</div>
              </div>
              {uniqueRoles.map(type => renderRoleCard(type, true))}
            </div>
          )}

          {/* TAB: GLOSSARY (All) */}
          {activeTab === 'glossary' && (
            <div className="space-y-6 animate-fade-in-up relative z-10">
              <div className="text-center mb-6">
                <span className="font-woodcut text-xl text-ink">完整图鉴</span>
                <div className="text-[10px] uppercase tracking-widest text-inkDim mt-1">The Complete Codex</div>
              </div>
              {allRoles.map(role => renderRoleCard(role.type, false))}
            </div>
          )}

          {/* TAB: TACTICS (NEW - Master Level) */}
          {activeTab === 'tactics' && (
              <div className="space-y-8 animate-fade-in-up relative z-10 pb-10">
                  <div className="bg-paperDark p-6 border-sketch shadow-sketch">
                      <h3 className="text-2xl font-woodcut text-ink mb-4 border-b-2 border-ink pb-2">大师心法 / Master's Mindset</h3>
                      <div className="grid grid-cols-1 gap-6">
                          {STRATEGIES.overview.map((s, i) => (
                              <div key={i} className="mb-2">
                                  <h4 className="font-bold text-rust text-lg mb-1 font-woodcut">{s.title}</h4>
                                  <p className="text-base text-ink font-serif leading-relaxed">{s.text}</p>
                              </div>
                          ))}
                      </div>
                  </div>
                  
                  <div>
                      <h3 className="text-2xl font-woodcut text-ink mb-6 text-center">角色进阶战术 / Role Mastery</h3>
                      <div className="space-y-6">
                          {STRATEGIES.roles.map((s, i) => {
                              // Filter roles if we know active types
                              if (activeRoleTypes.length > 0 && !activeRoleTypes.includes(s.role)) return null;
                              
                              return (
                                <div key={i} className="border-2 border-ink/10 p-5 rounded-xl bg-white/60 relative overflow-hidden group hover:border-ink/40 transition-colors">
                                    <div className={`absolute top-0 left-0 w-1.5 h-full ${s.role === RoleType.WEREWOLF ? 'bg-red-800' : 'bg-blue-800'} opacity-60`}></div>
                                    <div className="flex items-center gap-3 mb-4 pl-2 border-b border-ink/10 pb-2">
                                        <span className="font-woodcut text-xl text-ink">{s.title}</span>
                                        {activeRoleTypes.includes(s.role) && <span className="text-[9px] bg-rust text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">In Play</span>}
                                    </div>
                                    
                                    <div className="space-y-4 pl-2">
                                        {s.sections.map((section, idx) => (
                                            <div key={idx}>
                                                <span className="block text-xs font-bold text-inkDim uppercase tracking-wider mb-1">{section.subtitle}</span>
                                                <p className="text-sm text-ink font-serif leading-relaxed">{section.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                              );
                          })}
                      </div>
                  </div>
              </div>
          )}

        </div>

        {/* AI Helper Footer */}
        <div className="p-4 bg-paperDark border-t-2 border-ink/10 flex-none z-20 shadow-up">
           <div className="flex gap-3 items-center">
            <div className="hidden md:block text-center min-w-[60px]">
              <div className="font-woodcut text-ink text-xl leading-none">巫师</div>
              <div className="text-[8px] text-inkDim uppercase tracking-wider font-bold">Wizard</div>
            </div>
            <input 
              type="text" 
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="向古老的灵魂提问... / Ask the spirits..."
              className="flex-1 bg-white/60 border-b-2 border-ink/20 focus:border-rust focus:bg-white focus:outline-none p-3 font-serif text-lg text-ink placeholder-ink/40 transition-colors rounded-t-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            />
            <Button onClick={handleAsk} disabled={loading} className="py-2 px-6" variant="secondary">
              <div className="flex flex-col items-center leading-none">
                <span className="text-base font-bold">{loading ? "..." : "祈祷"}</span>
                <span className="text-[8px] uppercase mt-1 opacity-60 tracking-wider">{loading ? "..." : "INVOKE"}</span>
              </div>
            </Button>
          </div>
          {answer && (
            <div className="mt-3 text-sm p-4 bg-paper border-sketch text-ink font-serif italic animate-fade-in-up relative">
              <div className="absolute -top-2 left-6 w-4 h-4 bg-paper border-t border-l border-ink transform rotate-45"></div>
              {answer}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default RuleBook;