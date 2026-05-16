export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#0d1117' }}>
      {children}
    </div>
  )
}
