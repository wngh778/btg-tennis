import { useRef, useState } from 'react';
import type { Session, Match, SessionGroup } from '../../../types';
import { formatDate } from '../../../utils/formatting';
import { shareElementAsPng } from '../../../utils/shareImage';
import { SimpleBracketList } from '../SimpleBracketList';

interface SimpleViewModalProps {
  session: Session;
  matches: Match[];
  groups: SessionGroup[];
  onClose: () => void;
}

export function SimpleViewModal({ session, matches, groups, onClose }: SimpleViewModalProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!captureRef.current) return;
    setSharing(true);
    try {
      await shareElementAsPng(captureRef.current, session.title ?? formatDate(session.date));
    } catch {
      alert('이미지 저장에 실패했습니다');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 (캡처 제외) */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 shrink-0">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">닫기</button>
          <button
            disabled={sharing}
            onClick={handleShare}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-40"
          >
            {sharing ? '처리중…' : '이미지 공유'}
          </button>
        </div>

        {/* 이미지 캡처 대상 */}
        <div ref={captureRef} className="flex-1 overflow-y-auto bg-white rounded-b-2xl">
          <SimpleBracketList session={session} matches={matches} groups={groups} />
        </div>
      </div>
    </div>
  );
}
