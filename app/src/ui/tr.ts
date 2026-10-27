import { useTheme } from '../theme/ThemeProvider';

/** tr('English', 'हिन्दी') returns the text in the current language. Used on screens with many one-off strings. */
export function useTr() {
  const { lang } = useTheme();
  return (en: string, hi: string) => (lang === 'hi' ? hi : en);
}
