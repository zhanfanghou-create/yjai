import mascot from "../assets/mascot.png";
import { motion } from "framer-motion";

interface Props {
  size?: number;
  variant?: "pedestal" | "hologram" | "celebrate";
  className?: string;
}

/** IP mascot standing on a futuristic hover pedestal */
export function MascotDisplay({ size = 300, variant = "pedestal", className = "" }: Props) {
  return (
    <div className={"relative flex items-end justify-center " + className}
         style={{ width: size + 80, height: size + 120 }}>
      {/* purple halo */}
      <div className="absolute left-1/2 top-6 -translate-x-1/2"
           style={{ width: size * 0.9, height: size * 0.9 }}>
        <div className="absolute inset-0 rounded-full opacity-70 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(139,124,255,.75), transparent 60%)" }}/>
        <div className="absolute inset-6 rounded-full opacity-60 blur-2xl"
             style={{ background: "radial-gradient(circle, rgba(75,53,255,.6), transparent 65%)" }}/>
      </div>

      {/* rotating ring */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[52%]"
           style={{ width: size * 1.15, height: size * 1.15 }}>
        <div className="absolute inset-0 rounded-full border border-brand-400/25 spin-slow"/>
        <div className="absolute inset-6 rounded-full border border-brand-400/15 spin-slow" style={{ animationDirection: "reverse" as any }}/>
      </div>

      {/* mascot */}
      <motion.img
        src={mascot}
        alt="AI mascot"
        className="relative z-10 select-none drop-shadow-[0_10px_40px_rgba(117,104,255,.5)]"
        style={{ height: size, width: "auto" }}
        animate={{ y: [-6, 6, -6] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        draggable={false}
      />

      {/* pedestal */}
      {variant !== "hologram" && <Pedestal width={size * 0.9} />}

      {variant === "celebrate" && <Celebrate />}
      {variant === "hologram" && <Hologram size={size} />}
    </div>
  );
}

function Pedestal({ width }: { width: number }) {
  return (
    <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2"
         style={{ width, height: 46 }}>
      {/* base ellipse */}
      <div className="absolute inset-x-0 top-1 h-8 rounded-[50%]"
           style={{
             background: "radial-gradient(ellipse at center, rgba(139,124,255,.55), rgba(75,53,255,.25) 55%, transparent 70%)",
             filter: "blur(2px)"
           }}/>
      <div className="absolute inset-x-6 top-3 h-4 rounded-[50%] border border-brand-400/40"/>
      <div className="absolute inset-x-16 top-6 h-2 rounded-[50%] bg-brand-gradient opacity-70 blur-[1px]"/>
      {/* tick marks */}
      <div className="absolute inset-x-0 top-5 flex justify-between px-4 opacity-70">
        {Array.from({length: 12}).map((_, i) =>
          <span key={i} className="h-2 w-px bg-brand-300/50"/>
        )}
      </div>
    </div>
  );
}

function Hologram({ size }: { size: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {[...Array(4)].map((_, i) => (
        <div key={i}
             className="absolute left-1/2 -translate-x-1/2 rounded-full border border-brand-400/30"
             style={{
               bottom: 20 + i * 10,
               width: size * (0.6 + i * 0.15),
               height: 10 + i * 4,
               opacity: 0.6 - i * 0.1,
               filter: "blur(.5px)"
             }}
        />
      ))}
    </div>
  );
}

function Celebrate() {
  const parts = Array.from({length: 30}).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2.4,
    hue: 240 + Math.random() * 60,
    size: 3 + Math.random() * 4
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {parts.map(p => (
        <motion.span
          key={p.id}
          className="absolute top-4 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: `hsl(${p.hue}, 85%, 70%)`,
            boxShadow: `0 0 10px hsl(${p.hue},90%,70%)`
          }}
          initial={{ y: -20, opacity: 0, rotate: 0 }}
          animate={{ y: 380, opacity: [0, 1, 1, 0], rotate: 380 }}
          transition={{ duration: 4.5, delay: p.delay, repeat: Infinity, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
