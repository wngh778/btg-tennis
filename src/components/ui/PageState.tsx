export function LoadingState({ message = '불러오는 중...' }: { message?: string }) {
  return (
    <div className="text-center py-16 text-slate-500">{message}</div>
  );
}

export function ErrorState({ error }: { error: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-red-500 font-medium mb-2">오류가 발생했습니다</p>
      <p className="text-slate-500 text-sm break-all max-w-lg mx-auto">{error}</p>
    </div>
  );
}
