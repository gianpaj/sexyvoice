'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
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
import { callScenes } from '@/data/call-scenes';
import { usePlaygroundState } from '@/hooks/use-playground-state';

const NO_SCENE_VALUE = 'none';

interface SceneSelectorProps {
  isPaidUser?: boolean;
}

export function SceneSelector({ isPaidUser = false }: SceneSelectorProps) {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;
  const t = useTranslations('call');
  const { pgState, dispatch } = usePlaygroundState();
  const selectedValue = pgState.selectedSceneId ?? NO_SCENE_VALUE;
  const hasEditableScene = isPaidUser && pgState.selectedSceneId;

  const handleSceneChange = (value: string) => {
    if (!isPaidUser || isConnected) return;

    dispatch({
      payload: value === NO_SCENE_VALUE ? null : value,
      type: 'SET_SELECTED_SCENE_ID',
    });
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
            onChange={(event) =>
              dispatch({
                payload: event.target.value,
                type: 'SET_SCENE_INSTRUCTIONS',
              })
            }
            value={pgState.sceneInstructions}
          />
        </div>
      )}
    </>
  );
}
