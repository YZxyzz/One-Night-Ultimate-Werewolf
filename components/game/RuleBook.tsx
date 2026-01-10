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

const RuleBook: React.FC<RuleBookProps> = ({ isOpen, onClose, activeRoleTypes, myRole }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'identity' | 'overview' | 'roles' | 'glossary'>('overview');
  const [isIdentityRevealed, setIsIdentityRevealed] = useState(false); // New state for Safe Peek
  
  const [wasOpen, setWasOpen] = useState(false);

  useEffect(() => {
    if (isOpen && !wasOpen) {
      setWasOpen(true);
      // Reset reveal state on open
      setIsIdentityRevealed(false);
      
      if (myRole) {
        setActiveTab('identity');
      } else if (activeRoleTypes.length > 0) {
        setActiveTab('roles');
      } else {
        setActiveTab('glossary');
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
      className={`flex-none py-3 px-6 border-b-2 transition-colors flex flex-col items-center justify-center min-w-[100px] font-woodcut
        ${activeTab === id 
          ? 'border-ink text-ink bg-black/5' 
          : 'border-transparent text-inkDim hover:text-ink'}`}
      onClick={() => setActiveTab(id)}
    >
      <span className="text-xl font-bold leading-none">{labelCn}</span>
      <span className="text-[10px] uppercase tracking-widest font-normal mt-1 opacity-70 font-sans">{labelEn}</span>
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

        {/* Tabs */}
        <div className="flex border-b-2 border-ink/10 overflow-x-auto flex-none w-full bg-paper scrollbar-hide">
          {myRole && <TabButton id="identity" labelCn="我的身份" labelEn="My Role" />}
          <TabButton id="overview" labelCn="胜利目标" labelEn="Objectives" />
          {activeRoleTypes.length > 0 && <TabButton id="roles" labelCn="本局配置" labelEn="Deck" />}
          <TabButton id="glossary" labelCn="完整图鉴" labelEn="Codex" />
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