// AudioSettings — small icon button in the header that opens a popover with
// three sliders (master / music / sfx) and a mute toggle. All wiring lives in
// the AudioEngine; this component is purely a controlled view.

import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { AudioEngine, AudioSettings as SettingsT, getAudioEngine } from '../engine/audio/engine';

interface Props {
  // Optional engine override for testing — defaults to the module singleton.
  engine?: AudioEngine;
}

export function AudioSettings({ engine: engineProp }: Props): React.ReactElement {
  const engine = engineProp ?? getAudioEngine();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsT>(engine.settings);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close the popover on outside click. We compare against both refs so
  // clicking the button itself toggles instead of being treated as outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent): void => {
      const t = ev.target as Node | null;
      if (!t) return;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const update = (patch: Partial<SettingsT>): void => {
    const next: SettingsT = { ...settings, ...patch };
    setSettings(next);
    if (patch.master !== undefined) engine.setMasterVolume(patch.master);
    if (patch.music  !== undefined) engine.setMusicVolume(patch.music);
    if (patch.sfx    !== undefined) engine.setSfxVolume(patch.sfx);
    if (patch.muted  !== undefined) engine.setMuted(patch.muted);
  };

  return (
    <div className="audio-settings">
      <button
        ref={buttonRef}
        className="audio-button"
        type="button"
        onClick={() => {
          // Toggle visibility. Also nudge the engine to start since this is
          // an unambiguous user gesture — useful on browsers where the
          // pointerdown listener missed (e.g. touch-tap dispatched via
          // synthetic events).
          engine.ensureStarted();
          setOpen(o => !o);
        }}
        title={settings.muted ? 'Audio muted — click to open settings' : 'Audio settings'}
        aria-label="Audio settings"
      >
        {settings.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>

      {open && (
        <div className="audio-popover" ref={popoverRef} role="dialog" aria-label="Audio settings">
          <div className="audio-row">
            <label htmlFor="vc-aud-master">Master</label>
            <input
              id="vc-aud-master"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.master}
              onChange={e => update({ master: Number(e.target.value) })}
            />
            <span className="audio-val">{Math.round(settings.master * 100)}</span>
          </div>

          <div className="audio-row">
            <label htmlFor="vc-aud-music">Music</label>
            <input
              id="vc-aud-music"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.music}
              onChange={e => update({ music: Number(e.target.value) })}
            />
            <span className="audio-val">{Math.round(settings.music * 100)}</span>
          </div>

          <div className="audio-row">
            <label htmlFor="vc-aud-sfx">SFX</label>
            <input
              id="vc-aud-sfx"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.sfx}
              onChange={e => update({ sfx: Number(e.target.value) })}
            />
            <span className="audio-val">{Math.round(settings.sfx * 100)}</span>
          </div>

          <div className="audio-row audio-mute-row">
            <label htmlFor="vc-aud-mute">Muted</label>
            <input
              id="vc-aud-mute"
              type="checkbox"
              checked={settings.muted}
              onChange={e => update({ muted: e.target.checked })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

void React;
