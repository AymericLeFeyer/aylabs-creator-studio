import { useEffect, useRef } from 'react';

interface ConfettiProps {
  /** Passe à `true` pour lancer un tir. Repasser à `false` puis `true` en relance un. */
  active: boolean;
  onDone?: () => void;
}

/** Durée d'un tir. Assez pour se voir, assez court pour ne pas retarder le geste suivant. */
const DURATION_MS = 2400;
const COUNT = 140;
const GRAVITY = 0.12;

/**
 * Les couleurs du thème plutôt qu'un arc-en-ciel générique : la fête reste dans
 * l'univers de l'outil.
 */
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
}

/**
 * Un tir de confettis, en canvas et sans dépendance.
 *
 * Publier une vidéo est le seul moment de l'outil qui mérite d'être fêté : tout le reste
 * est de la comptabilité et de la planification. Une bibliothèque de 15 ko pour trois
 * secondes d'animation ne se justifiait pas — cent quarante rectangles qui tombent, ça
 * s'écrit en cinquante lignes.
 *
 * Le canvas est `pointer-events-none` et en position fixe : il recouvre l'écran sans
 * jamais intercepter un clic, et se démonte de lui-même à la fin.
 */
export const Confetti = ({ active, onDone }: ConfettiProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    // Deux gerbes parties des coins bas, comme des canons à confettis : un jet unique
    // depuis le haut ressemble à de la pluie, pas à une célébration.
    const particles: Particle[] = Array.from({ length: COUNT }, (_, index) => {
      const fromLeft = index % 2 === 0;
      const angle = (fromLeft ? -1 : 1) * (Math.PI / 4 + Math.random() * (Math.PI / 6));
      const speed = 14 + Math.random() * 10;
      return {
        x: fromLeft ? 0 : width,
        y: height,
        vx: Math.sin(angle) * speed,
        vy: -Math.abs(Math.cos(angle)) * speed,
        size: 5 + Math.random() * 6,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: COLORS[index % COLORS.length]!,
      };
    });

    const start = performance.now();
    let frame = 0;

    const render = (now: number) => {
      const elapsed = now - start;
      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += GRAVITY * 3;
        particle.vx *= 0.995;
        particle.rotation += particle.spin;

        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        // Les particules s'effacent sur le dernier tiers : une disparition nette
        // ressemblerait à un bug d'affichage.
        context.globalAlpha = Math.max(
          0,
          1 - Math.max(0, elapsed - DURATION_MS * 0.6) / (DURATION_MS * 0.4),
        );
        context.fillStyle = particle.color;
        context.fillRect(
          -particle.size / 2,
          -particle.size / 2,
          particle.size,
          particle.size * 0.6,
        );
        context.restore();
      }

      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(render);
      } else {
        context.clearRect(0, 0, width, height);
        onDone?.();
      }
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [active, onDone]);

  if (!active) return null;

  return (
    <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[100]" />
  );
};
