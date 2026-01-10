
export class SoundService {
  private ctx: AudioContext | null = null;
  private droneNodes: AudioNode[] = [];
  private masterGain: GainNode | null = null;
  private isAmbiencePlaying = false;

  get context() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx;
  }

  async init() {
    const ctx = this.context;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  /**
   * Generates a "Mysterious Void" ambience.
   */
  startAmbience() {
    if (this.isAmbiencePlaying) return;
    
    // Stop any existing sounds first
    this.stopAmbience();
    
    const ctx = this.context;
    const now = ctx.currentTime;
    
    // --- Master Chain ---
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(0.15, now + 2); // Fade in
    this.masterGain.connect(ctx.destination);

    // --- FX Chain (Delay/Echo) ---
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.4; // 400ms delay

    const feedback = ctx.createGain();
    feedback.gain.value = 0.4; // 40% feedback

    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 1200; // Dampen high frequencies on echoes

    // Connect Delay Loop
    delay.connect(feedback);
    feedback.connect(delayFilter);
    delayFilter.connect(delay);
    
    // Connect Delay to Master
    delay.connect(this.masterGain);

    // --- Oscillators (The Sound Source) ---
    const frequencies = [55, 110, 130.81];

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = i === 0 ? 'sine' : 'triangle'; 
      osc.frequency.value = freq;

      filter.type = 'lowpass';
      filter.frequency.value = 400; // Start dark

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.1 + (Math.random() * 0.1); 
      
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 150; 

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!); 
      gain.connect(delay);      

      osc.start(now);
      lfo.start(now);

      const vol = i === 0 ? 0.8 : 0.3;
      gain.gain.value = vol;

      this.droneNodes.push(osc, lfo, gain, filter, lfoGain);
    });

    this.droneNodes.push(this.masterGain, delay, feedback, delayFilter);
    this.isAmbiencePlaying = true;
  }

  stopAmbience() {
    const now = this.context.currentTime;
    // Fade out logic if masterGain exists
    if (this.masterGain) {
        try {
            this.masterGain.gain.linearRampToValueAtTime(0, now + 1);
        } catch(e) {}
    }

    this.droneNodes.forEach(node => {
        if (node instanceof OscillatorNode) {
            try { node.stop(now + 1); } catch(e){}
        }
        setTimeout(() => {
             try { node.disconnect(); } catch(e){}
        }, 1100);
    });
    this.droneNodes = [];
    this.masterGain = null;
    this.isAmbiencePlaying = false;
  }

  // --- AUDIO DUCKING (Lowers background volume when Voice plays) ---
  private fadeAmbience(targetVol: number, duration: number = 0.5) {
      if (this.masterGain && this.isAmbiencePlaying) {
          try {
              const now = this.context.currentTime;
              this.masterGain.gain.cancelScheduledValues(now);
              this.masterGain.gain.linearRampToValueAtTime(targetVol, now + duration);
          } catch(e) {}
      }
  }

  async playAudioData(arrayBuffer: ArrayBuffer): Promise<void> {
    const ctx = this.context;
    try {
        // 1. Duck Ambience (Lower Volume)
        this.fadeAmbience(0.05); // Lower to 5%

        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        // Voice Gain (Boost volume slightly)
        const gainNode = ctx.createGain();
        gainNode.gain.value = 1.5; 
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        source.start(0);
        return new Promise((resolve) => {
          source.onended = () => {
              resolve();
              // 2. Restore Ambience
              this.fadeAmbience(0.15); // Back to 15%
          };
        });
    } catch (e) {
        console.error("Error playing audio buffer", e);
        // Ensure ambience comes back even on error
        this.fadeAmbience(0.15);
        return Promise.resolve();
    }
  }
}

export const soundService = new SoundService();