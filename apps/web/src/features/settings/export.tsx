import type { ExportFormat } from '@allotr/shared';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/messages/t';
import { Section } from './section.tsx';

// Download of all ledger data (FR-U3, FR-U4). Plain links: the browser
// sends the session cookie and saves the attachment itself.

const formats: readonly ExportFormat[] = ['json', 'csv', 'beancount'];

export function ExportSection() {
  return (
    <Section
      id="export"
      title={t('settings.export.title')}
      intro={t('settings.export.intro')}
    >
      <ul className="mt-4 space-y-4">
        {formats.map((format) => (
          <li key={format}>
            <Button asChild variant="outlined">
              <a href={`/v1/export?format=${format}`} download>
                <Download aria-hidden="true" />
                {t(`settings.export.${format}.label`)}
              </a>
            </Button>
            <p className="mt-1 max-w-prose text-sm text-text-muted">
              {t(`settings.export.${format}.hint`)}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
