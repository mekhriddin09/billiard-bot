/**
 * Har qanday bo'sh ro'yxat/natija uchun bitta umumiy komponent.
 * Ohang doim tinch va yo'naltiruvchi — hech qachon xato ohangida emas.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center animate-fade-in">
      <div className="text-4xl">{icon}</div>
      <div className="mt-4 text-base font-extrabold text-foreground">{title}</div>
      {description && (
        <div className="mt-1.5 max-w-[240px] text-sm text-surfaceMuted-foreground">{description}</div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
