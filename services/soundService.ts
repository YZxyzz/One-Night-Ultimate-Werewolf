export class SoundService {
  private ctx: AudioContext | null = null;
  private droneNodes: AudioNode[] = [];
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
   * Uses Sine waves for deep bass, filtered Sawtooth for texture, 
   * and a Delay feedback loop to simulate a large cavernous space.
   */
  startAmbience() {
    if (this.isAmbiencePlaying) return;
    
    // Stop any existing sounds first
    this.stopAmbience();
    
    const ctx = this.context;
    const now = ctx.currentTime;
    
    // --- Master Chain ---
    // Master Volume: Keep it subtle so voice can be heard
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.15, now + 2); // Fade in
    masterGain.connect(ctx.destination);

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
    delay.connect(masterGain);

    // --- Oscillators (The Sound Source) ---
    
    // Chord: A Minor (A2, C3, E3) with a deep bass root (A1)
    // Frequencies: A1=55, A2=110, C3=130.81, E3=164.81
    const frequencies = [55, 110, 130.81];

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Type: Sine is deep and smooth. Triangle adds a bit of mystery.
      osc.type = i === 0 ? 'sine' : 'triangle'; 
      osc.frequency.value = freq;

      // Filter: Lowpass to remove harshness, making it sound "distant"
      filter.type = 'lowpass';
      filter.frequency.value = 400; // Start dark

      // LFO for "Breathing" effect (modulates filter cutoff)
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.1 + (Math.random() * 0.1); // Slow breath (10s period)
      
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 150; // Modulate filter by +/- 150Hz

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      // Wiring
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain); // Dry signal
      gain.connect(delay);      // Wet signal (to reverb/delay)

      // Start
      osc.start(now);
      lfo.start(now);

      // Volume settings
      // Bass is louder, harmonies are quieter
      const vol = i === 0 ? 0.8 : 0.3;
      gain.gain.value = vol;

      // Keep references to stop later
      this.droneNodes.push(osc, lfo, gain, filter, lfoGain);
    });

    this.droneNodes.push(masterGain, delay, feedback, delayFilter);
    this.isAmbiencePlaying = true;
  }

  stopAmbience() {
    const now = this.context.currentTime;
    this.droneNodes.forEach(node => {
        if (node instanceof OscillatorNode) {
            try { 
              // Ramp down to avoid popping
              node.stop(now + 1); 
            } catch(e){}
        } else if (node instanceof GainNode) {
           try {
             node.gain.linearRampToValueAtTime(0, now + 1);
           } catch(e) {}
        }
        // Disconnect after fade out
        setTimeout(() => {
             try { node.disconnect(); } catch(e){}
        }, 1100);
    });
    this.droneNodes = [];
    this.isAmbiencePlaying = false;
  }

  async playAudioData(arrayBuffer: ArrayBuffer): Promise<void> {
    const ctx = this.context;
    try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        // Voice Gain (Boost volume slightly to stand out over ambience)
        const gainNode = ctx.createGain();
        gainNode.gain.value = 1.2; 
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        source.start(0);
        return new Promise((resolve) => {
          source.onended = () => resolve();
        });
    } catch (e) {
        console.error("Error playing audio buffer", e);
        return Promise.resolve();
    }
  }
}

export const soundService = new SoundService();