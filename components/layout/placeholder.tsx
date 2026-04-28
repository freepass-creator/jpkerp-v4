export function Placeholder({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="workspace-main flex items-center justify-center">
      <div className="text-center">
        <div className="text-medium text-sub">{title}</div>
        <div className="text-weak mt-1">준비중</div>
        {hint && <div className="text-weak mt-2">{hint}</div>}
      </div>
    </div>
  );
}
