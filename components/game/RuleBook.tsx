import React, { useState, useMemo, useEffect } from 'react';
import { ROLES } from '../../constants';
import { RoleType, RoleTeam } from '../../types';
import Button from '../ui/Button';
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
  
  const [wasOpen, setWasOpen] = useState(false);

  useEffect(() => {
    if (isOpen && !wasOpen) {
      setWasOpen(true);
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
      <div key={type} className={`sketch-border p-5 ${colorClass} relative overflow-hidden mb-4 shadow-sm`}>
         <div className="flex justify-between items-start mb-3 relative z-10">
            <div>
              <h3 className="text-2xl font-bold font-serif">
                {role.name.split('/')[0]}
                {showCount && <span className="text-sm opacity-70 ml-2 font-mono text-ink">x{count}</span>}
              </h3>
              <div className="text-xs uppercase tracking-wider opacity-70 font-bold mb-1">{role.name.split('/')[1]}</div>
              <span className="text-[10px] uppercase tracking-widest font-bold border border-current px-2 py-0.5 rounded opacity-80 inline-block">
                {getTeamLabel(role.team)}
              </span>
            </div>
            {role.nightOrder > 0 && (
              <div className="text-xs font-bold border border-current rounded px-2 py-1 text-center bg-white/50">
                Action<br/>#{role.nightOrder}
              </div>
            )}
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10 mt-4 pt-4 border-t border-current/20">
            <div>
              <p className="font-bold mb-1 opacity-80 uppercase text-xs tracking-wider">技能 / ABILITY</p>
              <p className="text-base font-serif leading-snug">{role.ability.split('/')[0]}</p>
              <p className="text-xs italic opacity-60 mt-1">{role.ability.split('/')[1]}</p>
            </div>
            <div>
              <p className="font-bold mb-1 opacity-80 uppercase text-xs tracking-wider">胜利条件 / VICTORY</p>
              <p className="text-base font-serif leading-snug">{role.victoryCondition.split('/')[0]}</p>
              <p className="text-xs italic opacity-60 mt-1">{role.victoryCondition.split('/')[1]}</p>
            </div>
         </div>
      </div>
    );
  };

  const TabButton = ({ id, labelCn, labelEn }: { id: typeof activeTab, labelCn: string, labelEn: string }) => (
    <button 
      className={`flex-none py-3 px-6 border-b-2 transition-colors flex flex-col items-center justify-center min-w-[100px]
        ${activeTab === id 
          ? 'border-ink text-ink bg-black/5' 
          : 'border-transparent text-inkDim hover:text-ink'}`}
      onClick={() => setActiveTab(id)}
    >
      <span className="text-lg font-bold leading-none">{labelCn}</span>
      <span className="text-[10px] uppercase tracking-widest font-normal mt-1 opacity-70">{labelEn}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-paper text-ink w-full max-w-4xl max-h-[95vh] overflow-hidden sketch-border relative flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="p-4 border-b border-ink/10 flex justify-between items-center bg-paperDark flex-none">
          <div>
            <h2 className="text-2xl font-mystical text-ink">魔法全书</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-inkDim">Grimoire</p>
          </div>
          <button 
            onClick={onClose}
            className="text-2xl font-bold hover:text-red-500 transition-colors w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink/10 overflow-x-auto flex-none w-full bg-paper">
          {myRole && <TabButton id="identity" labelCn="我的身份" labelEn="My Role" />}
          <TabButton id="overview" labelCn="胜利目标" labelEn="Objectives" />
          {activeRoleTypes.length > 0 && <TabButton id="roles" labelCn="卡牌配置" labelEn="Deck" />}
          <TabButton id="glossary" labelCn="图鉴" labelEn="Codex" />
        </div>

        {/* Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar bg-paper">
          
          {/* TAB: IDENTITY */}
          {activeTab === 'identity' && myRole && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="text-center mb-6">
                 <p className="text-xl font-bold text-ink">你的初始身份</p>
                 <p className="text-xs text-inkDim font-mono mt-1 uppercase tracking-widest">Starting Role - Identity May Change</p>
              </div>
              <div className="transform scale-100 md:scale-105 origin-top">
                {renderRoleCard(myRole, false)}
              </div>
              <div className="flex justify-center mt-6">
                 <div className="border-4 border-ink rounded-lg shadow-xl overflow-hidden relative group">
                   <img 
                      src={ROLES[myRole].imagePlaceholder} 
                      alt="Role" 
                      className="w-48 h-64 object-cover cinema-filter opacity-90 group-hover:opacity-100 transition-opacity"
                   />
                 </div>
              </div>
            </div>
          )}

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-fade-in-up">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Villager Goal */}
                <div className="sketch-border p-4 bg-blue-50 border border-blue-900/20">
                  <h3 className="text-xl font-bold text-blue-900 mb-1">村民阵营</h3>
                  <p className="text-xs font-mono text-blue-800 mb-3 border-b border-blue-900/20 pb-2">Villagers Team</p>
                  <p className="font-bold text-blue-900 text-sm mb-1">胜利条件 / Victory:</p>
                  <ul className="list-disc ml-5 text-sm space-y-1 text-blue-800">
                    <li>处决至少一名狼人。<br/><span className="text-xs opacity-50">Kill at least one Werewolf.</span></li>
                    <li>若无狼人，所有人平安。<br/><span className="text-xs opacity-50">If NO Werewolves, NO ONE dies.</span></li>
                  </ul>
                </div>

                {/* Werewolf Goal */}
                <div className="sketch-border p-4 bg-red-50 border border-red-900/20">
                  <h3 className="text-xl font-bold text-red-900 mb-1">狼人阵营</h3>
                  <p className="text-xs font-mono text-red-800 mb-3 border-b border-red-900/20 pb-2">Werewolf Team</p>
                  <p className="font-bold text-red-900 text-sm mb-1">胜利条件 / Victory:</p>
                  <ul className="list-disc ml-5 text-sm space-y-1 text-red-800">
                    <li>狼人均存活。<br/><span className="text-xs opacity-50">No Werewolf dies.</span></li>
                    <li>爪牙即使死也算赢。<br/><span className="text-xs opacity-50">Minions win if Wolves win.</span></li>
                  </ul>
                </div>

                {/* Tanner Goal */}
                <div className="sketch-border p-4 bg-amber-50 border border-amber-900/20">
                  <h3 className="text-xl font-bold text-amber-900 mb-1">皮匠</h3>
                  <p className="text-xs font-mono text-amber-800 mb-3 border-b border-amber-900/20 pb-2">Tanner (Independent)</p>
                  <p className="font-bold text-amber-900 text-sm mb-1">胜利条件 / Victory:</p>
                  <ul className="list-disc ml-5 text-sm space-y-1 text-amber-800">
                    <li>只有你死，你才赢。<br/><span className="text-xs opacity-50">You win if you die.</span></li>
                  </ul>
                </div>
              </div>

              <div className="p-4 border border-dashed border-ink/40 rounded bg-white/40">
                <h3 className="text-xl font-bold mb-2 text-ink">基础规则 / Basic Rules</h3>
                <ul className="list-disc ml-5 space-y-3 font-serif text-ink">
                  <li>
                    <strong>天亮请勿看牌：</strong> 你的身份可能在夜里被交换了。
                    <br/><span className="text-xs text-inkDim">Daybreak: DO NOT look at your card. Information is your weapon.</span>
                  </li>
                  <li>
                    <strong>投票：</strong> 讨论结束后，倒数321同时指人，票数最多者出局。
                    <br/><span className="text-xs text-inkDim">Voting: Count to 3. Point. Majority dies.</span>
                  </li>
                  <li>
                    <strong>平票：</strong> 若最高票平票，所有平票者一起死。
                    <br/><span className="text-xs text-inkDim">Ties: If max votes are tied, all tied players die.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB: ROLES (Active) */}
          {activeTab === 'roles' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="text-center mb-4 text-inkDim">
                 本局配置: {activeRoleTypes.length} 张牌 (包含3张底牌)
                 <br/><span className="text-xs opacity-60">Deck Configuration (Including 3 Center Cards)</span>
              </div>
              {uniqueRoles.map(type => renderRoleCard(type, true))}
            </div>
          )}

          {/* TAB: GLOSSARY (All) */}
          {activeTab === 'glossary' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="text-center italic mb-4 text-inkDim">
                Full Codex / 完整图鉴
              </div>
              {allRoles.map(role => renderRoleCard(role.type, false))}
            </div>
          )}

        </div>

        {/* AI Helper Footer */}
        <div className="p-4 bg-paperDark border-t border-ink/10 flex-none z-20">
           <div className="flex gap-3 items-center">
            <div className="hidden md:block">
              <div className="font-mystical text-ink text-lg leading-none">巫师</div>
              <div className="text-[10px] text-inkDim uppercase tracking-wider">The Wizard</div>
            </div>
            <input 
              type="text" 
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="向古老的灵魂提问... / Ask the spirits..."
              className="flex-1 bg-white/50 border-b border-ink/30 focus:border-ink focus:bg-white focus:outline-none p-2 font-serif text-lg text-ink placeholder-ink/40 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            />
            <Button onClick={handleAsk} disabled={loading} className="py-2 px-6" variant="secondary">
              <div className="flex flex-col items-center leading-none">
                <span>{loading ? "..." : "祈祷"}</span>
                <span className="text-[9px] uppercase mt-1 opacity-60">{loading ? "..." : "Invoke"}</span>
              </div>
            </Button>
          </div>
          {answer && (
            <div className="mt-3 text-sm p-4 bg-magic/10 text-magic border-l-2 border-magic font-serif italic animate-fade-in-up rounded-r">
              {answer}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default RuleBook;