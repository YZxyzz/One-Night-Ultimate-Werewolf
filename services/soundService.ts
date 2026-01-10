
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
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  /**
   * Generates a "Medieval Mystical" drone ambience.
   * Simulates a dark organ/string section using Sawtooth/Triangle waves with filtering.
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
    this.masterGain.gain.linearRampToValueAtTime(0.2, now + 4); // Slow fade in (4s)
    this.masterGain.connect(ctx.destination);

    // --- Musical Drone Construction (D Minor ish for dark vibe) ---
    // Frequencies: D2 (73.42), A2 (110), D3 (146.83), F3 (174.61)
    const freqs = [73.42, 110.00, 146.83, 174.61]; 

    freqs.forEach((f, i) => {
        // Create 2 oscillators per note for "Chorusing" effect (richer sound)
        for (let j = 0; j < 2; j++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            // Sawtooth sounds like strings/brass, Triangle sounds like flute/organ
            osc.type = i === 0 ? 'sawtooth' : 'triangle'; 
            
            // Detune slightly for thickness (Simulates multiple instruments)
            const detune = (Math.random() * 10) - 5; 
            osc.frequency.value = f;
            osc.detune.value = detune;

            // Lowpass filter to remove harshness, making it sound distant/muffled
            filter.type = 'lowpass';
            filter.Q.value = 1;
            filter.frequency.value = 200 + (Math.random() * 150); // Very muffled tone

            // LFO to modulate filter (simulate breathing/movement/wind)
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.05 + (Math.random() * 0.05); // Very slow speed
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 50; // Modulate filter cutoff

            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);

            // Routing
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain!);

            // Volume balance: Root notes louder, higher notes quieter
            const baseVol = (1 / (i + 1)) * 0.3; 
            gain.gain.value = baseVol;

            osc.start(now);
            lfo.start(now);

            this.droneNodes.push(osc, lfo, gain, filter, lfoGain);
        }
    });

    // Add a sub-bass rumble
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.value = 36.71; // D1 (Deep bass)
    subGain.gain.value = 0.4;
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    this.droneNodes.push(subOsc, subGain);

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
    // Ensure Context is running (Fix for Chrome Autoplay policy)
    if (this.context.state === 'suspended') {
        await this.context.resume();
    }

    const ctx = this.context;
    
    try {
        // 1. Duck Ambience (Lower Volume smoothly)
        this.fadeAmbience(0.05); // Lower to 5%

        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        // Voice Gain (Boost volume/Presence)
        const gainNode = ctx.createGain();
        gainNode.gain.value = 1.5; // Louder voice
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        return new Promise((resolve) => {
          source.start(0);
          source.onended = () => {
              // 2. Restore Ambience
              this.fadeAmbience(0.2); // Restore to original volume
              resolve();
          };
        });
    } catch (e) {
        console.error("Error playing audio buffer", e);
        this.fadeAmbience(0.2);
        return Promise.resolve();
    }
  }
}

export const soundService = new SoundService();
