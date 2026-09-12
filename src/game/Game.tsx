import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronLeft, Cuboid, Flag, HelpCircle, Home, Leaf, Maximize2, MousePointer2, Pause, Play, Plus, Save, Smartphone, Volume2, VolumeX, X } from 'lucide-react';
import { VoxelEngine, type GameStats } from './engine';
import { blocks, type Settings, type World } from './types';

interface Props {
  world: World;
  settings: Settings;
  onExit: () => void;
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
  const [muted, setMuted] = useState(!settings.sound);
  const [stats, setStats] = useState<GameStats>({ fps: 0, x: 11, y: 10, z: 17, flying: false, target: '', changed: 0 });
  const touch = settings.touch || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;

  const pauseGame = () => {
    pausedRef.current = true;
    setPaused(true);
    engine.current?.setPaused(true);
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const resume = () => {
    pausedRef.current = false;
    setPaused(false);
    setStarted(true);
    setShowHelp(false);
    engine.current?.setPaused(false);
    if (!touch) {
      try {
        const request = host.current?.requestPointerLock();
        if (request) request.catch(() => { /* Drag-to-look remains available in embedded browsers. */ });
      } catch { /* Pointer lock isn't available in every embedded browser. */ }
    }
  };
  const selectBlock = (id: number) => {
    setSelected(id);
    if (engine.current) engine.current.selected = id;
  };
  const exit = () => {
    engine.current?.save();
    if (document.pointerLockElement) document.exitPointerLock();
    onExit();
  };

  useEffect(() => {
    if (!host.current) return;
    let game: VoxelEngine;
    try {
      game = new VoxelEngine(host.current, world, { ...settings }, setStats);
      engine.current = game;
      setReady(true);
    } catch (e) {
      setError('Your browser could not start the 3D renderer. Enable WebGL / hardware acceleration, then try again.');
      console.error(e);
      return;
    }
    const keyDown = (event: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      if (event.code === 'Escape') {
        if (!pausedRef.current) pauseGame();
        return;
      }
      if (pausedRef.current) return;
      game.keys.add(event.code);
      if (/^Digit[1-9]$/.test(event.code)) selectBlock(Number(event.code.slice(-1)));
      if (event.code === 'KeyF' && !event.repeat) game.toggleFly();
      if (event.code === 'KeyE' && !event.repeat) game.act(true);
      if (event.code === 'KeyR' && !event.repeat) game.act(false);
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
    document.addEventListener('keydown', keyDown);
    document.addEventListener('keyup', keyUp);
    document.addEventListener('mousemove', mouseMove);
    document.addEventListener('pointerlockchange', lockChange);
    window.addEventListener('blur', blur);
    const visibility = () => { if (document.hidden) blur(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      game.dispose();
      engine.current = null;
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('keyup', keyUp);
      document.removeEventListener('mousemove', mouseMove);
      document.removeEventListener('pointerlockchange', lockChange);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
    };
  }, [world.id]);

  const drag = useRef<{ x: number; y: number; moved: boolean; button: number } | null>(null);
  const touchKey = (code: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.keys.add(code); },
    onPointerUp: () => engine.current?.keys.delete(code),
    onPointerCancel: () => engine.current?.keys.delete(code),
    onLostPointerCapture: () => engine.current?.keys.delete(code),
  });

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
      onPointerUp={() => {
        if (drag.current && !drag.current.moved && !touch) engine.current?.act(drag.current.button === 2);
        drag.current = null;
      }}
      onPointerCancel={() => { drag.current = null; }}
      onWheel={e => selectBlock(((selected - 1 + (e.deltaY > 0 ? 1 : 8)) % 9) + 1)}
    />
    <div className="game-topbar">
      <div className="game-world-info"><span className="small-brand"><Cuboid size={20} /></span><div><strong>{world.name}</strong><span><i className="status-dot" /> {world.mode} · {world.biome}</span></div></div>
      <div className="game-top-actions">{settings.showFps && <span className="fps">{stats.fps} FPS</span>}<button className="game-icon" title="Toggle sound" onClick={() => { const next = !muted; setMuted(next); if (engine.current) engine.current.settings.sound = !next; }}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><button className="game-icon" title="Fullscreen" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => setSaved('Fullscreen is unavailable in this browser.')); }}><Maximize2 size={18} /></button><button className="game-icon" title="Pause game" onClick={pauseGame}><Pause size={18} /></button></div>
    </div>
    {!paused && <>
      <div className="game-coordinates">{stats.x} <span>/</span> {stats.y} <span>/</span> {stats.z}<small>{stats.flying ? 'Flying · Q to descend' : world.mode === 'Creative' ? 'Creative · F to fly' : 'Explorer · Find your own path'}</small></div>
      <div className="crosshair"><span /><span /></div>
      {stats.target && <div className="target-label">{stats.target}</div>}
      <div className="hotbar-wrap"><div className="selected-block-name">{blocks[selected - 1].name}</div><div className="hotbar">{blocks.map(block => <button key={block.id} title={`${block.name} (${block.id})`} className={`hotbar-slot ${selected === block.id ? 'selected' : ''}`} onClick={() => selectBlock(block.id)}><span className="slot-number">{block.id}</span><span className={`voxel-block block-${block.id}`} style={{ '--block-top': block.color, '--block-side': block.side } as React.CSSProperties}><i /><b /><em /></span><span className="slot-count">∞</span></button>)}</div><div className="game-control-hint">{touch ? 'Drag to look around · Select a block to build' : <><span>W A S D</span> Move <i /> <span>SPACE</span> Jump <i /> <span>LMB</span> Mine <i /> <span>RMB</span> Build <i /> <span>ESC</span> Pause</>}</div></div>
      {touch && <div className="touch-controls"><div className="dpad"><button {...touchKey('KeyW')} aria-label="Move forward"><ArrowUp /></button><button {...touchKey('KeyA')} aria-label="Move left"><ArrowLeft /></button><button {...touchKey('KeyS')} aria-label="Move backward"><ArrowDown /></button><button {...touchKey('KeyD')} aria-label="Move right"><ArrowRight /></button></div><div className="touch-actions"><button onClick={() => engine.current?.act(false)}>Mine</button><button onClick={() => engine.current?.act(true)}><Plus size={20} /> Build</button><button {...touchKey('Space')}><ArrowUp size={20} /> Jump</button>{world.mode === 'Creative' && <><button onClick={() => engine.current?.toggleFly()}>{stats.flying ? 'Land' : 'Fly'}</button>{stats.flying && <button {...touchKey('KeyQ')}>Down</button>}</>}</div></div>}
    </>}
    {paused && <div className="game-pause-overlay"><div className="pause-card">
      <div className="modal-symbol"><Leaf size={25} /></div>
      <div className="eyebrow">{error ? 'A SMALL BUMP IN THE ROAD' : started ? 'TAKE YOUR TIME' : 'YOUR ADVENTURE AWAITS'}</div>
      <h2>{error ? 'Unable to open world' : started ? 'A moment of quiet.' : `Welcome to ${world.name}.`}</h2>
      <p>{error || (started ? 'Your world will be right here when you’re ready.' : 'Wander a little. Build a lot. Make this place your own.')}</p>
      {showHelp ? <div className="pause-controls"><button className="text-button" onClick={() => setShowHelp(false)}><ChevronLeft size={14} /> Back</button>{[['W A S D / arrows', 'Move around'], ['Mouse / drag', 'Look around'], ['Space', 'Jump / fly up'], ['Left click / R', 'Mine a block'], ['Right click / E', 'Place a block'], ['1–9 / scroll', 'Choose a block'], ['F / Q', 'Fly / descend (Creative)'], ['Esc', 'Pause your world']].map(([key, text]) => <div key={key}><kbd>{key}</kbd><span>{text}</span></div>)}</div> : !error && <><div className="world-entry-stats"><span><Flag size={16} />{world.mode}</span><span><Leaf size={16} />{world.biome}</span><span>{touch ? <Smartphone size={16} /> : <MousePointer2 size={16} />}{touch ? 'Touch controls' : 'Keyboard & mouse'}</span></div><button className="primary-button full-width" disabled={!ready} onClick={resume}><Play size={17} fill="currentColor" />{!ready ? 'Growing your world…' : started ? 'Back to your world' : 'Let’s explore'}<ArrowRight size={18} /></button><div className="pause-secondary"><button className="secondary-button" onClick={() => setShowHelp(true)}><HelpCircle size={16} /> Controls</button><button className="secondary-button" onClick={() => { const success = engine.current?.save(); setSaved(success ? 'World saved on this device' : 'Storage is full. Please free some space.'); setTimeout(() => setSaved(''), 4000); }}>{saved.startsWith('World saved') ? <Check size={16} /> : <Save size={16} />} Save world</button></div></>}
      <button className="text-button pause-exit" onClick={exit}><Home size={15} />Save & return home</button>
      {!started && !error && <small className="pause-footnote">{touch ? 'Touch controls are enabled automatically.' : 'Click to capture your mouse. If unavailable, drag to look.'}</small>}
    </div></div>}
    {saved && <div className="game-toast"><Check size={17} />{saved}<button aria-label="Dismiss message" onClick={() => setSaved('')}><X size={15} /></button></div>}
    <div className="game-watermark"><Cuboid size={13} /> BLOCKHAVEN</div>
  </div>;
}
