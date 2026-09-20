import { useTranslation } from "react-i18next";
import { getSettingDefinition } from "../lib/settings-registry";

export function SettingSharingLabel({ settingId }: { settingId?: string }) {
  const { t } = useTranslation();
  const sharing = settingId && getSettingDefinition(settingId)?.sharing;
  if (!sharing) return null;
  return (
    <span className="block font-iris-mono text-[10px] font-normal normal-case tracking-normal text-iris-muted">
      {t(`settings.sharing.${sharing}`)}
    </span>
  );
}
