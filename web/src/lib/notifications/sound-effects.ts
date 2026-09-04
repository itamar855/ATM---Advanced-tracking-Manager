/**
 * Sintetizador e reprodutor de sons de notificação para ATM PRO.
 * Reproduz arquivos de áudio de alta fidelidade (WAV/MP3/Base64) ou sintetiza via Web Audio API.
 */

export function playNotificationSound(soundType: string = "chaching", customUrl?: string) {
  if (typeof window === "undefined" || soundType === "silent") return;

  // 1. Se for som personalizado ou URL direta
  const directUrl = (soundType === "custom" && customUrl)
    ? customUrl
    : soundType === "custom"
    ? "/api/v1/notifications/sound"
    : soundType.startsWith("data:audio") || soundType.startsWith("http") || soundType.startsWith("/")
    ? soundType
    : null;

  if (directUrl) {
    try {
      const audio = new Audio(directUrl);
      audio.volume = 0.9;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          synthesizeSound(soundType);
        });
      }
      return;
    } catch {
      // Fallback para síntese Web Audio
    }
  }

  // 2. Tenta reproduzir os arquivos de áudio de alta fidelidade gerados
  const soundFileMap: Record<string, string> = {
    chaching: "/sounds/chaching.wav",
    safe_coins: "/sounds/safe-coins.wav",
    coin: "/sounds/safe-coins.wav",
    bell: "/sounds/bell.wav",
    subtle: "/sounds/bell.wav",
    default: "/sounds/chaching.wav",
  };

  const wavFile = soundFileMap[soundType];
  if (wavFile) {
    try {
      const audio = new Audio(wavFile);
      audio.volume = 0.9;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          return;
        }).catch(() => {
          synthesizeSound(soundType);
        });
        return;
      }
    } catch {
      // Fallback para sintetizador Web Audio API abaixo
    }
  }

  synthesizeSound(soundType);
}

function synthesizeSound(soundType: string) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (soundType === "safe_coins" || soundType === "coin") {
      // Moedas caindo no cofre (Ressonância metálica profunda + moedas)
      const safeOsc = ctx.createOscillator();
      const safeGain = ctx.createGain();
      safeOsc.type = "sine";
      safeOsc.frequency.setValueAtTime(180, now);
      safeOsc.frequency.exponentialRampToValueAtTime(110, now + 0.4);
      safeGain.gain.setValueAtTime(0.35, now);
      safeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      safeOsc.connect(safeGain);
      safeGain.connect(ctx.destination);
      safeOsc.start(now);
      safeOsc.stop(now + 0.5);

      const coinFrequencies = [2800, 3400, 3100, 3900, 3600];
      coinFrequencies.forEach((freq, i) => {
        const coinStart = now + 0.06 * (i + 1);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, coinStart);
        osc.frequency.setValueAtTime(freq * 1.25, coinStart + 0.04);
        gain.gain.setValueAtTime(0.3, coinStart);
        gain.gain.exponentialRampToValueAtTime(0.001, coinStart + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(coinStart);
        osc.stop(coinStart + 0.35);
      });

    } else if (soundType === "bell" || soundType === "subtle") {
      // Sino de Ouro
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1318.5, now); // E6
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.7);

    } else {
      // Caixa Registradora (Cha-Ching)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(987.77, now);
      osc1.frequency.exponentialRampToValueAtTime(1318.51, now + 0.08);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1975.53, now + 0.1);
      gain2.gain.setValueAtTime(0.5, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.8);
    }
  } catch (err) {
    console.warn("[Sound Effect] Falha na síntese de áudio:", err);
  }
}
