import { ConfigurationForm } from '@/components/call/configuration-form';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';

interface ConfigurationFormDrawerProps {
  children: React.ReactNode;
}

export function ConfigurationFormDrawer({
  children,
}: ConfigurationFormDrawerProps) {
  return (
    <Drawer>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent className="">
        <div className="flex h-[60vh] flex-col">
          <div className="flex-grow overflow-y-auto px-4 py-2">
            <ConfigurationForm />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
