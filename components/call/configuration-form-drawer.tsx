import { ConfigurationForm } from '@/components/call/configuration-form';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import type { Locale } from '@/lib/i18n/i18n-config';

interface ConfigurationFormDrawerProps {
  children: React.ReactNode;
  lang: Locale;
}

export function ConfigurationFormDrawer({
  children,
  lang,
}: ConfigurationFormDrawerProps) {
  return (
    <Drawer>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent className="">
        <div className="flex h-[60vh] flex-col">
          <div className="flex-grow overflow-y-auto px-4 py-2">
            <ConfigurationForm lang={lang} />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
