'use client';

import { DynamicIcon } from 'lucide-react/dynamic';
import { useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { callScenes } from '@/lib/calls/scenes';
import { useCallSession } from './call-session';
import { useCallSetup } from './call-setup';

const NO_SCENE_VALUE = 'none';

interface SceneSelectorProps {
  isPaidUser?: boolean;
}

export function SceneSelector({ isPaidUser = false }: SceneSelectorProps) {
  const isConnected = useCallSession().session.phase.name === 'connected';
  const t = useTranslations('call');
  const { sceneId, sceneText, selectScene, setSceneText } = useCallSetup();
  const selectedValue = sceneId ?? NO_SCENE_VALUE;
  const hasEditableScene = isPaidUser && sceneId;

  const handleSceneChange = (value: string) => {
    if (!isPaidUser || isConnected) return;
    selectScene(value === NO_SCENE_VALUE ? null : value);
  };

  // Renders as cells of the call panel's two-column settings grid.
  return (
    <>
      <label className="text-slate-300 text-sm" htmlFor="call-scene">
        {t('sceneLabel')}
      </label>
      <div className="flex flex-col gap-1" data-testid="call-scene-selector">
        <Select
          disabled={isConnected}
          onValueChange={handleSceneChange}
          value={selectedValue}
        >
          <SelectTrigger
            className="h-11 w-full border-slate-700/70 bg-slate-950/70"
            id="call-scene"
          >
            <SelectValue placeholder={t('scenePlaceholder')} />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            <SelectItem value={NO_SCENE_VALUE}>{t('sceneNone')}</SelectItem>
            {callScenes.map((scene) => (
              <SelectItem
                disabled={!isPaidUser}
                key={scene.id}
                value={scene.id}
              >
                <DynamicIcon className="h-4 w-4" name={scene.icon} />
                {scene.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isPaidUser && (
          <span className="text-slate-500 text-xs">
            {t('sceneUpgradeRequired')}
          </span>
        )}
      </div>

      {hasEditableScene && (
        <div className="col-span-2 flex flex-col gap-2">
          <label className="text-slate-300 text-sm" htmlFor="call-scene-text">
            {t('sceneTextLabel')}
          </label>
          <Textarea
            className="min-h-40 border-slate-700/70 bg-slate-950/70 text-sm leading-relaxed"
            disabled={isConnected}
            id="call-scene-text"
            onChange={(event) => setSceneText(event.target.value)}
            value={sceneText}
          />
        </div>
      )}
    </>
  );
}
