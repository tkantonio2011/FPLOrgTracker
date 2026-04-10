export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#37003c] flex items-center justify-center p-4">
      {children}
    </div>
  );
}
