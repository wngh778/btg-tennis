import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type { Session, Match, SessionGroup, Player } from '../../../types';
import { formatDate } from '../../../utils/formatting';

interface SimpleViewModalProps {
  session: Session;
  matches: Match[];
  groups: SessionGroup[];
  onClose: () => void;
}

export function SimpleViewModal({ session, matches, groups, onClose }: SimpleViewModalProps) {
  const simpleViewCardRef = useRef<HTMLDivElement>(null);
  const [sharingImage, setSharingImage] = useState(false);

  const handleShare = async () => {
    if (!simpleViewCardRef.current) return;
    setSharingImage(true);
    try {
      const el = simpleViewCardRef.current;
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: el.offsetWidth,
        height: el.scrollHeight,
        style: { overflow: 'visible', height: `${el.scrollHeight}px` },
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'bracket.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: session.title ?? formatDate(session.date) });
      } else if (navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        alert('이미지가 클립보드에 복사되었습니다');
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'bracket.png';
        a.click();
      }
    } catch {
      alert('이미지 저장에 실패했습니다');
    } finally {
      setSharingImage(false);
    }
  };

  const pLabel = (p: Player, numMap: Map<string, number>) => {
    const n = numMap.get(p.id);
    return n ? `${n}${p.name}` : p.name;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 (캡처 제외) */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 shrink-0">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">닫기</button>
          <span className="font-bold text-slate-800 text-sm">
            {session.title ?? formatDate(session.date)}
          </span>
          <button
            disabled={sharingImage}
            onClick={handleShare}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-40"
          >
            {sharingImage ? '처리중…' : '이미지 공유'}
          </button>
        </div>

        {/* 경기 목록 — 이미지 캡처 대상 (타이틀 포함) */}
        <div ref={simpleViewCardRef} className="flex-1 overflow-y-auto bg-white">
          {/* 캡처 이미지용 타이틀 바 */}
          <div className="px-3 py-2 text-center bg-white border-b border-slate-100">
            <span className="font-bold text-slate-800 text-sm">{session.title ?? formatDate(session.date)}</span>
          </div>
          {session.gameMode === 'group' && groups.length > 0 ? (
            groups.map(group => {
              const groupMatches = [...matches]
                .filter(m => m.groupId === group.id)
                .sort((a, b) => a.round - b.round || a.court - b.court);
              if (groupMatches.length === 0) return null;
              const playerNumMap = new Map<string, number>();
              group.memberIds.forEach((id, i) => playerNumMap.set(id, i + 1));
              return (
                <div key={group.id}>
                  <div className="px-3 py-1 bg-slate-100 border-b border-slate-200">
                    <span className="font-bold text-slate-700 text-xs">{group.name}</span>
                  </div>
                  {groupMatches.map(m => (
                    <div key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center px-2 py-0.5 border-b border-slate-50 text-xs leading-tight">
                      <span className="text-slate-700 truncate text-right pr-1">{pLabel(m.team1.player1, playerNumMap)} {pLabel(m.team1.player2, playerNumMap)}</span>
                      <span className="font-bold text-slate-800 px-1 shrink-0 tabular-nums text-center">
                        {m.isCompleted ? `${m.score1}:${m.score2}` : 'vs'}
                      </span>
                      <span className="text-slate-700 truncate pl-1">{pLabel(m.team2.player1, playerNumMap)} {pLabel(m.team2.player2, playerNumMap)}</span>
                    </div>
                  ))}
                </div>
              );
            })
          ) : (
            (() => {
              const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
              return rounds.map(round => {
                const roundMatches = matches
                  .filter(m => m.round === round)
                  .sort((a, b) => a.court - b.court);
                return (
                  <div key={round}>
                    <div className="px-3 py-1 bg-slate-100 border-b border-slate-200">
                      <span className="font-bold text-slate-700 text-xs">{round}R</span>
                    </div>
                    {roundMatches.map(m => (
                      <div key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center px-2 py-0.5 border-b border-slate-50 text-xs leading-tight">
                        <span className="text-slate-700 truncate text-right pr-1">{m.team1.player1.name} {m.team1.player2.name}</span>
                        <span className="font-bold text-slate-800 px-1 shrink-0 tabular-nums text-center">
                          {m.isCompleted ? `${m.score1}:${m.score2}` : 'vs'}
                        </span>
                        <span className="text-slate-700 truncate pl-1">{m.team2.player1.name} {m.team2.player2.name}</span>
                      </div>
                    ))}
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>
    </div>
  );
}
