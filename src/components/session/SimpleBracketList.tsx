import type { Session, Match, SessionGroup, Player } from '../../types';
import { formatDate } from '../../utils/formatting';

// 간단히 보기 / 공개 링크에서 공용으로 쓰는 담백한 대진 리스트.
// 이미지 캡처 대상이므로 배경 밴드·보더 없이 최소한의 구분선만 사용.

interface SimpleBracketListProps {
  session: Session;
  matches: Match[];
  groups: SessionGroup[];
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
      <span className="text-[11px] font-bold text-slate-400 tracking-wide">{label}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

function MatchRow({ match, label }: { match: Match; label: (p: Player) => string }) {
  return (
    <div className="grid grid-cols-[1fr_44px_1fr] items-center px-4 py-[3px] text-[13px] leading-snug">
      <span className="text-slate-800 text-right truncate">
        {label(match.team1.player1)} {label(match.team1.player2)}
      </span>
      <span className={`text-center tabular-nums ${match.isCompleted ? 'font-bold text-slate-900' : 'text-[11px] text-slate-300'}`}>
        {match.isCompleted ? `${match.score1}:${match.score2}` : 'vs'}
      </span>
      <span className="text-slate-800 truncate">
        {label(match.team2.player1)} {label(match.team2.player2)}
      </span>
    </div>
  );
}

export function SimpleBracketList({ session, matches, groups }: SimpleBracketListProps) {
  const isGroupMode = session.gameMode === 'group' && groups.length > 0;

  return (
    <div className="bg-white pb-3">
      {/* 타이틀 */}
      <div className="pt-3 pb-1.5 text-center">
        <span className="font-bold text-slate-900 text-sm">{session.title ?? formatDate(session.date)}</span>
        {session.title && (
          <div className="text-[11px] text-slate-400 mt-0.5">{formatDate(session.date)}</div>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">대진표가 없습니다.</div>
      ) : isGroupMode ? (
        groups.map(group => {
          const groupMatches = [...matches]
            .filter(m => m.groupId === group.id)
            .sort((a, b) => a.round - b.round || a.court - b.court);
          if (groupMatches.length === 0) return null;
          const numMap = new Map(group.memberIds.map((id, i) => [id, i + 1]));
          const label = (p: Player) => {
            const n = numMap.get(p.id);
            return n ? `${n}${p.name}` : p.name;
          };
          return (
            <div key={group.id}>
              <SectionHeader label={group.name} />
              {groupMatches.map(m => <MatchRow key={m.id} match={m} label={label} />)}
            </div>
          );
        })
      ) : (
        [...new Set(matches.map(m => m.round))].sort((a, b) => a - b).map(round => (
          <div key={round}>
            <SectionHeader label={`${round}R`} />
            {matches
              .filter(m => m.round === round)
              .sort((a, b) => a.court - b.court)
              .map(m => <MatchRow key={m.id} match={m} label={p => p.name} />)}
          </div>
        ))
      )}
    </div>
  );
}
