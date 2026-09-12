import { useEffect, useRef, useState } from 'react';
import { PixelCube, PixelIcon, type IconName } from '../ui/PixelIcon';
import { VoxelEngine, WEATHER_LABELS, type GameStats, type SavedWorld } from './engine';
import { blocks, biomeId, loadLocal, modeId, saveLocal, storageKey, type Settings, type World } from './types';
import { platform } from '../platform/platform';

interface Props {
  world: World;
  settings: Settings;
  onExit: () => void;
}

const WEATHER_ICONS: IconName[] = ['sun', 'rain', 'snow', 'storm'];

const defaultStats: GameStats = {
  fps: 0, x: 0, y: 0, z: 0, flying: false, target: '', changed: 0,
  health: 20, hunger: 20, thirst: 20, air: 12, dead: false,
  clock: '09:00', day: 1, weather: 0, biome: 'Forest', night: false,
  underwater: false, hurt: false, explorer: false,
};

function StatRow({ icon, value, segments = 10, className = '' }: { icon: IconName; value: number; segments?: number; className?: string }) {
  const per = 20 / segments;
  const cells = [];
  for (let i = 0; i < segments; i++) {
    const fill = value - i * per;
    cells.push(<span key={i} className={`stat-seg ${fill >= per ? 'full' : fill > 0 ? 'half' : 'empty'}`}><PixelIcon name={icon} size={13} /></span>);
  }
  return <div className={`stat-row ${className}`}>{cells}</div>;
}

export default function Game({ world, settings, onExit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<VoxelEngine | null>(null);
  const pausedRef = useRef(true);
  const wasLocked = useRef(false);
  const [paused, setPaused] = useState(true);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(1);
  const [showHelp, setShowHelp] = useState(false);
  const [saved, setSaved] = useState('');
  const [toast, setToast] = useState('');
  const [muted, setMuted] = useState(!settings.sound);
  const [stats, setStats] = useState<GameStats>(defaultStats);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = settings.touch || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  };

  const pauseGame = () => {
    pausedRef.current = true;
    setPaused(true);
    engine.current?.setPaused(true);
    platform.gameplayStop();
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const resume = () => {
    pausedRef.current = false;
    setPaused(false);
    setStarted(true);
    setShowHelp(false);
    engine.current?.setPaused(false);
    platform.gameplayStart();
    if (!touch) {
      try {
        const request = host.current?.requestPointerLock();
        if (request) request.catch(() => undefined);
      } catch {
        wasLocked.current = false;
      }
    }
  };
  const selectBlock = (id: number) => {
    setSelected(id);
    if (engine.current) engine.current.selected = id;
  };
  const persist = () => {
    const game = engine.current;
    if (!game) return false;
    return saveLocal(storageKey(`world-${world.id}`), game.exportSave());
  };
  const exit = () => {
    persist();
    platform.gameplayStop();
    if (document.pointerLockElement) document.exitPointerLock();
    onExit();
  };

  useEffect(() => {
    if (!host.current) return;
    let game: VoxelEngine;
    try {
      game = new VoxelEngine(
        host.current,
        world.seed,
        biomeId[world.biome],
        modeId[world.mode],
        { quality: settings.quality, fov: settings.fov, sensitivity: settings.sensitivity, sound: settings.sound, volume: settings.volume, invertY: settings.invertY },
        setStats,
      );
      game.loadSave(loadLocal<SavedWorld | null>(storageKey(`world-${world.id}`), null));
      game.onAutoSave = () => saveLocal(storageKey(`world-${world.id}`), game.exportSave());
      game.onToast = showToast;
      engine.current = game;
      setReady(true);
    } catch (e) {
      setError('Your browser could not start the 3D renderer. Enable WebGL or hardware acceleration, then try again.');
      console.error(e);
      return;
    }
    const keyDown = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA');
      if (typing) return;
      if (event.code === 'Escape') {
        if (!pausedRef.current) pauseGame();
        return;
      }
      if (pausedRef.current) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      game.keys.add(event.code);
      if (/^Digit[1-9]$/.test(event.code)) selectBlock(Number(event.code.slice(-1)));
      if (event.code === 'KeyF' && !event.repeat) game.toggleFly();
      if (event.code === 'KeyE' && !event.repeat) game.act(true);
      if (event.code === 'KeyR' && !event.repeat) game.act(false);
      if (event.code === 'KeyG' && !event.repeat) game.eat();
      if (event.code === 'KeyT' && !event.repeat) game.drink();
    };
    const keyUp = (event: KeyboardEvent) => game.keys.delete(event.code);
    const mouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === host.current) game.look(event.movementX, event.movementY);
    };
    const lockChange = () => {
      if (document.pointerLockElement === host.current) wasLocked.current = true;
      else if (wasLocked.current) { wasLocked.current = false; pauseGame(); }
    };
    const blur = () => { if (!pausedRef.current) pauseGame(); };
    const visibility = () => { if (document.hidden) blur(); };
    document.addEventListener('keydown', keyDown);
    document.addEventListener('keyup', keyUp);
    document.addEventListener('mousemove', mouseMove);
    document.addEventListener('pointerlockchange', lockChange);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      game.dispose();
      engine.current = null;
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('keyup', keyUp);
      document.removeEventListener('mousemove', mouseMove);
      document.removeEventListener('pointerlockchange', lockChange);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [world.id]);

  useEffect(() => {
    engine.current?.applySettings({ quality: settings.quality, fov: settings.fov, sensitivity: settings.sensitivity, sound: settings.sound && !muted, volume: settings.volume, invertY: settings.invertY });
  }, [settings, muted]);

  const drag = useRef<{ x: number; y: number; moved: boolean; button: number } | null>(null);
  const touchKey = (code: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.keys.add(code); },
    onPointerUp: () => engine.current?.keys.delete(code),
    onPointerCancel: () => engine.current?.keys.delete(code),
    onLostPointerCapture: () => engine.current?.keys.delete(code),
  });

  const weatherIcon = stats.night && stats.weather === 0 ? 'moon' : WEATHER_ICONS[stats.weather];

  return <div className="game-shell">
    <div ref={host} className="game-canvas"
      onContextMenu={e => e.preventDefault()}
      onPointerDown={e => {
        if (paused) return;
        if (document.pointerLockElement === host.current) { engine.current?.act(e.button === 2); return; }
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
      }}
      onPointerMove={e => {
        if (!drag.current || document.pointerLockElement) return;
        const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) drag.current.moved = true;
        engine.current?.look(dx, dy);
        drag.current.x = e.clientX; drag.current.y = e.clientY;
      }}
      onPointerUp={e => {
        if (drag.current && !drag.current.moved) engine.current?.act(drag.current.button === 2);
        drag.current = null;
        void e;
      }}
      onPointerCancel={() => { drag.current = null; }}
      onWheel={e => selectBlock(((selected - 1 + (e.deltaY > 0 ? 1 : blocks.length - 1)) % blocks.length) + 1)}
    />
    {!paused && stats.underwater && <div className="underwater-overlay" />}
    {!paused && stats.hurt && <div className="hurt-vignette" />}
    <div className="game-topbar">
      <div className="game-world-info"><span className="small-brand"><PixelCube size={20} /></span><div><strong>{world.name}</strong><span><i className="status-dot" /> {world.mode} / {stats.biome}</span></div></div>
      <div className="game-top-actions">
        {settings.showFps && <span className="fps">{stats.fps} FPS</span>}
        <button className="game-icon" title="Toggle sound" aria-label="Toggle sound" onClick={() => { const next = !muted; setMuted(next); if (engine.current) engine.current.settings.sound = !next; }}><PixelIcon name={muted ? 'volumeOff' : 'volume'} size={18} /></button>
        <button className="game-icon" title="Fullscreen" aria-label="Fullscreen" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => setSaved('Fullscreen is unavailable in this browser.')); }}><PixelIcon name="expand" size={18} /></button>
        <button className="game-icon" title="Pause game" aria-label="Pause game" onClick={pauseGame}><PixelIcon name="pause" size={18} /></button>
      </div>
    </div>
    {!paused && <>
      <div className="game-clock">
        <span className="clock-icon"><PixelIcon name={weatherIcon} size={17} /></span>
        <div className="clock-text">
          <strong>Day {stats.day} / {stats.clock}</strong>
          <span>{WEATHER_LABELS[stats.weather]} / {stats.biome}</span>
        </div>
      </div>
      <div className="game-coordinates">{stats.x} <span>/</span> {stats.y} <span>/</span> {stats.z}<small>{stats.flying ? 'Flying / Q to descend' : world.mode === 'Creative' ? 'Creative / F to fly' : 'Explorer / G to eat, T to drink'}</small></div>
      <div className="crosshair"><span /><span /></div>
      {stats.target && <div className="target-label">{stats.target}</div>}
      {stats.explorer && <div className="stat-bars">
        {stats.air < 12 && <StatRow icon="bubble" value={Math.max(0, stats.air / 12 * 20)} className="air-row" />}
        <StatRow icon="heart" value={stats.health} />
        <StatRow icon="drumstick" value={stats.hunger} />
        <StatRow icon="droplet" value={stats.thirst} />
      </div>}
      <div className="hotbar-wrap">
        <div className="selected-block-name">{blocks[selected - 1].name}</div>
        <div className="hotbar">
          {blocks.map(block => <button key={block.id} title={`${block.name} (${block.id})`} className={`hotbar-slot ${selected === block.id ? 'selected' : ''}`} onClick={() => selectBlock(block.id)}>
            <span className="slot-number">{block.id}</span>
            <span className={`voxel-block block-${block.id}`} style={{ '--block-top': block.top, '--block-side': block.side } as React.CSSProperties}><i /><b /><em /></span>
          </button>)}
        </div>
        <div className="game-control-hint">{touch ? 'Drag to look around / select a block to build' : <><span>W A S D</span> Move <i /> <span>SPACE</span> Jump <i /> <span>LMB</span> Mine <i /> <span>RMB</span> Build <i /> <span>ESC</span> Pause</>}</div>
      </div>
      {stats.dead && <div className="death-overlay"><div className="death-card">
        <PixelIcon name="skull" size={40} />
        <h2>The wilds got you.</h2>
        <p>Hunger, thirst, a long fall, or a shade in the dark. Take a breath and try again.</p>
        <button className="primary-button" onClick={() => engine.current?.respawn()}><PixelIcon name="sprout" size={16} />Respawn at camp</button>
      </div></div>}
      {touch && <div className="touch-controls">
        <div className="dpad">
          <button {...touchKey('KeyW')} aria-label="Move forward"><PixelIcon name="arrowUp" size={22} /></button>
          <button {...touchKey('KeyA')} aria-label="Move left"><PixelIcon name="arrowLeft" size={22} /></button>
          <button {...touchKey('KeyS')} aria-label="Move backward"><PixelIcon name="arrowDown" size={22} /></button>
          <button {...touchKey('KeyD')} aria-label="Move right"><PixelIcon name="arrowRight" size={22} /></button>
        </div>
        <div className="touch-actions">
          <button onClick={() => engine.current?.act(false)}>Mine</button>
          <button onClick={() => engine.current?.act(true)}><PixelIcon name="plus" size={16} /> Build</button>
          <button {...touchKey('Space')}><PixelIcon name="arrowUp" size={16} /> Jump</button>
          {world.mode === 'Creative' && <><button onClick={() => engine.current?.toggleFly()}>{stats.flying ? 'Land' : 'Fly'}</button>{stats.flying && <button {...touchKey('KeyQ')}>Down</button>}</>}
          {world.mode === 'Explorer' && <><button onClick={() => engine.current?.eat()}><PixelIcon name="drumstick" size={15} /> Eat</button><button onClick={() => engine.current?.drink()}><PixelIcon name="droplet" size={15} /> Drink</button></>}
        </div>
      </div>}
    </>}
    {paused && <div className="game-pause-overlay"><div className="pause-card">
      <div className="modal-symbol"><PixelIcon name="leaf" size={25} /></div>
      <div className="eyebrow">{error ? 'A SMALL BUMP IN THE ROAD' : started ? 'TAKE YOUR TIME' : 'YOUR ADVENTURE AWAITS'}</div>
      <h2>{error ? 'Unable to open world' : started ? 'A moment of quiet.' : `Welcome to ${world.name}.`}</h2>
      <p>{error || (started ? 'Your world will be right here when you are ready.' : 'An endless world with weather, wildlife, and days that turn into nights.')}</p>
      {showHelp ? <div className="pause-controls">
        <button className="text-button" onClick={() => setShowHelp(false)}><PixelIcon name="chevronLeft" size={14} /> Back</button>
        {[['W A S D / arrows', 'Move around'], ['Mouse / drag', 'Look around'], ['Space', 'Jump / fly up'], ['Left click / R', 'Mine a block or fight back'], ['Right click / E', 'Place a block'], ['G / T', 'Eat and drink (Explorer)'], ['1-9 / scroll', 'Choose a block'], ['F / Q', 'Fly / descend (Creative)'], ['Esc', 'Pause your world']].map(([key, text]) => <div key={key}><kbd>{key}</kbd><span>{text}</span></div>)}
      </div> : !error && <>
        <div className="world-entry-stats"><span><PixelIcon name="flag" size={16} />{world.mode}</span><span><PixelIcon name="leaf" size={16} />{world.biome}</span><span><PixelIcon name={touch ? 'phone' : 'mouse'} size={16} />{touch ? 'Touch controls' : 'Keyboard and mouse'}</span></div>
        <button className="primary-button full-width" disabled={!ready} onClick={resume}><PixelIcon name="play" size={17} />{!ready ? 'Growing your world' : started ? 'Back to your world' : 'Let us explore'}<PixelIcon name="arrowRight" size={18} /></button>
        <div className="pause-secondary">
          <button className="secondary-button" onClick={() => setShowHelp(true)}><PixelIcon name="help" size={16} /> Controls</button>
          <button className="secondary-button" onClick={() => { const success = persist(); setSaved(success ? 'World saved on this device' : 'Storage is full. Please free some space.'); setTimeout(() => setSaved(''), 4000); }}><PixelIcon name={saved.startsWith('World saved') ? 'check' : 'save'} size={16} /> Save world</button>
        </div>
        {world.mode === 'Explorer' && <div className="survival-note"><PixelIcon name="skull" size={15} />Shades hunt at night. Keep your health, food, and water up, or campfire dreams turn cold.</div>}
      </>}
      <button className="text-button pause-exit" onClick={exit}><PixelIcon name="home" size={15} />Save and return home</button>
      {!started && !error && <small className="pause-footnote">{touch ? 'Touch controls are enabled automatically.' : 'Click to capture your mouse. If unavailable, drag to look.'}</small>}
    </div></div>}
    {toast && !paused && <div className="game-event-toast">{toast}</div>}
    {saved && <div className="game-toast"><PixelIcon name="check" size={17} />{saved}<button aria-label="Dismiss message" onClick={() => setSaved('')}><PixelIcon name="x" size={15} /></button></div>}
    <div className="game-watermark"><PixelCube size={13} /> SANDVOXEL</div>
  </div>;
}
