import { GoogleGenAI, Type, Chat, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { TurnResponse, CaseFile } from "../types";

// We keep the chat session instance here to maintain history
let chatSession: Chat | null = null;

const generateSystemInstruction = (caseFile: CaseFile) => `
You are roleplaying a high-stakes interrogation game. You control TWO characters:
1. Detective Harris (Aggressive, loud, confrontational, "Bad Cop"). He thinks the suspect is definitely guilty.
2. Detective Moore (Calm, analytical, soft-spoken, "Good Cop"). She is trying to catch the suspect in a lie through logic.

CASE FILE: "${caseFile.title}"
- Crime: ${caseFile.crime}
- Suspect description: ${caseFile.suspectDescription}
- Witness/Evidence: ${caseFile.witnessEvidence}
- Other Evidence: ${caseFile.circumstantialEvidence}

THE TRUTH (Hidden from detectives, known to System):
- The Player (Suspect) Status: ${caseFile.actualTruth}
(Note: The detectives do NOT know this truth. They only have the evidence. Harris assumes guilty, Moore is open-minded but suspicious.)

RULES:
- The game lasts for roughly 6-8 turns.
- You must decide which detective speaks next. They should generally alternate, but can interrupt each other.
- Evaluate the player's answers. If they are vague, contradictory, or defensive, increase suspicion.
- If the player provides a solid, consistent story that explains the evidence, Moore might start to believe them.
- STAY IN CHARACTER. Do not sound like an AI. Use slang, interruptions, and police terminology appropriately.
- **CRITICAL: Keep messages SHORT and PUNCHY. Real people in arguments don't give speeches. Use sentence fragments. Be direct. 1-2 sentences max.**

WIN CONDITIONS / VERDICTS:
1. "NOT GUILTY": Player gives a consistent, verifiable story (or lies perfectly) and remains calm.
2. "GUILTY": Player contradicts themselves, sweats under pressure, or confesses.
3. "LAWYER": If the player explicitly demands a lawyer.
   - **CRITICAL CHECK**: Has the suspect *already* "overshared" or provided incriminating details?
   - **IF COMPROMISED**: Verdict: "GUILTY". Text: "Too late for that, you already gave us X."
   - **IF CLEAN**: Verdict: "LAWYER". Text: "Smart move. We're done here." (Win)

OUTPUT FORMAT:
You must output a JSON object adhering to this schema.

OBJECTIVES:
- Evaluate the player's last input.
- Generate the next line of dialogue.
- Decide if the interrogation should end.
`;

// Helper: Retry with exponential backoff for 429/503 errors
async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const code = error.status || error.code;
    const isRateLimit = code === 429 || error.message?.includes('429') || error.message?.includes('quota');
    const isServerOverload = code === 503;

    if ((isRateLimit || isServerOverload) && retries > 0) {
      console.warn(`API Busy (Code ${code}). Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const startInterrogation = async (caseFile: CaseFile): Promise<TurnResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  chatSession = ai.chats.create({
    model: 'gemini-3-flash-preview', 
    config: {
      systemInstruction: generateSystemInstruction(caseFile),
      responseMimeType: 'application/json',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ],
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING, enum: ['Harris', 'Moore'] },
          content: { type: Type.STRING },
          isInterrogationOver: { type: Type.BOOLEAN },
          verdict: { type: Type.STRING, enum: ['GUILTY', 'NOT GUILTY', 'LAWYER'], nullable: true },
          verdictText: { type: Type.STRING, nullable: true },
        },
        required: ['speaker', 'content', 'isInterrogationOver'],
      },
    },
  });

  // Retry the initial message
  const response = await retryOperation(async () => {
    return await chatSession!.sendMessage({ 
      message: `Start the interrogation for Case: ${caseFile.title}. Harris starts with: "${caseFile.openingLine}"` 
    });
  });

  const text = response.text;
  if (!text) {
    console.error("AI Response Empty. Candidates:", response.candidates);
    return {
        speaker: 'Harris',
        content: caseFile.openingLine,
        isInterrogationOver: false
    };
  }
  
  return JSON.parse(text) as TurnResponse;
};

export const sendPlayerResponse = async (input: string, audioBase64?: string, mimeType?: string): Promise<TurnResponse> => {
  if (!chatSession) {
    throw new Error("Game session not started");
  }

  // Retry player turns
  const response = await retryOperation(async () => {
    if (audioBase64 && mimeType) {
        // Send audio part + text instruction
        return await chatSession!.sendMessage({
            message: [
                { inlineData: { mimeType: mimeType, data: audioBase64 } },
                { text: "The user has provided an audio response. Listen to the tone and content. Respond accordingly." }
            ]
        });
    } else {
        // Text only
        return await chatSession!.sendMessage({ message: input });
    }
  });

  const text = response.text;
  if (!text) {
      console.error("AI Response Empty. Candidates:", response.candidates);
      return {
        speaker: 'Harris',
        content: "I didn't hear you! I said, where were you?!",
        isInterrogationOver: false
      };
  }

  return JSON.parse(text) as TurnResponse;
};

// Helper to decode base64
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const generateDetectiveAudio = async (text: string, speaker: 'Harris' | 'Moore'): Promise<Uint8Array | null> => {
  // Fallback for non-streaming usage if needed
  const stream = streamDetectiveAudio(text, speaker);
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  if (chunks.length === 0) return null;
  
  // Combine chunks
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

export async function* streamDetectiveAudio(text: string, speaker: 'Harris' | 'Moore'): AsyncGenerator<Uint8Array> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // Harris = Charon (Deeper/Older), Moore = Aoede (Professional/Composed)
    const voiceName = speaker === 'Harris' ? 'Charon' : 'Aoede';

    let responseStream;

    try {
        // Retry the stream connection logic
        responseStream = await retryOperation(async () => {
             return await ai.models.generateContentStream({
                model: "gemini-2.5-pro-preview-tts",
                contents: [{ parts: [{ text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName },
                        },
                    },
                },
            });
        });
    } catch (error) {
        console.error("Audio streaming initialization failed:", error);
        return;
    }

    try {
        let remainder = '';

        for await (const chunk of responseStream) {
            const base64Data = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Data) {
                const combined = remainder + base64Data;
                
                // CRITICAL FIX: Ensure we only decode chunks that result in EVEN byte lengths.
                // Base64 encodes 3 bytes into 4 chars. 
                // We need the result to be a multiple of 2 bytes (for Int16 PCM).
                // LCM(3, 2) = 6 bytes. 6 bytes = 8 Base64 chars.
                // So we must slice at multiples of 8 characters.
                const lengthToDecode = combined.length - (combined.length % 8);
                
                if (lengthToDecode > 0) {
                    const toDecode = combined.substring(0, lengthToDecode);
                    remainder = combined.substring(lengthToDecode);
                    yield decodeBase64(toDecode);
                } else {
                    remainder = combined;
                }
            }
        }
        
        if (remainder.length > 0) {
             try {
                 yield decodeBase64(remainder);
             } catch (e) {
                 console.warn("Failed to decode remaining base64 bytes", e);
             }
        }
    } catch (error) {
        console.error("Error reading audio stream:", error);
    }
}