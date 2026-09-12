import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { PixelCube, PixelIcon, type IconName } from './ui/PixelIcon';
import { biomeImages, defaultSettings, initialWorlds, loadLocal, newId, saveLocal, storageKey, type Biome, type GameMode, type Settings, type World } from './game/types';
import { platform } from './platform/platform';

const Game = lazy(() => import('./game/Game'));
type Page = 'Play' | 'My worlds' | 'Discover' | 'Settings';
type Dialog = 'create' | 'help' | 'updates' | 'profile' | 'about' | null;

function Logo({ small = false }: { small?: boolean }) {
  return <div className={`brand ${small ? 'brand-small' : ''}`}><PixelCube size={small ? 22 : 30} /><span>sandvoxel<span className="brand-period">_</span></span></div>;
}

function Modal({ children, onClose, className = '', label }: { children: ReactNode; onClose: () => void; className?: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    box.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handle); document.body.style.overflow = overflow; previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={box} tabIndex={-1} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label}><button className="modal-close icon-button" aria-label="Close dialog" onClick={onClose}><PixelIcon name="x" size={18} /></button>{children}</div></div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button>;
}

function SettingsPage({ settings, setSettings, notify }: { settings: Settings; setSettings: (settings: Settings) => void; notify: (text: string) => void }) {
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings({ ...settings, [key]: value });
  const [tab, setTab] = useState('Graphics');
  const tabs: { title: string; icon: IconName }[] = [{ title: 'Graphics', icon: 'monitor' }, { title: 'Controls', icon: 'gamepad' }, { title: 'Audio', icon: 'volume' }];
  return <div className="settings-layout"><div className="settings-tabs">{tabs.map(({ title, icon }) => <button key={title} className={tab === title ? 'active' : ''} onClick={() => setTab(title)}><PixelIcon name={icon} size={18} />{title}<PixelIcon name="chevronRight" size={14} /></button>)}</div><div className="settings-panel"><div className="panel-heading"><h2>{tab === 'Graphics' ? 'A world that looks like you.' : tab === 'Controls' ? 'Play your way.' : 'Find your sound.'}</h2><p>Settings are saved automatically on this device.</p></div>
    {tab === 'Graphics' && <><div className="setting-section"><label>Graphics quality</label><p>Find the right balance between crisp pixels and smooth play.</p><div className="quality-options">{(['Performance', 'Balanced', 'High'] as const).map((quality, index) => <button className={settings.quality === quality ? 'selected' : ''} key={quality} onClick={() => change('quality', quality)}><PixelIcon name={index === 0 ? 'leaf' : index === 1 ? 'monitor' : 'sparkle'} size={22} /><strong>{quality}</strong><span>{['Lower power usage', 'The best of both', 'Extra detail and shadows'][index]}</span>{settings.quality === quality && <PixelIcon name="check" size={15} className="quality-check" />}</button>)}</div></div><div className="setting-row"><div><label>Field of view</label><p>How much of the world you can see.</p></div><div className="range-control"><input aria-label="Field of view" type="range" min="55" max="110" value={settings.fov} onChange={e => change('fov', +e.target.value)} /><output>{settings.fov}</output></div></div><div className="setting-row"><div><label>Show FPS counter</label><p>Keep an eye on performance.</p></div><Toggle label="Show FPS counter" checked={settings.showFps} onChange={value => change('showFps', value)} /></div><div className="settings-note"><PixelIcon name="leaf" size={18} /><p>Playing on mobile? Performance mode uses less battery and keeps things smooth.</p></div></>}
    {tab === 'Controls' && <><div className="setting-row"><div><label>Look sensitivity</label><p>Set the speed of your mouse and touch camera.</p></div><div className="range-control"><input aria-label="Look sensitivity" type="range" min="1" max="100" value={settings.sensitivity} onChange={e => change('sensitivity', +e.target.value)} /><output>{settings.sensitivity}%</output></div></div><div className="setting-row"><div><label>Always show touch controls</label><p>Mobile controls are also detected automatically.</p></div><Toggle label="Always show touch controls" checked={settings.touch} onChange={value => change('touch', value)} /></div><div className="setting-row"><div><label>Invert vertical look</label><p>Reverse the up and down camera movement.</p></div><Toggle label="Invert vertical look" checked={settings.invertY} onChange={value => change('invertY', value)} /></div><div className="settings-note"><PixelIcon name="gamepad" size={18} /><p>Move with WASD, jump with Space, and select blocks with 1-9. In Creative mode, press F to fly.</p></div></>}
    {tab === 'Audio' && <><div className="setting-row"><div><label>Block sounds</label><p>A little feedback for every block you place or mine.</p></div><Toggle label="Block sounds" checked={settings.sound} onChange={value => change('sound', value)} /></div><div className="setting-row"><div><label>Sound volume</label><p>Keep it cozy, or turn it up.</p></div><div className="range-control"><input aria-label="Sound volume" type="range" min="0" max="100" value={settings.volume} onChange={e => change('volume', +e.target.value)} /><output>{settings.volume}%</output></div></div></>}
    <div className="settings-bottom"><span><PixelIcon name="check" size={15} /> All changes saved locally</span><button className="text-button" onClick={() => { setSettings(defaultSettings); notify('Settings restored to their defaults.'); }}>Reset to defaults</button></div></div></div>;
}

function CreateWorld({ onClose, onCreate, initialBiome = 'Forest' }: { onClose: () => void; onCreate: (name: string, biome: Biome, mode: GameMode, seed: number) => void; initialBiome?: Biome }) {
  const [name, setName] = useState('My little world');
  const [biome, setBiome] = useState<Biome>(initialBiome);
  const [mode, setMode] = useState<GameMode>('Creative');
  const [seed, setSeed] = useState(String(Math.floor(Math.random() * 999999)));
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    let number = Number(seed);
    if (!Number.isFinite(number)) number = [...seed].reduce((hash, c) => ((hash << 5) - hash + c.charCodeAt(0)) | 0, 0);
    onCreate(name.trim(), biome, mode, number);
  };
  return <Modal label="Create a world" onClose={onClose} className="create-modal"><div className="modal-symbol"><PixelIcon name="sprout" size={26} /></div><span className="eyebrow">A FRESH START</span><h2>Every world starts with you.</h2><p>A name, a landscape, and a little imagination.</p><form onSubmit={create}><label className="form-label" htmlFor="world-name">World name</label><input id="world-name" className="text-input" value={name} onChange={e => setName(e.target.value)} maxLength={32} placeholder="Give your world a name" required /><label className="form-label">Choose your landscape</label><div className="biome-options">{(['Forest', 'Desert', 'Alpine'] as Biome[]).map(item => <button type="button" key={item} className={`biome-option ${biome === item ? 'selected' : ''}`} onClick={() => setBiome(item)}><img src={biomeImages[item]} alt={`${item} voxel landscape`} /><span>{item}{biome === item && <PixelIcon name="check" size={14} />}</span></button>)}</div><label className="form-label">How do you want to play?</label><div className="mode-options">{(['Creative', 'Explorer'] as GameMode[]).map(item => <button type="button" key={item} onClick={() => setMode(item)} className={mode === item ? 'selected' : ''}><PixelIcon name={item === 'Creative' ? 'wand' : 'compass'} size={20} /><div><strong>{item}</strong><span>{item === 'Creative' ? 'Unlimited blocks. Freedom to fly.' : 'Keep your feet on the ground.'}</span></div><span className="radio-dot" /></button>)}</div><div className="seed-row"><label htmlFor="world-seed">World seed <span>Same seed, same landscape.</span></label><div><input id="world-seed" className="text-input" value={seed} maxLength={20} onChange={e => setSeed(e.target.value)} /><button type="button" className="icon-button" title="Randomize seed" onClick={() => setSeed(String(Math.floor(Math.random() * 999999)))}><PixelIcon name="sparkle" size={16} /></button></div></div><button type="submit" className="primary-button full-width"><PixelIcon name="plus" size={16} />Create and start exploring<PixelIcon name="arrowRight" size={16} /></button><div className="form-footnote"><PixelIcon name="drive" size={13} />Your world is saved in this browser, on this device.</div></form></Modal>;
}

function WorldCard({ world, onPlay, onAction, menu, setMenu }: { world: World; onPlay: () => void; onAction: (action: string) => void; menu: boolean; setMenu: () => void }) {
  return <article className="world-card"><button className="world-image-button" onClick={onPlay} aria-label={`Play ${world.name}`}><img src={biomeImages[world.biome]} alt={`${world.biome} landscape in ${world.name}`} /><span className={`world-mode ${world.mode.toLowerCase()}`}><PixelIcon name={world.mode === 'Creative' ? 'wand' : 'compass'} size={11} />{world.mode}</span><span className="world-image-play"><PixelIcon name="play" size={20} /></span>{world.favorite && <span className="world-favorite"><PixelIcon name="star" size={13} /></span>}</button><div className="world-card-info"><div className="world-card-title"><button onClick={onPlay}>{world.name}</button><div className="world-menu-wrap" onClick={e => e.stopPropagation()}><button aria-label={`Options for ${world.name}`} className={`icon-button ellipsis-button ${menu ? 'active' : ''}`} onClick={setMenu}><PixelIcon name="dots" size={18} /></button>{menu && <div className="world-dropdown">{([{ title: world.favorite ? 'Unfavorite' : 'Favorite', action: 'favorite', icon: 'star' }, { title: 'Rename world', action: 'rename', icon: 'pencil' }, { title: 'Duplicate world', action: 'duplicate', icon: 'copy' }, { title: 'Export save', action: 'export', icon: 'download' }, { title: 'Delete world', action: 'delete', icon: 'trash' }] as { title: string; action: string; icon: IconName }[]).map(({ title, action, icon }) => <button key={action} className={action === 'delete' ? 'danger' : ''} onClick={() => onAction(action)}><PixelIcon name={icon} size={14} />{title}</button>)}</div>}</div></div><div className="world-meta"><span><PixelIcon name={world.biome === 'Forest' ? 'trees' : world.biome === 'Desert' ? 'sun' : 'mountain'} size={12} />{world.biome}</span><i /><span><PixelIcon name="clock" size={12} />{world.played}</span><button aria-label={`Enter ${world.name}`} onClick={onPlay}><PixelIcon name="arrowRight" size={15} /></button></div></div></article>;
}

export default function App() {
  const [page, setPage] = useState<Page>('Play');
  const [worlds, setWorlds] = useState<World[]>(() => loadLocal(storageKey('worlds'), initialWorlds));
  const [settings, setSettings] = useState<Settings>(() => ({ ...defaultSettings, ...loadLocal(storageKey('settings'), defaultSettings) }));
  const [player, setPlayer] = useState(() => loadLocal(storageKey('player'), 'Alex'));
  const [playerDraft, setPlayerDraft] = useState(player);
  const [activeWorld, setActiveWorld] = useState<World | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [worldMenu, setWorldMenu] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All worlds');
  const [sort, setSort] = useState('Recently played');
  const [notice, setNotice] = useState('');
  const [editWorld, setEditWorld] = useState<World | null>(null);
  const [newName, setNewName] = useState('');
  const [deleteWorld, setDeleteWorld] = useState<World | null>(null);
  const [createBiome, setCreateBiome] = useState<Biome>('Forest');
  const [helpTab, setHelpTab] = useState('Desktop');
  const [updateSeen, setUpdateSeen] = useState(() => loadLocal(storageKey('update-seen'), false));
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (text: string) => { setNotice(text); if (noticeTimer.current) clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(''), 4500); };
  useEffect(() => { void platform.init(); }, []);
  useEffect(() => { if (!saveLocal(storageKey('worlds'), worlds)) notify('Your browser storage is full. Export your worlds to keep them safe.'); }, [worlds]);
  useEffect(() => { saveLocal(storageKey('settings'), settings); }, [settings]);
  useEffect(() => { const close = () => setWorldMenu(null); if (worldMenu) { window.addEventListener('click', close); return () => window.removeEventListener('click', close); } }, [worldMenu]);
  const navigate = (next: Page) => { setPage(next); setMobileMenu(false); setQuery(''); window.scrollTo({ top: 0 }); };
  const openCreate = (biome: Biome = 'Forest') => { setCreateBiome(biome); setDialog('create'); };
  const launch = (world: World) => {
    setWorlds(prev => prev.map(item => item.id === world.id ? { ...item, played: 'Just now', created: Date.now() } : item));
    setActiveWorld(world);
    setDialog(null);
    setWorldMenu(null);
  };
  const createWorld = (name: string, biome: Biome, mode: GameMode, seed: number) => {
    const world: World = { id: newId(), name, biome, mode, seed, played: 'Just now', created: Date.now(), favorite: false };
    setWorlds(prev => [world, ...prev]);
    setDialog(null);
    setActiveWorld(world);
  };
  const worldAction = (world: World, action: string) => {
    setWorldMenu(null);
    if (action === 'favorite') setWorlds(prev => prev.map(item => item.id === world.id ? { ...item, favorite: !item.favorite } : item));
    if (action === 'rename') { setEditWorld(world); setNewName(world.name); }
    if (action === 'delete') setDeleteWorld(world);
    if (action === 'duplicate') {
      const id = newId();
      const duplicate = { ...world, id, name: `${world.name} (copy)`, favorite: false, played: 'Ready to explore', created: Date.now() };
      const data = loadLocal(storageKey(`world-${world.id}`), null);
      if (data) saveLocal(storageKey(`world-${id}`), data);
      setWorlds(prev => [duplicate, ...prev]);
      notify('A fresh copy of your world is ready.');
    }
    if (action === 'export') {
      const save = loadLocal(storageKey(`world-${world.id}`), { keys: [], values: [] });
      const blob = new Blob([JSON.stringify({ version: 2, world, save }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${world.name.toLowerCase().replace(/\s+/g, '-')}.sandvoxel.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('World exported. Keep it somewhere safe.');
    }
  };
  const importRef = useRef<HTMLInputElement>(null);
  const importWorld = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.world || !['Forest', 'Desert', 'Alpine'].includes(data.world.biome) || !['Creative', 'Explorer'].includes(data.world.mode) || typeof data.world.name !== 'string' || !Number.isFinite(data.world.seed)) throw new Error('Invalid world');
      const keys: unknown[] = Array.isArray(data.save?.keys) ? data.save.keys : [];
      const values: unknown[] = Array.isArray(data.save?.values) ? data.save.values : [];
      if (keys.length > 200000 || keys.length !== values.length) throw new Error('Invalid blocks');
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = values[i];
        if (typeof key !== 'number' || !Number.isInteger(key) || typeof value !== 'number' || value < 0 || value > 9) throw new Error('Invalid blocks');
      }
      const id = newId();
      if (!saveLocal(storageKey(`world-${id}`), { keys, values, position: data.save?.position ?? null, rotation: data.save?.rotation ?? null, flying: !!data.save?.flying })) throw new Error('Storage full');
      setWorlds(prev => [{ ...data.world, name: String(data.world.name).slice(0, 32), id, created: Date.now(), played: 'Just imported', favorite: false }, ...prev]);
      notify('Welcome back. Your world has been imported.');
    } catch {
      notify('Could not import this file. Choose a valid Sandvoxel world save.');
    }
    if (importRef.current) importRef.current.value = '';
  };

  if (activeWorld) return <Suspense fallback={<div className="game-loading"><Logo /><PixelIcon name="loader" className="spin" size={28} /><h2>Growing your little world</h2><p>Making room for big ideas.</p></div>}><Game world={activeWorld} settings={settings} onExit={() => { setActiveWorld(null); notify('Home sweet home. Your world has been saved.'); }} /></Suspense>;

  const shownWorlds = worlds.filter(world => world.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'All worlds' || (filter === 'Favorites' ? world.favorite : world.mode === filter))).sort((a, b) => sort === 'Name A-Z' ? a.name.localeCompare(b.name) : sort === 'Recently played' ? b.created - a.created : Number(b.favorite) - Number(a.favorite));
  const homeWorlds = worlds.slice(0, 3);
  const navMain: { title: Page; icon: IconName }[] = [{ title: 'Play', icon: 'gamepad' }, { title: 'My worlds', icon: 'folder' }, { title: 'Discover', icon: 'compass' }];

  return <div className="app-shell">
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
      <button className="brand-button" onClick={() => navigate('Play')} aria-label="Sandvoxel home"><Logo /></button>
      <div className="sidebar-caption">YOUR LITTLE UNIVERSE</div>
      <nav className="main-navigation" aria-label="Main navigation">{navMain.map(({ title, icon }) => <button className={`nav-item ${page === title ? 'active' : ''}`} key={title} onClick={() => navigate(title)}><PixelIcon name={icon} size={19} /><span>{title}</span>{title === 'My worlds' && <span className="nav-count">{worlds.length}</span>}{title === 'Play' && page === 'Play' && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="sidebar-divider" />
      <div className="sidebar-caption second-caption">MAKE IT YOURS</div>
      <nav className="main-navigation"><button className={`nav-item ${page === 'Settings' ? 'active' : ''}`} onClick={() => navigate('Settings')}><PixelIcon name="gear" size={19} /><span>Settings</span></button><button className="nav-item" onClick={() => { setDialog('help'); setMobileMenu(false); }}><PixelIcon name="book" size={19} /><span>How to play</span><span className="key-shortcut">?</span></button></nav>
      <div className="sidebar-bottom">
        <div className="cozy-card"><PixelCube size={26} /><h3>No rush. Just create.</h3><p>A little escape.<br />A world of your own.</p><span className="cozy-dots">. . .</span></div>
        <button className="version-button" onClick={() => setDialog('updates')}><span><i className="status-dot" />Version 1.1.0</span><span className="version-label">What is new <PixelIcon name="arrowRight" size={12} /></span></button>
        <button className="made-with" onClick={() => setDialog('about')}>Made for the joy of building <PixelIcon name="heart" size={11} /></button>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><button className="mobile-menu-button icon-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><PixelIcon name="menu" size={20} /></button><span className="breadcrumb-home"><PixelCube size={18} /></span><span>Your space</span><PixelIcon name="chevronRight" size={12} /><strong>{page}</strong></div>
        <div className="header-right"><span className="local-status"><span className="status-dot" />All systems cozy</span><span className="header-divider" /><button className="notification-button icon-button" aria-label="What is new" onClick={() => { setDialog('updates'); setUpdateSeen(true); saveLocal(storageKey('update-seen'), true); }}><PixelIcon name="bell" size={17} />{!updateSeen && <i />}</button><button className="profile-button" onClick={() => { setPlayerDraft(player); setDialog('profile'); }}><span className="avatar" /><span>{player}</span><PixelIcon name="chevronDown" size={12} /></button></div>
      </header>
      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow">{page === 'Play' ? 'A LITTLE ESCAPE. A LOT OF POSSIBILITY.' : page === 'My worlds' ? 'PLACES THAT FEEL LIKE YOU' : page === 'Discover' ? 'FOLLOW YOUR CURIOSITY' : 'THE LITTLE DETAILS MATTER'}</div><h1>{page === 'Play' ? 'Let us build something good.' : page === 'My worlds' ? 'Your worlds, your stories.' : page === 'Discover' ? 'A new perspective awaits.' : 'Make yourself comfortable.'}</h1></div>{page !== 'Settings' && <button className="secondary-button create-top-button" onClick={() => openCreate()}><PixelIcon name="plus" size={15} />Create new world</button>}</div>
        {page === 'Play' && <>
          <section className="hero"><img className="hero-image" src={biomeImages.Forest} alt="A sunlit pixel voxel valley with a winding river, green hills, and block-built trees" /><div className="hero-shade" /><div className="hero-content"><div className="hero-label"><span className="status-dot" /> BIG ADVENTURES START SMALL</div><h2>Small blocks.<br />Endless possibilities.</h2><p>Build a hideaway. Explore the unknown.<br />Make a little world that is entirely yours.</p><div className="hero-actions"><button className="primary-button" onClick={() => openCreate()}><PixelIcon name="play" size={15} />Let us play<PixelIcon name="arrowRight" size={16} /></button><button className="hero-secondary" onClick={() => setDialog('help')}>New here? <span>How to play</span><PixelIcon name="arrowRight" size={13} /></button></div><div className="hero-caption"><PixelIcon name="globe" size={12} /><span>No downloads. No limits. Just you and your imagination.</span></div></div><div className="hero-world-tag"><span className="world-tag-icon"><PixelIcon name="trees" size={16} /></span><div>Somewhere worth getting lost.<span>The Overworld / Forest biome</span></div></div><div className="hero-pagination"><span /><i /><i /></div></section>
          <section className="worlds-section"><div className="section-heading"><div><h2>Pick up where you left off</h2><span className="count-badge">{worlds.length} worlds</span></div><button className="text-button" onClick={() => navigate('My worlds')}>View all worlds<PixelIcon name="arrowRight" size={15} /></button></div>{homeWorlds.length ? <div className="world-grid">{homeWorlds.map(world => <WorldCard key={world.id} world={world} onPlay={() => launch(world)} onAction={action => worldAction(world, action)} menu={worldMenu === world.id} setMenu={() => setWorldMenu(worldMenu === world.id ? null : world.id)} />)}</div> : <div className="empty-state"><PixelIcon name="sprout" size={32} /><h3>A little space for something new.</h3><p>Your next favorite place is one world away.</p><button className="primary-button" onClick={() => openCreate()}><PixelIcon name="plus" size={15} />Create a world</button></div>}</section>
          <section className="feature-row"><button className="feature-card device-feature" onClick={() => navigate('Settings')}><div className="feature-art"><PixelIcon name="monitor" size={28} /><PixelIcon name="phone" size={20} /></div><div><h3>Your world. Any screen.</h3><p>Made for desktop. Ready for mobile.</p></div><span className="feature-arrow"><PixelIcon name="arrowRight" size={16} /></span></button><button className="feature-card tip-feature" onClick={() => setDialog('help')}><div className="tip-icon"><PixelIcon name="sparkle" size={22} /></div><div><div className="tip-eyebrow">A LITTLE TIP</div><h3>There is no wrong way to play.</h3><p>Start small. Get curious. See what happens.</p></div><PixelIcon name="arrowRight" size={16} /></button></section>
        </>}
        {page === 'My worlds' && <>
          <div className="worlds-toolbar"><div className="world-filter-tabs">{['All worlds', 'Favorites', 'Creative', 'Explorer'].map(item => <button className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{item === 'Favorites' && <PixelIcon name="star" size={12} />}{item}{item === 'All worlds' && <span>{worlds.length}</span>}</button>)}</div><div className="world-toolbar-right"><div className="search-input"><PixelIcon name="search" size={15} /><input aria-label="Search worlds" placeholder="Find a world" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><PixelIcon name="x" size={13} /></button>}</div><div className="sort-wrap"><button className="secondary-button" onClick={() => setSort(sort === 'Recently played' ? 'Name A-Z' : sort === 'Name A-Z' ? 'Favorites first' : 'Recently played')}><PixelIcon name="clock" size={14} />{sort}<PixelIcon name="chevronDown" size={12} /></button></div></div></div>
          <div className="all-worlds-grid world-grid">{shownWorlds.map(world => <WorldCard key={world.id} world={world} onPlay={() => launch(world)} onAction={action => worldAction(world, action)} menu={worldMenu === world.id} setMenu={() => setWorldMenu(worldMenu === world.id ? null : world.id)} />)}<button className="new-world-card" onClick={() => openCreate()}><PixelIcon name="plus" size={22} /><h3>A new beginning</h3><p>There is always room for another world.</p></button></div>
          {shownWorlds.length === 0 && query && <div className="empty-search">No worlds match {query}. Try another name.</div>}
          <div className="import-panel"><div><PixelIcon name="drive" size={22} /><div><h3>Your worlds stay with you.</h3><p>Saved on this device. Export a backup from any world menu.</p></div></div><button className="secondary-button" onClick={() => importRef.current?.click()}><PixelIcon name="download" size={15} />Import a world</button><input hidden ref={importRef} type="file" accept=".json" onChange={e => void importWorld(e.target.files?.[0])} /></div>
        </>}
        {page === 'Discover' && <>
          <div className="discover-intro"><PixelIcon name="compass" size={22} /><p>A few places to spark your imagination. Choose a landscape to make it your own.</p><span>3 handpicked biomes</span></div>
          <div className="discover-grid">{([{ biome: 'Forest' as Biome, title: 'Find your quiet corner.', text: 'Winding rivers, oak canopies, and grassy hills. A cozy place to put down roots.', tag: 'THE EVERYDAY ESCAPE', icon: 'trees' as IconName }, { biome: 'Desert' as Biome, title: 'Chase the golden hour.', text: 'Warm sands and open skies. Build an oasis somewhere off the beaten path.', tag: 'A LITTLE WILD', icon: 'sun' as IconName }, { biome: 'Alpine' as Biome, title: 'Take the scenic route.', text: 'Snow-topped peaks and evergreen forests. Let your imagination reach a little higher.', tag: 'A BREATH OF FRESH AIR', icon: 'mountain' as IconName }]).map(({ biome, title, text, tag, icon }) => <article className="discover-card" key={biome}><div className="discover-image"><img src={biomeImages[biome]} alt={`${biome} voxel world`} /><span><PixelIcon name={icon} size={14} />{biome}</span></div><div className="discover-card-content"><span className="eyebrow">{tag}</span><h2>{title}</h2><p>{text}</p><button className="secondary-button full-width" onClick={() => openCreate(biome)}>Make this world yours<PixelIcon name="arrowRight" size={15} /></button></div></article>)}</div>
          <div className="discover-note"><PixelIcon name="sprout" size={30} /><h3>The best worlds have not been built yet.</h3><p>They are waiting for you. Every seed creates a different landscape to explore.</p><button className="text-button" onClick={() => openCreate()}>Find your next adventure<PixelIcon name="arrowRight" size={15} /></button></div>
        </>}
        {page === 'Settings' && <SettingsPage settings={settings} setSettings={setSettings} notify={notify} />}
        <footer className="main-footer"><span><PixelIcon name="shield" size={14} />A world of your own. Saved right here.</span><div><span><PixelIcon name="monitor" size={13} />Desktop</span><i /><span><PixelIcon name="phone" size={13} />Mobile ready</span><button onClick={() => setDialog('about')}>A little about us<PixelIcon name="external" size={12} /></button></div></footer>
      </main>
    </div>
    {dialog === 'create' && <CreateWorld initialBiome={createBiome} onClose={() => setDialog(null)} onCreate={createWorld} />}
    {dialog === 'help' && <Modal label="How to play" onClose={() => setDialog(null)} className="help-modal"><div className="modal-symbol"><PixelIcon name="book" size={25} /></div><span className="eyebrow">A LITTLE GUIDANCE</span><h2>Make yourself at home.</h2><p>No scores. No rush. Just a world waiting to be yours.</p><div className="help-tabs">{(['Desktop', 'Mobile', 'The basics'] as const).map(tab => <button className={helpTab === tab ? 'active' : ''} key={tab} onClick={() => setHelpTab(tab)}><PixelIcon name={tab === 'Desktop' ? 'monitor' : tab === 'Mobile' ? 'phone' : 'cube'} size={15} />{tab}</button>)}</div>{helpTab === 'Desktop' && <div className="controls-list">{[['W A S D', 'Move around', 'Arrow keys work, too.'], ['Mouse', 'Look around', 'Click into the game, or drag to look.'], ['Space', 'Jump', 'Hold Shift while moving to run.'], ['Left click / R', 'Mine a block', 'Aim at a block within reach.'], ['Right click / E', 'Place a block', 'Build on any face of another block.'], ['1-9 / Scroll', 'Pick your block', 'Nine building materials, endless ideas.'], ['F / Q', 'Fly / descend', 'Creative mode lets you reach higher.'], ['Esc', 'Take a break', 'Pause, save, or head back home.']].map(([key, title, text]) => <div key={key}><kbd>{key}</kbd><div><strong>{title}</strong><span>{text}</span></div></div>)}</div>}{helpTab === 'Mobile' && <div className="help-basics"><div><PixelIcon name="phone" size={22} /><h3>A world at your fingertips.</h3><p>Drag anywhere on the world to look around. Use the arrow pad on the left to move.</p></div><div><PixelIcon name="plus" size={22} /><h3>Tap, build, repeat.</h3><p>Aim the crosshair, then tap Mine or Build. Pick materials from the hotbar, and tap Jump to reach higher.</p></div><div><PixelIcon name="gear" size={22} /><h3>Keep it smooth.</h3><p>Touch controls appear automatically. For older devices, choose Performance in Settings, Graphics.</p></div></div>}{helpTab === 'The basics' && <div className="help-basics"><div><PixelIcon name="wand" size={22} /><h3>Creative means freedom.</h3><p>Unlimited blocks and the ability to fly. Build a cabin, a castle, or something no one has a name for yet.</p></div><div><PixelIcon name="compass" size={22} /><h3>Take the Explorer route.</h3><p>The same building freedom, with your feet on the ground. Jump, climb, and make your own paths.</p></div><div><PixelIcon name="drive" size={22} /><h3>Your world remembers.</h3><p>Changes save every 15 seconds and when you leave. Saves stay in this browser. Export a backup from My worlds to keep them safe.</p></div></div>}<button className="primary-button full-width" onClick={() => openCreate()}>I am ready to build<PixelIcon name="arrowRight" size={16} /></button></Modal>}
    {dialog === 'updates' && <Modal label="What is new" onClose={() => setDialog(null)}><div className="modal-symbol"><PixelIcon name="sparkle" size={26} /></div><span className="eyebrow">PIXEL EDITION / V1.1.0</span><h2>Hello, little world.</h2><p>Sandvoxel goes full pixel: bitmap font, hand-drawn pixel icons, and a chunkier renderer.</p><div className="update-hero"><img src={biomeImages.Forest} alt="The Sandvoxel forest landscape" /><span>Let us make something good.</span></div><div className="update-list">{[['A pixel everything', 'Bitmap type, pixel icons, and a low-resolution WebGL canvas scaled up for a crisp retro look.'], ['One core, every platform', 'Terrain, physics, and meshing live in a portable core shared by the browser and native builds.'], ['Your creations, kept close', 'Automatic local saves, world backups, and personalized graphics settings.']].map(([title, text]) => <div key={title}><PixelIcon name="check" size={16} /><div><h3>{title}</h3><p>{text}</p></div></div>)}</div><button className="primary-button full-width" onClick={() => setDialog(null)}>Sounds like a good start<PixelIcon name="arrowRight" size={15} /></button></Modal>}
    {dialog === 'profile' && <Modal label="Your profile" onClose={() => setDialog(null)} className="small-modal"><div className="modal-symbol"><PixelIcon name="sprout" size={26} /></div><span className="eyebrow">NICE TO SEE YOU</span><h2>A little more you.</h2><p>No account needed. Just a name for your corner of the world.</p><form onSubmit={e => { e.preventDefault(); if (!playerDraft.trim()) return; setPlayer(playerDraft.trim()); saveLocal(storageKey('player'), playerDraft.trim()); setDialog(null); notify('Looking good. Your name has been updated.'); }}><label className="form-label" htmlFor="player-name">What should we call you?</label><input className="text-input" id="player-name" required maxLength={18} value={playerDraft} onChange={e => setPlayerDraft(e.target.value)} /><button className="primary-button full-width" type="submit">Make it mine<PixelIcon name="check" size={16} /></button></form><div className="profile-local"><PixelIcon name="shield" size={15} />This profile stays on your device.</div></Modal>}
    {dialog === 'about' && <Modal label="About Sandvoxel" onClose={() => setDialog(null)} className="small-modal"><Logo /><div className="about-body"><span className="eyebrow">A LITTLE ESCAPE. A LOT OF HEART.</span><h2>Made for the joy of building.</h2><p>Sandvoxel is an independent voxel sandbox. A peaceful place to wander, imagine, and make something of your own.</p><p>The browser edition renders with WebGL on top of React and Three.js. Native editions compile the same TypeScript core to C and run on a software pixel renderer or SDL2 with OpenGL.</p><div className="about-note"><PixelIcon name="leaf" size={20} />No accounts. No downloads. No pressure.</div><small>Not affiliated with Minecraft, Mojang, or Microsoft. Landscape previews are illustrative; playable worlds are procedurally generated.</small></div></Modal>}
    {editWorld && <Modal label="Rename world" onClose={() => setEditWorld(null)} className="small-modal"><div className="modal-symbol"><PixelIcon name="pencil" size={24} /></div><h2>A new name. Same little world.</h2><p>Give this place a name that feels right.</p><form onSubmit={e => { e.preventDefault(); if (!newName.trim()) return; setWorlds(prev => prev.map(world => world.id === editWorld.id ? { ...world, name: newName.trim() } : world)); setEditWorld(null); notify('Your world has a lovely new name.'); }}><label className="form-label" htmlFor="rename-world">World name</label><input id="rename-world" className="text-input" value={newName} onChange={e => setNewName(e.target.value)} maxLength={32} required /><button className="primary-button full-width">Save name<PixelIcon name="check" size={15} /></button></form></Modal>}
    {deleteWorld && <Modal label="Delete world" onClose={() => setDeleteWorld(null)} className="small-modal"><div className="modal-symbol danger-symbol"><PixelIcon name="trash" size={25} /></div><h2>Say goodbye to this world?</h2><p>{deleteWorld.name} and all its saved blocks will be removed from this device. This cannot be undone.</p><div className="delete-actions"><button className="secondary-button" onClick={() => setDeleteWorld(null)}>Keep my world</button><button className="danger-button" onClick={() => { setWorlds(prev => prev.filter(world => world.id !== deleteWorld.id)); localStorage.removeItem(storageKey(`world-${deleteWorld.id}`)); setDeleteWorld(null); notify('World deleted. A little space for something new.'); }}><PixelIcon name="trash" size={14} />Delete world</button></div></Modal>}
    {notice && <div className="toast" role="status"><span><PixelIcon name="check" size={15} /></span>{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><PixelIcon name="x" size={15} /></button></div>}
  </div>;
}
