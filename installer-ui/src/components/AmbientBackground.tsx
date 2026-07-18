import { motion } from "framer-motion";

/** Ambient background: radial glows + starfield-ish particles */
export function AmbientBackground() {
  const particles = Array.from({ length: 42 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 6,
    dur: 6 + Math.random() * 8,
    opacity: 0.15 + Math.random() * 0.55
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[18px]">
      {/* base radial */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 600px at 12% 8%, rgba(139,124,255,.28), transparent 55%)," +
            "radial-gradient(700px 500px at 90% 90%, rgba(75,53,255,.28), transparent 55%)," +
            "radial-gradient(500px 500px at 60% 40%, rgba(117,104,255,.12), transparent 60%)"
        }}
      />
      {/* grid */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,124,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(139,124,255,.35) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)"
        }}
      />
      {/* moving conic light */}
      <div className="absolute -top-1/3 -right-1/3 h-[900px] w-[900px] spin-slow opacity-40"
           style={{ background: "conic-gradient(from 0deg at 50% 50%, rgba(139,124,255,0) 0deg, rgba(139,124,255,.35) 60deg, rgba(75,53,255,.15) 120deg, transparent 220deg)" }}
      />
      {/* particles */}
      {particles.map(p => (
        <motion.span
          key={p.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size, height: p.size,
            filter: "blur(.5px)",
            boxShadow: "0 0 8px rgba(176,166,255,.9)"
          }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, p.opacity, 0], y: [-6, -18, -6] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
