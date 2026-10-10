import { AuthPlaceholder } from '../auth-placeholder.tsx';
import { t } from '@/messages/t';

export function OnboardingScreen() {
  return <AuthPlaceholder title={t('onboarding.title')} />;
}
