// Client-side password policy, kept in sync with the server's
// validatePassword() in supabase/functions/server/index.tsx. Used to give
// users immediate, localized feedback before a request is made; the server
// still enforces the same rules authoritatively.

export function validatePassword(
  password: string,
  language: 'tr' | 'nl',
): string | null {
  if (password.length < 8) {
    return language === 'tr'
      ? 'Şifre en az 8 karakter olmalıdır'
      : 'Wachtwoord moet minimaal 8 tekens lang zijn';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return language === 'tr'
      ? 'Şifre en az bir harf ve bir rakam içermelidir'
      : 'Wachtwoord moet minstens één letter en één cijfer bevatten';
  }
  return null;
}
