type BadgeColor = 'green' | 'blue' | 'pink' | 'purple' | 'yellow' | 'orange' | 'slate' | 'amber' | 'red';

const colorMap: Record<BadgeColor, string> = {
  green:  'bg-green-100 text-green-700',
  blue:   'bg-blue-100 text-blue-700',
  pink:   'bg-pink-100 text-pink-700',
  purple: 'bg-purple-100 text-purple-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-600',
  slate:  'bg-slate-100 text-slate-500',
  amber:  'bg-amber-100 text-amber-700',
  red:    'bg-red-100 text-red-600',
};

export default function Badge({
  children, color = 'slate', className = ''
}: {
  children: React.ReactNode;
  color?: BadgeColor;
  className?: string;
}) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[color]} ${className}`}>
      {children}
    </span>
  );
}
