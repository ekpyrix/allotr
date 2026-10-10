import { SettingsStub } from './settings-stub.tsx';

/** `/settings/themes/new` (no id) and `/settings/themes/$id`. */
export function ThemeEditorScreen({ id }: { id?: string }) {
  return <SettingsStub title={id ?? 'New theme'} />;
}
