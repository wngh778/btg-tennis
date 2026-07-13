import { toPng } from 'html-to-image';

// DOM 요소를 PNG로 캡처해 공유한다.
// 1) 모바일: OS 공유 시트 (navigator.share)
// 2) 데스크톱: 클립보드 복사 (카톡 PC 등에 Ctrl+V로 붙여넣기)
// 3) 폴백: PNG 파일 다운로드 — 어떤 환경에서도 동작 보장
export async function shareElementAsPng(el: HTMLElement, title: string): Promise<void> {
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    width: el.offsetWidth,
    height: el.scrollHeight,
    style: { overflow: 'visible', height: `${el.scrollHeight}px` },
  });
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], 'bracket.png', { type: 'image/png' });

  // 1) 모바일 공유 시트
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      // 사용자가 공유 시트를 닫은 경우는 정상 종료
      if (e instanceof Error && e.name === 'AbortError') return;
      // 그 외 실패 시 아래 데스크톱 경로로 폴백
    }
  }

  // 2) 데스크톱 클립보드 복사
  if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      alert('이미지가 클립보드에 복사되었습니다.\n붙여넣기(Ctrl+V / Cmd+V)로 공유하세요.');
      return;
    } catch {
      // Safari/Firefox 등 제약 환경 → 다운로드로 폴백
    }
  }

  // 3) 파일 다운로드 (최종 폴백)
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${title.replace(/[\\/:*?"<>|]/g, '').trim() || 'bracket'}.png`;
  a.click();
}
