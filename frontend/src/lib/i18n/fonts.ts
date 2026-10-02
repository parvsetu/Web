import { Noto_Sans_Bengali, Noto_Sans_Devanagari, Noto_Sans_Kannada, Noto_Sans_Oriya } from 'next/font/google';

/*
 * Indic scripts (self-hosted by next/font, display: swap). They sit in the
 * font-family stack after the Latin system fonts (tailwind.config.ts), and each
 * @font-face carries its script's unicode-range — so a browser only downloads
 * the file for the script actually on screen. No preloading: English visitors
 * download none of them.
 */
const deva = Noto_Sans_Devanagari({ subsets: ['devanagari'], display: 'swap', preload: false, variable: '--font-deva' });
const beng = Noto_Sans_Bengali({ subsets: ['bengali'], display: 'swap', preload: false, variable: '--font-beng' });
const orya = Noto_Sans_Oriya({ subsets: ['oriya'], display: 'swap', preload: false, variable: '--font-orya' });
const knda = Noto_Sans_Kannada({ subsets: ['kannada'], display: 'swap', preload: false, variable: '--font-knda' });

export const indicFontVars = [deva.variable, beng.variable, orya.variable, knda.variable].join(' ');
