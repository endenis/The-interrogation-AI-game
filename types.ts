export type Speaker = 'Harris' | 'Moore' | 'Player';

export enum GameState {
  DISCLAIMER = 'DISCLAIMER',
  START = 'START',
  PLAYING = 'PLAYING',
  ENDING = 'ENDING'
}

export interface Message {
  id: string;
  sender: Speaker;
  text: string;
  timestamp: number;
}

export interface TurnResponse {
  speaker: 'Harris' | 'Moore';
  content: string;
  isInterrogationOver: boolean;
  verdict?: 'GUILTY' | 'NOT GUILTY' | 'LAWYER';
  verdictText?: string;
}

export interface DetectiveProfile {
  name: string;
  role: 'Bad Cop' | 'Good Cop';
  description: string;
  color: string;
}

export interface CaseFile {
  id: string;
  title: string;
  type: string;
  timestamp: string; // e.g. "21:40"
  description: string; // Player facing description
  difficulty: 'Normal' | 'Hard' | 'Extreme';
  
  // Hidden Context for AI
  crime: string;
  suspectDescription: string;
  witnessEvidence: string;
  circumstantialEvidence: string;
  actualTruth: string; // e.g. "Innocent, was at home" or "Guilty, drove the van"
  
  // Starting line
  openingLine: string;
}