export type QuestionType = 'mc' | 'yesno' | 'gap' | 'qurangap' | 'open';

export interface ExamQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  // mc: 3-6 options, correct = indices; yesno: correct = boolean;
  // gap: correct = the missing word/text; qurangap: options = candidate
  // words, correct = index of the right one, verseRef documents the source.
  options?: string[];
  correct?: number[] | boolean | string | number;
  verseRef?: string;
  points: number;
}

export interface ExamDraft {
  id?: string;
  name: string;
  level: 'hazirlik' | 'TB1' | 'TB2' | 'TB3';
  language: 'tr' | 'nl';
  timeLimitMinutes: number | null;
  isTemplate: boolean;
  questions: ExamQuestion[];
}

export const EMPTY_EXAM: ExamDraft = {
  name: '',
  level: 'hazirlik',
  language: 'tr',
  timeLimitMinutes: null,
  isTemplate: false,
  questions: [],
};
