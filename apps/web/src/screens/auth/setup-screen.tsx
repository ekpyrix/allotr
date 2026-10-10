import { AuthPlaceholder } from '../auth-placeholder.tsx';
import { t } from '@/messages/t';

export function SetupScreen() {
  return <AuthPlaceholder title={t('setup.title')} />;
}
