
export class SoundService {
  private ctx: AudioContext | null = null;
  private droneNodes: AudioNode[] = [];
  private masterGain: GainNode | null = null;
  private isAmbiencePlaying = false;

  get context() {
    if (!this.ctx) {
      // @ts-ignore
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.ctx;
  }

  async init() {
    const ctx = this.context;
    
    // 1. Force Resume (Standard)
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn("AudioContext resume failed", e);
      }
    }

    // 2. Silent Warmup (Critical for Mobile/Strict Browsers)
    // Plays a tiny silent buffer to force the audio engine into 'running' state immediately.
    try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
    } catch(e) {
        console.warn("Warmup buffer failed", e);
    }
  }

  /**
   * Generates a "Medieval Mystical" drone ambience with Echo.
   */
  startAmbience() {
    if (this.isAmbiencePlaying) return;
    
    // Ensure context is ready
    this.init();

    // Stop any existing sounds first
    this.stopAmbience();
    
    const ctx = this.context;
    const now = ctx.currentTime;
    
    // --- Master Chain ---
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(0.3, now + 4); // Fade in
    this.masterGain.connect(ctx.destination);

    // --- Echo/Reverb Effect (The "Ethereal" touch) ---
    // Creates a sense of space/dungeon
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.4; // 400ms echo
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.4; // 40% decay
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 800; // Dampen echoes

    // Routing: Master -> Delay -> Filter -> Feedback -> Delay -> Master
    this.masterGain.connect(delay);
    delay.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delay);
    delayFilter.connect(ctx.destination);

    // --- Musical Drone Construction (D Minor / Mystical) ---
    // Frequencies: D2 (73.42), A2 (110), D3 (146.83)
    const freqs = [73.42, 110.00, 146.83]; 

    freqs.forEach((f, i) => {
        // Create 2 oscillators per note for "Chorusing"
        for (let j = 0; j < 2; j++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = i === 0 ? 'sawtooth' : 'triangle'; 
            
            // Detune slightly for thick sound
            const detune = (Math.random() * 12) - 6; 
            osc.frequency.value = f;
            osc.detune.value = detune;

            // Lowpass filter (Muffled, distant sound)
            filter.type = 'lowpass';
            filter.Q.value = 1;
            filter.frequency.value = 180 + (Math.random() * 100); 

            // LFO to modulate filter (Breathing effect)
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.05 + (Math.random() * 0.04); // Slow
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 40; 

            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);

            // Routing
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain!);

            const baseVol = (1 / (i + 1)) * 0.25; 
            gain.gain.value = baseVol;

            osc.start(now);
            lfo.start(now);

            this.droneNodes.push(osc, lfo, gain, filter, lfoGain);
        }
    });

    // Sub-bass (Deep rumble)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.value = 36.71; 
    subGain.gain.value = 0.3;
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    this.droneNodes.push(subOsc, subGain);

    // Keep references for cleanup
    this.droneNodes.push(delay, delayFeedback, delayFilter);

    this.isAmbiencePlaying = true;
  }

  stopAmbience() {
    const now = this.context.currentTime;
    // Fade out logic
    if (this.masterGain) {
        try {
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
            this.masterGain.gain.linearRampToValueAtTime(0, now + 2);
        } catch(e) {}
    }

    // Cleanup nodes after fade
    setTimeout(() => {
        this.droneNodes.forEach(node => {
            if (node instanceof OscillatorNode) {
                try { node.stop(); } catch(e){}
            }
            try { node.disconnect(); } catch(e){}
        });
        if (this.masterGain) this.masterGain.disconnect();
        this.droneNodes = [];
        this.masterGain = null;
    }, 2100);
    
    this.isAmbiencePlaying = false;
  }

  // --- AUDIO DUCKING (Lowers background volume when Voice plays) ---
  private fadeAmbience(targetVol: number, duration: number = 0.8) {
      if (this.masterGain && this.isAmbiencePlaying) {
          try {
              const now = this.context.currentTime;
              this.masterGain.gain.cancelScheduledValues(now);
              this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
              this.masterGain.gain.linearRampToValueAtTime(targetVol, now + duration);
          } catch(e) {}
      }
  }

  async playAudioData(arrayBuffer: ArrayBuffer): Promise<void> {
    // FORCE RESUME: Last ditch effort
    if (this.context.state === 'suspended') {
        try { await this.context.resume(); } catch(e) {}
    }

    const ctx = this.context;
    
    try {
        // 1. Duck Ambience
        this.fadeAmbience(0.05); 

        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        // Voice Gain
        const gainNode = ctx.createGain();
        gainNode.gain.value = 1.8; // Boost voice volume
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        return new Promise((resolve) => {
          source.start(0);
          source.onended = () => {
              // 2. Restore Ambience
              this.fadeAmbience(0.3); 
              resolve();
          };
        });
    } catch (e) {
        console.error("Error playing audio buffer", e);
        this.fadeAmbience(0.3);
        return Promise.resolve();
    }
  }
}

export const soundService = new SoundService();
