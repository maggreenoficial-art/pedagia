export type TeacherSampleExam = {
  id: string;
  fileName: string;
  textPreview: string;
  uploadedAt: string;
};

export type TeacherWritingProfile = {
  summary: string;
  tone: string;
  vocabulary: string;
  structure: string;
  /** Bloco pronto para injetar nos prompts de geração */
  promptBlock: string;
  analyzedAt: string;
};

export type TeacherProfile = {
  displayName: string;
  subjects: string;
  bio: string;
  sampleExams: TeacherSampleExam[];
  writingProfile: TeacherWritingProfile | null;
  updatedAt?: string;
};

export const EMPTY_TEACHER_PROFILE: TeacherProfile = {
  displayName: '',
  subjects: '',
  bio: '',
  sampleExams: [],
  writingProfile: null,
};
