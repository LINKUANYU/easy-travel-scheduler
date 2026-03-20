import type { Options } from "canvas-confetti";
import type confetti from "canvas-confetti";

let confettiLoader: Promise<typeof confetti> | null = null;

function loadConfetti() {
  if (!confettiLoader) {
    confettiLoader = import("canvas-confetti").then((mod) => mod.default);
  }
  return confettiLoader;
}

export async function burstConfetti(options?: Options) {
  if (typeof window === "undefined") return;

  const confetti = await loadConfetti();

  confetti({
    particleCount: 120,
    spread: 70,
    startVelocity: 32,
    origin: { y: 0.7 },
    ...options,
  });
}

export async function celebrateDoubleBurst() {
  await burstConfetti({
    angle: 60,
    origin: { x: 0.12, y: 0.75 },
  });

  await burstConfetti({
    angle: 120,
    origin: { x: 0.88, y: 0.75 },
  });
}
