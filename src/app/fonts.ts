import { Heebo } from 'next/font/google';

/** UI font (Hebrew + Latin, variable weight), exposed as `--font-heebo` for Tailwind's `font-sans`. */
export const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
});
