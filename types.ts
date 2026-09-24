export interface Experience {
  id: string;
  role: string;
  company: string;
  period: string;
  description: string;
}

export interface Education {
  id: string;
  degree: string;
  institution: string;
  year: string;
  type: 'Bacharelado' | 'Certificação' | 'Mestrado' | 'Extensão';
}

export interface Skill {
  id: string;
  name: string;
  level: number; // 0 to 100
}

export interface Language {
  id: string;
  name: string;
  level: string;
}

export interface ResumeData {
  id: string; // Identificador único do currículo
  userId: string; // ID do usuário proprietário
  templateId: string;
  themeMode?: 'light' | 'dark'; // Nova propriedade para o modo do tema
  fullName: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  summary: string;
  experiences: Experience[];
  education: Education[];
  skills: Skill[];
  languages: Language[];
  hobbies: string[];
  avatarUrl: string;
  lastUpdated?: string;
  isPinned?: boolean;
  isImported?: boolean;
}

export interface TemplateOption {
  id: string;
  name: string;
  color: string;
  description: string;
}

export interface User {
  id?: string;
  name: string;
  avatar: string;
  email: string;
  role?: 'Administrador' | 'Cliente';
  plan?: 'Free' | 'Premium';
  credits?: number;
  status?: 'Ativo' | 'Inativo';
}

export enum ViewState {
  AUTH = 'AUTH',
  DASHBOARD = 'DASHBOARD',
  EDITOR = 'EDITOR',
  PRICING = 'PRICING',
  SETTINGS = 'SETTINGS'
}