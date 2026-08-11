/**
 * Settings route (UI-007) — UI_SPEC §5.6.
 *
 * The folder picker is a platform capability, supplied here rather than by the
 * screen, for the same reason the file picker is on the send side.
 */
import { useRouter } from 'expo-router';

import { useAppServices } from '@hooks/index';
import { SettingsScreen } from '@screens/index';
import { Route } from '@navigation/routes';

export default function SettingsRoute() {
  const router = useRouter();
  const { settings, pickDirectory } = useAppServices();

  return (
    <SettingsScreen
      onBack={() => router.back()}
      onAbout={() => router.push(Route.About)}
      onChooseFolder={() => {
        void pickDirectory().then((directory) => {
          // Cancelling leaves the preference alone. Clearing it is a separate
          // control, so a mis-tap does not silently move where files land.
          if (directory !== undefined) {
            void settings.setDownloadDirectory(directory);
          }
        });
      }}
    />
  );
}
