import { z } from 'zod';

export const registerSchema = z.object({
  displayName: z.string().trim().min(2, "Le nom d'aventurier doit faire au moins 2 caractères.").max(40),
  email: z.string().trim().toLowerCase().email('Courriel invalide.'),
  password: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.').max(200),
  preference: z.enum(['play', 'lead']).default('play'),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Courriel invalide.'),
  password: z.string().min(1, 'Mot de passe requis.').max(200),
});
export type LoginInput = z.input<typeof loginSchema>;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  locale: z.enum(['fr', 'en']).optional(),
  homeStyle: z.enum(['immersive', 'classic']).optional(),
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  preference: 'play' | 'lead';
  locale: 'fr' | 'en';
  homeStyle: 'immersive' | 'classic';
}
