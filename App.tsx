import React, { useState, useEffect, useRef } from 'react';
import { GameState, Message, Speaker, TurnResponse, CaseFile } from './types';
import { startInterrogation, sendPlayerResponse, streamDetectiveAudio } from './services/geminiService';
import DetectivePortrait from './components/DetectivePortrait';
import Typewriter from './components/Typewriter';
import SuspectPhoto from './components/SuspectPhoto';

const HARRIS_PROFILE = { name: 'Harris', role: 'Bad Cop' as const, description: 'Aggressive', color: 'text-red-500' };
const MOORE_PROFILE = { name: 'Moore', role: 'Good Cop' as const, description: 'Analytical', color: 'text-blue-500' };

// --- CASE FILES ---
const CASES: CaseFile[] = [
  {
    id: 'case_294b',
    title: 'THE NIGHT SHIFT',
    type: 'ARMED ROBBERY',
    timestamp: '21:40',
    description: "A convenience store was robbed. You match the suspect's description. You were home alone watching TV, but can you prove it?",
    difficulty: 'Normal',
    crime: 'Convenience store robbery',
    suspectDescription: 'Dark hoodie, average build, fled on foot',
    witnessEvidence: 'Witness saw someone matching description near store at 21:35',
    circumstantialEvidence: 'No alibi witness. Player lives 2 blocks away.',
    actualTruth: 'INNOCENT. Was home alone watching a specific TV show.',
    openingLine: "We know you did it. The clerk saw the hoodie. Just confess and make it easier."
  },
  {
    id: 'case_891l',
    title: 'ECHO POINT',
    type: 'HOMICIDE',
    timestamp: '02:15',
    description: "Your wife was found at the bottom of the cliffs. You say she slipped. The police found your boot prints at the edge.",
    difficulty: 'Hard',
    crime: 'Murder (pushed off cliff)',
    suspectDescription: 'Spouse of victim, present at scene',
    witnessEvidence: 'None. But arguments were heard earlier that night by neighbors.',
    circumstantialEvidence: 'Boot prints matching suspect found at the edge. Life insurance policy recently increased.',
    actualTruth: 'INNOCENT. She slipped while taking a selfie. You tried to grab her (hence boot prints).',
    openingLine: "She didn't just 'slip', did she? People don't just fall off Echo Point. Tell me why you pushed her."
  },
  {
    id: 'case_102x',
    title: 'OPERATION MIDAS',
    type: 'KIDNAPPING',
    timestamp: '11:00',
    description: "A tech CEO has vanished. You drive a van matching the one seen at the abduction. The police found mud on your tires and a large cash deposit in your account.",
    difficulty: 'Extreme',
    crime: 'Kidnapping for ransom',
    suspectDescription: 'Driver of a white maintenance van',
    witnessEvidence: 'Security camera saw a van like yours leaving the scene.',
    circumstantialEvidence: 'Mud on tires matches the hideout location. Large cash deposit in bank account.',
    actualTruth: 'INNOCENT. You were doing an unreported cash job (contractor work) in the woods near the hideout location.',
    openingLine: "We have the van on camera! We know you have him. Where is he?!"
  }
];

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.DISCLAIMER);
  const [selectedCase, setSelectedCase] = useState<CaseFile>(CASES[0]);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [verdict, setVerdict] = useState<{ outcome: 'GUILTY' | 'NOT GUILTY' | 'LAWYER'; text: string } | null>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<'Harris' | 'Moore' | null>(null);
  const [audioSpeaker, setAudioSpeaker] = useState<'Harris' | 'Moore' | null>(null);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Audio Output Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when it's player's turn (not loading)
  useEffect(() => {
    if (!isLoading && gameState === GameState.PLAYING && !showQuotaModal && !isRecording) {
        inputRef.current?.focus();
    }
  }, [isLoading, gameState, showQuotaModal, isRecording]);

  // --- Audio Output Engine ---
  const decodePCM = async (data: Uint8Array, ctx: AudioContext, sampleRate: number = 24000, numChannels: number = 1): Promise<AudioBuffer | null> => {
    // Safety check: ensure even byte length for Int16
    let safeData = data;
    if (data.length % 2 !== 0) {
        console.warn(`Received odd byte length PCM data (${data.length}). Trimming last byte.`);
        safeData = data.slice(0, data.length - 1);
    }

    if (safeData.length === 0) return null;

    try {
        const dataInt16 = new Int16Array(safeData.buffer, safeData.byteOffset, safeData.length / 2);
        const frameCount = dataInt16.length / numChannels;
        const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

        for (let channel = 0; channel < numChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < frameCount; i++) {
                channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
            }
        }
        return buffer;
    } catch (e) {
        console.error("Failed to create AudioBuffer from PCM data", e);
        return null;
    }
  };

  const initAudio = () => {
    if (!audioContextRef.current) {
         audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
    }
  };

  const stopAudio = () => {
      activeSourcesRef.current.forEach(source => {
          try { source.stop(); } catch(e) {}
      });
      activeSourcesRef.current = [];
      nextStartTimeRef.current = 0;
      setAudioSpeaker(null);
  };

  const playAudioStream = async (stream: AsyncGenerator<Uint8Array>, speaker: 'Harris' | 'Moore') => {
    initAudio();
    stopAudio(); 
    
    const ctx = audioContextRef.current!;
    nextStartTimeRef.current = ctx.currentTime + 0.1;
    
    let activeCount = 0;

    try {
        for await (const chunk of stream) {
            if (!chunk || chunk.length === 0) continue;
            
            const audioBuffer = await decodePCM(chunk, ctx);
            if (!audioBuffer) continue;

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            
            const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
            source.start(startAt);
            nextStartTimeRef.current = startAt + audioBuffer.duration;
            
            activeSourcesRef.current.push(source);
            activeCount++;
            
            // Update visual state to match audio
            setAudioSpeaker(speaker);

            source.onended = () => {
                activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                activeCount--;
                // Only stop the mouth animation if no more chunks are queued/playing
                if (activeCount === 0) {
                    setAudioSpeaker(null);
                }
            };
        }
    } catch (e) {
        console.error("Error playing audio stream:", e);
        setAudioSpeaker(null);
    }
  };

  // --- Audio Input Engine ---

  const startRecording = async () => {
    if (isLoading) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      stopAudio(); // Stop detectives from talking if you interrupt
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone.");
    }
  };

  const stopRecordingAndSend = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      // Clean up stream
      mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      
      // Convert to Base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        // Remove data URL prefix (e.g. "data:audio/webm;base64,")
        const base64Data = base64String.split(',')[1];
        
        await handleSendAudio(base64Data, audioBlob.type);
      };
    };

    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  // --- Game Logic ---

  const checkQuotaError = (error: any) => {
    const msg = error?.message || '';
    const code = error?.status || error?.code;
    const isQuota = code === 429 || msg.includes('429') || msg.toLowerCase().includes('quota');
    if (isQuota) {
        setShowQuotaModal(true);
    }
    return isQuota;
  };

  const handleStartGame = async () => {
    initAudio(); 
    setIsLoading(true);
    setShowQuotaModal(false);
    setGameState(GameState.PLAYING);
    setMessages([]);
    setVerdict(null);
    try {
      const turn = await startInterrogation(selectedCase);
      await processTurn(turn);
    } catch (error: any) {
      if (checkQuotaError(error)) {
         // Modal will show, do nothing else
      } else {
          console.error("Failed to start:", error);
          alert("Connection failed. Please check your API key or network.");
          setGameState(GameState.START);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendAudio = async (base64Data: string, mimeType: string) => {
    const userMsg: Message = {
        id: Date.now().toString(),
        sender: 'Player',
        text: '(( AUDIO TRANSMISSION ))',
        timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setCurrentSpeaker(null);
    setAudioSpeaker(null);
    setShowQuotaModal(false);

    try {
        const turn = await sendPlayerResponse('', base64Data, mimeType);
        await processTurn(turn);
    } catch (error: any) {
        if (checkQuotaError(error)) {
            // Modal
        } else {
            console.error("Error processing audio turn:", error);
            alert("Error sending audio. Please try text.");
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    stopAudio();

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'Player',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setCurrentSpeaker(null); 
    setAudioSpeaker(null);
    setShowQuotaModal(false);

    try {
      const turn = await sendPlayerResponse(userMsg.text);
      await processTurn(turn);
    } catch (error: any) {
      if (checkQuotaError(error)) {
        // Modal handles it
      } else {
        console.error("Error processing turn:", error);
        alert("Error contacting the detectives. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const processTurn = async (turn: TurnResponse) => {
    setCurrentSpeaker(turn.speaker);
    
    // Start streaming audio
    const audioGen = streamDetectiveAudio(turn.content, turn.speaker);
    const iterator = audioGen[Symbol.asyncIterator]();

    // Prefetch
    let firstChunk: IteratorResult<Uint8Array, any> | null = null;
    try {
        firstChunk = await iterator.next();
    } catch(e) {
        console.warn("Audio stream failed:", e);
    }

    const aiMsg: Message = {
      id: Date.now().toString(),
      sender: turn.speaker,
      text: turn.content,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, aiMsg]);

    if (firstChunk && !firstChunk.done) {
        const streamResume = async function*() {
            yield firstChunk!.value;
            let result = await iterator.next();
            while (!result.done) {
                yield result.value;
                result = await iterator.next();
            }
        };
        // Pass the speaker to the audio player to sync visuals
        playAudioStream(streamResume(), turn.speaker);
    }

    if (turn.isInterrogationOver && turn.verdict) {
      setTimeout(() => {
        setVerdict({
          outcome: turn.verdict!,
          text: turn.verdictText || "The detectives have made their decision."
        });
        setGameState(GameState.ENDING);
      }, 3000); 
    }
    
    // Ensure loading state is cleared if called from audio path
    setIsLoading(false);
  };

  // --- RENDER HELPERS ---

  const renderQuotaModal = () => {
    if (!showQuotaModal) return null;
    return (
      <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
        <div className="bg-slate-900 border-2 border-red-600/50 p-8 max-w-lg w-full text-center shadow-[0_0_30px_rgba(220,38,38,0.2)] relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent"></div>
            
            <h3 className="text-red-500 font-mono text-2xl font-bold mb-2 uppercase tracking-widest">
                System Failure
            </h3>
            
            <div className="w-16 h-1 bg-red-900/30 mx-auto mb-6"></div>
            
            <p className="text-slate-300 font-sans mb-6 text-lg">
                The interrogation API has reached its request limit. We cannot proceed with the session at this time.
            </p>
            
            <div className="bg-black/50 p-4 rounded border border-red-900/30 mb-8 inline-block">
                <p className="text-red-400 font-mono text-sm">
                    ERROR: 429_QUOTA_EXCEEDED
                </p>
            </div>

            <div>
                <button
                    onClick={() => {
                        setShowQuotaModal(false);
                        setGameState(GameState.START);
                    }}
                    className="bg-slate-800 text-slate-200 border border-slate-600 px-8 py-3 hover:bg-red-900/20 hover:text-red-200 hover:border-red-500/50 transition-all uppercase font-mono tracking-widest text-sm"
                >
                    Return to Menu
                </button>
            </div>
        </div>
      </div>
    );
  };

  const renderDisclaimerScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center animate-fade-in relative z-50">
        <div className="max-w-2xl w-full border-2 border-slate-700 bg-slate-900/95 p-8 md:p-12 shadow-2xl relative backdrop-blur-sm">
            {/* Decorative top bar */}
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/50"></div>
            <div className="absolute top-1 right-2 flex gap-1">
                <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
                <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
                <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-mono font-bold text-amber-500 mb-8 uppercase tracking-widest border-b border-slate-800 pb-4 flex items-center justify-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                SIMULATION NOTICE
            </h1>

            <div className="text-slate-300 font-sans text-lg leading-relaxed space-y-6 text-left mb-10">
                <p>
                    <strong className="text-slate-100">The Interrogation</strong> is an interactive simulation developed with two primary goals:
                </p>
                <ul className="list-disc pl-6 space-y-3 marker:text-amber-500/50">
                    <li>To provide entertainment through generative storytelling.</li>
                    <li>To spread awareness that every citizen has the <strong className="text-emerald-400 font-mono">Right to Counsel</strong> (an attorney).</li>
                </ul>
                
                <div className="bg-slate-950 p-5 border-l-4 border-red-500 rounded-r shadow-inner mt-6">
                    <div className="flex items-center gap-2 mb-2">
                        <svg className="text-red-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        <p className="text-red-400 text-xs font-mono uppercase tracking-widest font-bold">LEGAL DISCLAIMER</p>
                    </div>
                    <p className="text-slate-200 text-sm md:text-base">
                        This game is <span className="text-red-400 font-bold">NOT legal advice</span>. Real-world legal proceedings are complex. You should always consult with a qualified attorney regarding any legal matters.
                    </p>
                </div>
            </div>

            <button 
                onClick={() => setGameState(GameState.START)}
                className="w-full py-4 bg-slate-800 text-amber-500 border border-amber-500/30 hover:bg-amber-900/20 hover:border-amber-500 font-mono font-bold uppercase tracking-[0.2em] transition-all group relative overflow-hidden"
            >
                <span className="relative z-10 group-hover:text-amber-400">I Understand</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1s_infinite]"></div>
            </button>
       </div>
    </div>
  );

  const renderStartScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center animate-fade-in relative z-10 py-12">
      <div className="mb-8 p-6 md:p-10 border-2 border-slate-700 bg-slate-900/95 max-w-5xl w-full shadow-2xl backdrop-blur-sm flex flex-col items-center">
        
        {/* Title Section */}
        <h1 className="text-4xl md:text-6xl font-serif font-black text-slate-100 tracking-tighter mb-2">
          THE <span className="text-red-700">INTERROGATION</span>
        </h1>
        <div className="h-1 w-32 bg-red-800 mb-8"></div>

        {/* Case Selection Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {CASES.map((c) => {
                const isSelected = selectedCase.id === c.id;
                return (
                    <button
                        key={c.id}
                        onClick={() => setSelectedCase(c)}
                        className={`
                            relative flex flex-col text-left p-4 h-full border-2 transition-all duration-300 group
                            ${isSelected 
                                ? 'bg-amber-100 border-amber-500 transform scale-105 shadow-[0_0_20px_rgba(245,158,11,0.3)] z-10' 
                                : 'bg-[#e2e8f0] border-slate-400 opacity-60 hover:opacity-100 hover:border-slate-300'
                            }
                        `}
                    >
                        {/* Folder Tab Visual */}
                        <div className={`absolute -top-3 left-0 w-24 h-4 rounded-t-lg border-t-2 border-x-2 ${isSelected ? 'bg-amber-100 border-amber-500' : 'bg-[#e2e8f0] border-slate-400'}`}></div>

                        <div className="mb-2">
                            <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 ${isSelected ? 'bg-red-700 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                {c.difficulty}
                            </span>
                        </div>
                        
                        <h3 className={`font-mono text-xl font-bold mb-1 leading-none ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                            {c.title}
                        </h3>
                        
                        <p className={`font-sans text-[10px] uppercase tracking-wide mb-3 ${isSelected ? 'text-slate-600' : 'text-slate-500'}`}>
                            {c.type} • {c.timestamp}
                        </p>
                        
                        <div className={`w-full h-px mb-3 ${isSelected ? 'bg-slate-400' : 'bg-slate-300'}`}></div>
                        
                        <p className={`font-serif text-sm leading-snug flex-grow ${isSelected ? 'text-slate-800' : 'text-slate-600'}`}>
                            {c.description}
                        </p>

                        {isSelected && (
                            <div className="absolute top-2 right-2 text-red-600 animate-pulse">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                        )}
                    </button>
                );
            })}
        </div>

        {/* Start Button */}
        <div className="flex flex-col items-center animate-fade-in" key={selectedCase.id}>
             <p className="text-slate-400 font-mono text-xs mb-2">SELECTED FILE: {selectedCase.id.toUpperCase()}</p>
             <button 
                onClick={handleStartGame}
                disabled={isLoading}
                className="px-12 py-4 bg-red-700 text-white font-bold font-mono hover:bg-red-600 transition-all uppercase tracking-widest text-lg shadow-[0_10px_20px_rgba(0,0,0,0.5)] border border-red-500 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
             >
                {isLoading ? (
                    <span className="flex items-center gap-2">
                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                        LOADING...
                    </span>
                ) : (
                    'OPEN CASE FILE'
                )}
            </button>
        </div>

      </div>
    </div>
  );

  const renderPixelRoom = () => (
    <div className="relative w-full h-[45vh] bg-slate-800 overflow-hidden border-b-4 border-slate-950 shrink-0 perspective-1000">
        
        {/* === ROOM SHELL === */}
        {/* Back Wall - Soundproof Padding Texture */}
        <div className="absolute inset-0 bg-[#262626]" 
             style={{ 
                 backgroundImage: `
                    radial-gradient(circle at 50% 50%, #333 10%, transparent 10%), 
                    radial-gradient(circle at 50% 50%, #333 10%, transparent 10%)
                 `,
                 backgroundPosition: '0 0, 10px 10px',
                 backgroundSize: '20px 20px'
             }} 
        />
        
        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_120%)] pointer-events-none"></div>

        {/* === FURNITURE & FIXTURES === */}
        
        {/* Door (Back Left) */}
        <div className="absolute bottom-0 left-[5%] md:left-[10%] w-28 md:w-40 h-[70%] md:h-[80%] bg-[#2e3642] border-r border-t border-l border-black shadow-[5px_0_15px_rgba(0,0,0,0.5)] flex flex-col items-center pt-8">
            {/* Door Frame inset */}
            <div className="absolute inset-0 border-x-4 border-t-8 border-[#1a202c] pointer-events-none"></div>
            
            {/* Window */}
            <div className="w-16 h-20 md:w-20 md:h-24 bg-[#0f172a] border-4 border-[#1e293b] relative overflow-hidden shadow-inner mb-24">
                 <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent skew-y-12 translate-y-4"></div>
                 {/* Wire mesh effect */}
                 <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(0deg, transparent 24%, #000 25%, #000 26%, transparent 27%, transparent 74%, #000 75%, #000 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, #000 25%, #000 26%, transparent 27%, transparent 74%, #000 75%, #000 76%, transparent 77%, transparent)', backgroundSize: '10px 10px' }}></div>
            </div>

            {/* Handle */}
            <div className="absolute top-[55%] right-3 w-3 h-8 bg-[#64748b] rounded-sm shadow-sm border-l border-white/20"></div>
        </div>

        {/* Two-Way Mirror (Back Center-Right) */}
        <div className="absolute top-[15%] right-[10%] md:right-[15%] w-[45%] md:w-[40%] h-[40%] bg-[#020617] border-[12px] border-[#1e293b] shadow-2xl">
            {/* Glass Surface */}
            <div className="w-full h-full bg-gradient-to-br from-[#1e293b] to-[#0f172a] relative overflow-hidden opacity-90">
                {/* Reflections */}
                <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-gradient-to-b from-transparent via-white/5 to-transparent rotate-45 transform translate-y-10"></div>
                <div className="absolute -top-[50%] -left-[30%] w-[200%] h-[200%] bg-gradient-to-b from-transparent via-white/2 to-transparent rotate-45 transform translate-y-20 blur-sm"></div>
            </div>
        </div>

        {/* Hanging Lamp (Top Center) */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center w-full h-full pointer-events-none">
            {/* Cord */}
            <div className="w-1 h-[15%] md:h-[20%] bg-[#0f172a]"></div>
            
            {/* Lamp Shade */}
            <div className="relative z-10">
                {/* Exterior Shade */}
                <div className="w-32 h-10 bg-[#cbd5e1] rounded-[50%_50%_0_0] relative shadow-lg overflow-hidden bg-gradient-to-r from-slate-400 via-slate-200 to-slate-400">
                     <div className="absolute bottom-0 w-full h-2 bg-slate-500/20 blur-sm"></div>
                </div>
                {/* Interior/Bulb glow area */}
                <div className="w-32 h-4 bg-[#fefce8] rounded-[0_0_50%_50%] shadow-[0_0_20px_rgba(253,230,138,0.8)] relative z-20"></div>
            </div>

            {/* Volumetric Light Cone */}
            <div 
                className="w-[80vw] max-w-2xl h-full bg-gradient-to-b from-yellow-50/10 via-yellow-50/5 to-transparent mix-blend-overlay blur-xl transform origin-top"
                style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)' }}
            ></div>
        </div>

        {/* === CHARACTERS === */}
        <div className="absolute bottom-[20px] w-full px-4 md:px-12 flex justify-between items-end z-20 max-w-4xl mx-auto left-1/2 -translate-x-1/2">
             <DetectivePortrait 
                profile={HARRIS_PROFILE} 
                isActive={audioSpeaker === 'Harris'} 
                isWaiting={isLoading}
                align="left" 
             />
             <DetectivePortrait 
                profile={MOORE_PROFILE} 
                isActive={audioSpeaker === 'Moore'} 
                isWaiting={isLoading}
                align="right" 
             />
        </div>

        {/* === FOREGROUND TABLE === */}
        <div className="absolute bottom-0 w-full h-8 md:h-12 bg-[#3f2e2e] border-t-8 border-[#271c1c] z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.6)] flex justify-center items-start overflow-hidden">
            {/* Subtle table reflections/texture */}
            <div className="w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')]"></div>
        </div>
    </div>
  );

  const renderGameScreen = () => (
    <div className="flex flex-col h-screen max-w-6xl mx-auto bg-slate-900 relative shadow-[0_0_100px_rgba(0,0,0,0.8)] border-x border-slate-800">
      
      {/* Header Info Bar */}
      <div className="bg-slate-950 p-2 border-b border-slate-800 flex justify-between items-center z-20 shrink-0">
        <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-red-500 animate-pulse">● INTERROGATION IN PROGRESS</span>
            <span className="font-mono text-[10px] text-slate-500 hidden md:inline">CASE: {selectedCase.id.toUpperCase()}</span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">CAM-2</span>
      </div>

      {/* Visual Scene */}
      {renderPixelRoom()}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 relative bg-slate-950 shadow-inner">
        {messages.map((msg) => {
          const isPlayer = msg.sender === 'Player';
          return (
            <div 
              key={msg.id} 
              className={`flex flex-col ${isPlayer ? 'items-end' : 'items-start'} animate-fade-in group`}
            >
              <span className={`text-[10px] font-mono mb-1 tracking-wider ${isPlayer ? 'text-slate-500' : 'text-amber-600/70'}`}>
                {isPlayer ? 'YOU' : msg.sender.toUpperCase()}
              </span>
              <div 
                className={`max-w-[90%] md:max-w-[75%] p-3 text-sm md:text-base leading-relaxed font-mono
                  ${isPlayer 
                    ? 'bg-slate-800 text-slate-200 border-l-2 border-slate-600' 
                    : 'text-amber-50 border-l-2 border-amber-700/50 pl-4'
                  }`}
              >
                {(!isPlayer && msg.id === messages[messages.length - 1].id) ? (
                    <Typewriter text={msg.text} speed={30} />
                ) : (
                    msg.text
                )}
              </div>
            </div>
          );
        })}
        
        {isLoading && !currentSpeaker && (
            <div className="flex items-center gap-2 animate-pulse mt-4 opacity-50">
                <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                <div className="w-2 h-2 bg-amber-500 rounded-full delay-75"></div>
                <div className="w-2 h-2 bg-amber-500 rounded-full delay-150"></div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 z-20 shrink-0">
        <form onSubmit={handleSendMessage} className="flex gap-2 max-w-4xl mx-auto items-stretch">
          
          {/* Push to Talk Button */}
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecordingAndSend}
            onMouseLeave={stopRecordingAndSend}
            onTouchStart={startRecording}
            onTouchEnd={stopRecordingAndSend}
            disabled={isLoading || showQuotaModal}
            className={`
                px-4 flex items-center justify-center border transition-all duration-200
                ${isRecording 
                    ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.7)]' 
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }
            `}
            title="Push and Hold to Talk"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading || showQuotaModal || isRecording}
            placeholder={isRecording ? "Listening..." : "> Type or Hold Mic"}
            className="flex-1 bg-black border border-slate-700 text-green-500 p-3 font-mono focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-all placeholder:text-slate-700"
            autoComplete="off"
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim() || showQuotaModal || isRecording}
            className="bg-slate-800 text-slate-200 px-6 py-3 font-bold font-mono hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700 transition-colors uppercase text-sm"
          >
            Reply
          </button>
        </form>
      </div>
    </div>
  );

  const renderEndingScreen = () => {
    // Special Success Screen for Lawyer
    if (verdict?.outcome === 'LAWYER') {
      return (
        <div className="fixed inset-0 bg-slate-950 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border-2 border-emerald-500/50 text-slate-100 max-w-lg w-full p-8 shadow-[0_0_50px_rgba(16,185,129,0.15)] text-center relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>
              
              <div className="mb-6 flex justify-center">
                <div className="w-16 h-16 rounded-full border-2 border-emerald-500 flex items-center justify-center text-emerald-500 text-2xl font-black">
                    ✓
                </div>
              </div>

              <h2 className="text-3xl md:text-5xl font-mono font-bold text-emerald-500 mb-4 tracking-tighter uppercase">
                INTERROGATION TERMINATED
              </h2>
              
              <p className="font-mono text-xs md:text-sm text-emerald-400/80 mb-8 uppercase tracking-widest">
                SUSPECT EXERCISED 5TH AMENDMENT RIGHTS
              </p>

              <p className="font-sans text-slate-300 leading-relaxed mb-8 text-lg">
                Most suspects don't use the right to ask for a lawyer. By refusing to speak without counsel, you have effectively halted the investigation and protected yourself.
              </p>

              <div className="bg-slate-950 p-4 border border-slate-800 mb-8 text-left rounded">
                <p className="text-xs text-slate-500 font-mono mb-1">OFFICER NOTES:</p>
                <p className="font-mono text-sm text-emerald-400">"{verdict.text}"</p>
              </div>

              <button 
                onClick={() => setGameState(GameState.START)}
                className="px-8 py-3 bg-emerald-700 text-white font-bold font-mono uppercase hover:bg-emerald-600 transition-colors tracking-widest rounded-sm"
              >
                Play Again
              </button>
          </div>
        </div>
      );
    }

    // Default Newspaper Screen for Guilty/Not Guilty
    return (
      <div className="fixed inset-0 bg-slate-950 z-50 flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-[#e2e8f0] text-slate-900 max-w-2xl w-full p-8 md:p-12 shadow-2xl relative rotate-1 transform">
          {/* Newspaper Header */}
          <div className="border-b-4 border-slate-900 mb-6 pb-2 flex justify-between items-end">
              <h2 className="text-4xl md:text-6xl font-serif font-black uppercase leading-none tracking-tight">
                  DAILY CRIME
              </h2>
              <div className="text-right hidden md:block">
                  <p className="font-mono text-xs">VOL. CCXCII</p>
                  <p className="font-mono text-xs">LATE EDITION</p>
              </div>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-8xl font-serif font-black text-center mb-8 uppercase leading-[0.8] tracking-tighter border-b-2 border-slate-900 pb-8">
              {verdict?.outcome}
          </h1>

          {/* Article Body */}
          <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-2/3">
                  <p className="font-serif font-bold text-lg mb-2 uppercase border-b border-slate-400 pb-1">
                      Police Statement Released
                  </p>
                  <p className="font-serif text-justify text-slate-800 leading-snug text-lg">
                      {verdict?.text}
                  </p>
              </div>
              <div className="md:w-1/3 flex flex-col justify-between border-l border-slate-400 pl-6 md:pl-6">
                  <div className="mb-6">
                      <p className="font-mono text-xs text-slate-500 mb-1">SUSPECT ID</p>
                      <div className="bg-slate-800 w-full aspect-square grayscale flex items-center justify-center border-4 border-slate-900">
                           {verdict && <SuspectPhoto outcome={verdict.outcome} />}
                      </div>
                  </div>
                  <button 
                      onClick={() => setGameState(GameState.START)}
                      className={`w-full py-3 text-white font-bold font-sans uppercase tracking-widest transition-colors shadow-lg ${verdict?.outcome === 'NOT GUILTY' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-700 hover:bg-red-800'}`}
                  >
                      New Case
                  </button>
              </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-amber-500/30 font-sans overflow-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_50%_0%,_rgba(120,113,108,0.3),_transparent_70%)]"></div>
      
      {renderQuotaModal()}
      {gameState === GameState.DISCLAIMER && renderDisclaimerScreen()}
      {gameState === GameState.START && renderStartScreen()}
      {gameState === GameState.PLAYING && renderGameScreen()}
      {gameState === GameState.ENDING && renderEndingScreen()}
    </div>
  );
}

export default App;