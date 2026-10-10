import { AuthPlaceholder } from '../auth-placeholder.tsx';
import { t } from '@/messages/t';

export function SignInScreen() {
  return <AuthPlaceholder title={t('signIn.title')} />;
}
