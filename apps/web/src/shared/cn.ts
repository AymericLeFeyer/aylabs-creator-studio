import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Concatène des classes Tailwind en laissant la dernière gagner sur les conflits. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
