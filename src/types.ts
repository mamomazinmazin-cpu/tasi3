export enum QuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  TRUE_FALSE = 'true_false',
  EXPLAIN = 'explain',
  INTERPRET = 'interpret',
  JUSTIFY = 'justify',
  LIST_ELEMENTS = 'list_elements',
  ORDER_ELEMENTS = 'order_elements',
  SHORT_ANSWER = 'short_answer',
  ESSAY = 'essay'
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  options?: string[]; // for multiple_choice and order_elements
  correctAnswer?: string; // for multiple_choice, true_false, short_answer
  correctOrder?: string[]; // for order_elements
}

export interface ExamAlert {
  id: string;
  message: string;
  timestamp: string;
}

export interface Exam {
  id: string;
  teacherName: string;
  subject: string;
  duration: number; // in minutes
  totalMarks: number;
  code: string; // 6-digit access code (e.g., AB12X)
  createdAt: string;
  createdBy: string;
  questions: Question[];
  isFavorite?: boolean;
  alerts?: ExamAlert[];
  deadline?: string; // Optional ISO string for exam deadline
}

export interface GradedAnswer {
  isCorrect: boolean;
  score: number;
  aiExplanation?: string;
  feedback?: string;
}

export interface Submission {
  id: string;
  studentName: string;
  startedAt: string;
  submittedAt: string;
  answers: Record<string, string | string[]>; // questionId -> answer
  score: number;
  totalScorePossible: number;
  gradedAnswers: Record<string, GradedAnswer>;
  status: 'started' | 'submitted';
  uid: string; // anonymous login UID
}
