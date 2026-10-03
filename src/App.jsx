import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import { parseDeckXml, getServerUrl, generateId } from './DeckParser';
import { Search, Heart, Upload, Skull, Layers, Shield, Moon, Sun, MessageSquare, RefreshCw, PlusCircle, Shuffle, Eye, Droplet, Sun as SunIcon, Flame, TreePine, Skull as SwampIcon, Circle, Copy, Trash2, ChevronRight, Zap, Star, HelpCircle, Settings, Undo, Redo, Dices, Coins, EyeOff, Sparkles, BookOpen, Swords, Crosshair, Paperclip, Crown, Palette } from 'lucide-react';

// Persist Auth
const savedId = localStorage.getItem('cute-mtg-id') || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().substring(0, 12) : Math.random().toString(36).substring(2, 10));
localStorage.setItem('cute-mtg-id', savedId);

let savedName = localStorage.getItem('cute-mtg-name');
if (!savedName) {
  savedName = "Player";
  localStorage.setItem('cute-mtg-name', savedName);
}

const serverUrl = getServerUrl();
const needsServerUrl = (typeof window !== 'undefined' && window.location.protocol === 'file:' && !localStorage.getItem('mtg-server-url'));

const socket = io(serverUrl, {
  auth: { playerId: savedId, playerName: savedName },
  autoConnect: !needsServerUrl
});

const CARD_BACK = `${serverUrl}/api/card-back`;

// Secure Electron Bridge (via preload.js + contextBridge)
const isElectron = Boolean(window.electronAPI?.isElectron || new URLSearchParams(window.location.search).get('electron') === 'true');

const openExternalUrl = (url) => {
  try {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
      return;
    }
  } catch (err) {}
  window.open(url, '_blank', 'noopener,noreferrer');
};

// UI Components
const ManaSymbol = ({ color, amount, onClick, onContextMenu }) => {
  const colors = {
    W: { bg: 'bg-yellow-100', text: 'text-yellow-600', icon: <SunIcon size={14}/> },
    U: { bg: 'bg-blue-100', text: 'text-blue-600', icon: <Droplet size={14}/> },
    B: { bg: 'bg-gray-300', text: 'text-gray-800', icon: <SwampIcon size={14}/> },
    R: { bg: 'bg-red-100', text: 'text-red-600', icon: <Flame size={14}/> },
    G: { bg: 'bg-green-100', text: 'text-green-600', icon: <TreePine size={14}/> },
    C: { bg: 'bg-gray-100', text: 'text-gray-500', icon: <Circle size={14}/> },
  };
  const c = colors[color];
  return (
    <div 
      onClick={onClick} 
      onContextMenu={(e) => { 
        e.preventDefault(); 
        if (typeof onContextMenu === 'function') onContextMenu(e); 
      }}
      className={`${c.bg} ${c.text} flex items-center justify-center gap-1 px-2 py-1 rounded cursor-pointer font-bold select-none shadow-sm hover:brightness-95`}
    >
      {c.icon} {amount}
    </div>
  );
};

const COUNTER_TYPES = [
  { name: '+1/+1', icon: '🟢', color: 'bg-green-500' },
  { name: '-1/-1', icon: '🔴', color: 'bg-red-500' },
  { name: 'Charge', icon: '⚡', color: 'bg-yellow-500' },
  { name: 'Loyalty', icon: '🛡️', color: 'bg-slate-500' },
  { name: 'Poison', icon: '☠️', color: 'bg-emerald-700' },
  { name: 'Time', icon: '⏰', color: 'bg-blue-400' },
  { name: 'Death', icon: '💀', color: 'bg-gray-800' },
  { name: 'Blood', icon: '🩸', color: 'bg-red-700' },
  { name: 'Sleep', icon: '💤', color: 'bg-indigo-400' },
  { name: 'Flying', icon: '🕊️', color: 'bg-cyan-500' },
  { name: 'Trample', icon: '🦏', color: 'bg-orange-600' },
  { name: 'Lifelink', icon: '💖', color: 'bg-pink-500' },
  { name: 'Deathtouch', icon: '🐍', color: 'bg-green-800' },
  { name: 'First Strike', icon: '⚔️', color: 'bg-red-400' },
];

const SolitaireAnimation = ({ cards, onComplete }) => {
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '99999';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    
    const visibleCards = (cards || []).filter(c => c.imageUrl && !c.faceDown).slice(0, 30);
    const pool = visibleCards.length > 0 ? visibleCards : [{ imageUrl: CARD_BACK }];
    let activeCards = pool.map(c => ({
      img: new Image(),
      src: c.imageUrl,
      x: window.innerWidth / 2 - 50,
      y: window.innerHeight / 2 - 70,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 1) * 20,
      loaded: false
    }));
    
    activeCards.forEach(c => {
      c.img.src = c.src;
      c.img.onload = () => { c.loaded = true; };
    });

    let animId;
    const draw = () => {
      activeCards.forEach(c => {
        if (!c.loaded) return;
        ctx.drawImage(c.img, c.x, c.y, 100, 140);
        c.vy += 0.5; // gravity
        c.x += c.vx;
        c.y += c.vy;
        
        if (c.y + 140 > canvas.height) {
          c.y = canvas.height - 140;
          c.vy = -c.vy * 0.8; // bounce
        }
        if (c.x < 0 || c.x + 100 > canvas.width) {
          c.vx = -c.vx;
        }
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    
    return () => {
      cancelAnimationFrame(animId);
      canvas.remove();
    };
  }, []);
  
  return (
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/50" onClick={onComplete}>
      <h1 className="text-6xl font-bold text-white animate-pulse pointer-events-none drop-shadow-2xl">YOU WIN!</h1>
    </div>
  );
};

let currentFunnyAudio = null;
function playCreatureOgg(creatureTypes) {
  try {
    if (!creatureTypes || !Array.isArray(creatureTypes) || creatureTypes.length === 0) return;
    if (currentFunnyAudio) {
      try {
        currentFunnyAudio.pause();
        currentFunnyAudio.src = '';
      } catch (e) {}
      currentFunnyAudio = null;
    }

    const typesToTry = [...creatureTypes].reverse();
    function attempt(idx) {
      if (idx >= typesToTry.length) return;
      const clean = typesToTry[idx].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!clean) {
        attempt(idx + 1);
        return;
      }
      const url = `http://emily9121.free.fr/ogg/${clean}.ogg`;
      const audio = new Audio(url);
      audio.volume = 0.7;
      let hasError = false;
      audio.onerror = () => {
        if (!hasError) {
          hasError = true;
          attempt(idx + 1);
        }
      };
      currentFunnyAudio = audio;
      const p = audio.play();
      if (p && p.catch) {
        p.catch(() => {
          if (!hasError) {
            hasError = true;
            attempt(idx + 1);
          }
        });
      }
    }
    attempt(0);
  } catch (err) {
    // Fail silently
  }
}

function extractCardCreatureTypes(card) {
  if (!card) return [];
  const types = [];
  const typeLine = card.typeLine || card.type_line || card.type || '';
  if (typeLine.toLowerCase().includes('creature')) {
    const parts = typeLine.split(/[—\-]/);
    if (parts.length > 1) {
      const words = parts[1].trim().split(/\s+/);
      words.forEach(w => {
        const c = w.trim().replace(/[^a-zA-Z]/g, '');
        if (c) types.push(c);
      });
    }
  }
  const nameToCheck = card.frontName || card.name || '';
  if (types.length === 0 && nameToCheck) {
    const lowerName = nameToCheck.toLowerCase();
    const commonTypes = ['dinosaur', 'dragon', 'elf', 'goblin', 'zombie', 'vampire', 'angel', 'demon', 'beast', 'cat', 'dog', 'bird', 'human', 'wizard', 'warrior', 'knight', 'sliver', 'eldrazi', 'phyrexian', 'golem', 'merfolk'];
    for (const ct of commonTypes) {
      if (lowerName.includes(ct)) {
        types.push(ct.charAt(0).toUpperCase() + ct.slice(1));
      }
    }
  }
  return types;
}

function App() {
  const [cards, setCards] = useState([]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const [players, setPlayers] = useState({});
  const playersRef = useRef(players);
  playersRef.current = players;

  const myGraveCards = useMemo(() => 
    cards.filter(c => c.ownerId === savedId && c.zone === 'graveyard').sort((a,b) => (a.order ?? 0) - (b.order ?? 0)),
    [cards]
  );
  const oppGraveCards = useMemo(() => 
    cards.filter(c => c.ownerId !== savedId && c.zone === 'graveyard').sort((a,b) => (a.order ?? 0) - (b.order ?? 0)),
    [cards]
  );
  const myExileCards = useMemo(() => 
    cards.filter(c => c.ownerId === savedId && c.zone === 'exile').sort((a,b) => (a.order ?? 0) - (b.order ?? 0)),
    [cards]
  );
  const oppExileCards = useMemo(() => 
    cards.filter(c => c.ownerId !== savedId && c.zone === 'exile').sort((a,b) => (a.order ?? 0) - (b.order ?? 0)),
    [cards]
  );
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('cute-mtg-theme') || 'light');
  const [customCardBack, setCustomCardBack] = useState(() => localStorage.getItem('cute-mtg-custom-card-back') || '');
  const [customBattlefieldBg, setCustomBattlefieldBg] = useState(() => localStorage.getItem('cute-mtg-battlefield-bg') || '');
  const [appearanceTab, setAppearanceTab] = useState('sleeves');
  const [sleeveUrlInput, setSleeveUrlInput] = useState('');
  const [playmatUrlInput, setPlaymatUrlInput] = useState('');
  const [hoveredCardId, setHoveredCardId] = useState(null);
  const lastHoveredCardRef = useRef(null);

  const hoveredCard = useMemo(() => {
    if (!hoveredCardId) return null;
    return cards.find(c => c.id === hoveredCardId) || null;
  }, [cards, hoveredCardId]);

  const handleSetHoveredCard = (card) => {
    if (card) {
      setHoveredCardId(card.id);
      lastHoveredCardRef.current = card;
    } else {
      setHoveredCardId(null);
    }
  };
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const [chatInput, setChatInput] = useState('');
  const [isSolitaire, setIsSolitaire] = useState(false);
  const [isTableFlipped, setIsTableFlipped] = useState(false);
  const [isGay, setIsGay] = useState(false);
  const [isHeadpatted, setIsHeadpatted] = useState(false);
  const [modal, setModal] = useState(needsServerUrl ? { type: 'prompt_server_ip' } : null); // type: library_drop | scry | token_search | explore | add_counter | prompt_server_ip
  const [tokenSearchQuery, setTokenSearchQuery] = useState("");
  const [tokenResults, setTokenResults] = useState([]);
  const [exploreSearch, setExploreSearch] = useState("");
  const [selectedCards, setSelectedCards] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [londonSelected, setLondonSelected] = useState([]);
  const [hasDealtInitialHand, setHasDealtInitialHand] = useState(false);
  const [targetArrows, setTargetArrows] = useState([]);
  const [targetingSource, setTargetingSource] = useState(null); // { cardId, label }
  const [attachingCardId, setAttachingCardId] = useState(null);
  const [monarch, setMonarch] = useState(null);
  const [dayNight, setDayNight] = useState('none');
  const [stormCount, setStormCount] = useState(0);
  const [funnyMode, setFunnyMode] = useState(false);
  const funnyModeRef = useRef(false);
  funnyModeRef.current = funnyMode;
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [showTrackers, setShowTrackers] = useState(false);
  const [advancedPlay, setAdvancedPlay] = useState(() => localStorage.getItem('cute-mtg-advanced-play') === 'true');
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, title, confirmText, cancelText, isAlert, onConfirm, onCancel }

  const askConfirm = (message, title = "Confirmation", confirmText = "Confirm", cancelText = "Cancel") => {
    return new Promise((resolve) => {
      setConfirmDialog({
        title,
        message,
        confirmText,
        cancelText,
        isAlert: false,
        onConfirm: () => {
          setConfirmDialog(null);
          window.electronAPI?.refocusWindow();
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          window.electronAPI?.refocusWindow();
          resolve(false);
        }
      });
    });
  };

  const showAlert = (message, title = "Notice") => {
    return new Promise((resolve) => {
      setConfirmDialog({
        title,
        message,
        confirmText: "OK",
        cancelText: null,
        isAlert: true,
        onConfirm: () => {
          setConfirmDialog(null);
          window.electronAPI?.refocusWindow();
          resolve();
        },
        onCancel: () => {
          setConfirmDialog(null);
          window.electronAPI?.refocusWindow();
          resolve();
        }
      });
    });
  };

  const isModalDismissible = (m) => {
    if (!m) return true;
    if (m.type === 'prompt_server_ip') return false;
    if (m.type === 'london_mulligan') return false;
    if (m.type === 'scry') return false;
    return true;
  };

  const closeModal = () => {
    if (isModalDismissible(modal)) {
      setModal(null);
      setExploreSearch("");
      setTokenResults([]);
    }
  };

  const toggleAdvancedPlay = () => {
    setAdvancedPlay(prev => {
      const nextVal = !prev;
      localStorage.setItem('cute-mtg-advanced-play', nextVal ? 'true' : 'false');
      if (!nextVal) setShowTrackers(false);
      return nextVal;
    });
  };

  const myData = players[savedId] || { life: 20, mana: { w:0, u:0, b:0, r:0, g:0, c:0 } };
  const otherIds = Object.keys(players).filter(id => id !== savedId);
  const oppData = otherIds.length > 0 ? players[otherIds[0]] : { life: 20, name: "Opponent" };

  const myCardBack = myData.cardBack || customCardBack || CARD_BACK;
  const oppCardBack = oppData.cardBack || CARD_BACK;
  const getCardBackForCard = (c) => {
    if (!c) return myCardBack;
    if (c.ownerId === savedId || c.controllerId === savedId) return myCardBack;
    return (players[c.ownerId]?.cardBack) || oppCardBack;
  };

  const getBattlefieldStyle = (bgValue) => {
    if (!bgValue) return {};
    if (bgValue === 'preset:green_felt') {
      return { backgroundColor: '#133926', backgroundImage: 'radial-gradient(#1e4d36 1px, transparent 1px)', backgroundSize: '16px 16px' };
    }
    if (bgValue === 'preset:dark_marble') {
      return { backgroundColor: '#18181b', backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' };
    }
    if (bgValue === 'preset:cosmic') {
      return { backgroundColor: '#090a0f', backgroundImage: 'radial-gradient(circle at 50% 50%, #1e1b4b 0%, #090a0f 85%)' };
    }
    if (bgValue === 'preset:wood') {
      return { backgroundColor: '#2a1a12', backgroundImage: 'radial-gradient(#3d261a 1.5px, transparent 1.5px)', backgroundSize: '14px 14px' };
    }
    if (bgValue === 'preset:sakura') {
      return { backgroundColor: '#fdf2f8', backgroundImage: 'radial-gradient(#fbcfe8 1.5px, transparent 1.5px)', backgroundSize: '20px 20px' };
    }
    if (bgValue === 'preset:cyberpunk') {
      return { backgroundColor: '#090914', backgroundImage: 'linear-gradient(rgba(0, 255, 200, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 0, 128, 0.08) 1px, transparent 1px)', backgroundSize: '32px 32px' };
    }
    if (bgValue.startsWith('http') || bgValue.startsWith('data:') || bgValue.startsWith('url(')) {
      return { backgroundImage: bgValue.startsWith('url(') ? bgValue : `url("${bgValue}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
    }
    return { backgroundColor: bgValue };
  };

  const handleSetCardBack = (val) => {
    setCustomCardBack(val);
    if (val) localStorage.setItem('cute-mtg-custom-card-back', val);
    else localStorage.removeItem('cute-mtg-custom-card-back');
    updatePlayer({ cardBack: val });
  };

  const handleSetBattlefieldBg = (val) => {
    setCustomBattlefieldBg(val);
    if (val) localStorage.setItem('cute-mtg-battlefield-bg', val);
    else localStorage.removeItem('cute-mtg-battlefield-bg');
    updatePlayer({ battlefieldBg: val });
  };

  const uploadAssetToServer = async (base64Data) => {
    try {
      const res = await fetch(`${serverUrl}/api/upload-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64Data })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.url) return `${serverUrl}${json.url}`;
      }
    } catch (err) {
      console.warn("Asset upload to server failed, using local Data URI:", err);
    }
    return base64Data;
  };

  const resizeImageFile = (file, maxWidth, maxHeight, quality = 0.85) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  useEffect(() => {
    updatePlayer({ cardBack: customCardBack, battlefieldBg: customBattlefieldBg });
  }, [customCardBack, customBattlefieldBg]);

  const myHandCards = cards.filter(c => c.ownerId === savedId && c.zone === 'hand');
  const myLibraryCards = cards.filter(c => c.ownerId === savedId && c.zone === 'library');
  const isOpeningDeal = !hasDealtInitialHand && myHandCards.length === 0 && myLibraryCards.length > 0;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (confirmDialog) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (confirmDialog.isAlert) confirmDialog.onConfirm();
          else confirmDialog.onCancel();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmDialog.onConfirm();
          return;
        }
        return;
      }

      if (e.key === 'Escape') {
        if (targetingSource) { setTargetingSource(null); return; }
        if (attachingCardId) { setAttachingCardId(null); return; }
        if (modal && isModalDismissible(modal)) {
          closeModal();
          return;
        }
        return;
      }

      if (modal !== null) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          socket.emit('undo');
          return;
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          socket.emit('redo');
          return;
        }
      }

      // Guard: do not let other modifier combinations trigger game shortcuts (A7)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Guard: prevent repeat on non-repeatable actions (A7)
      const repeatSafe = new Set(['+', '-', ']', '[', 'l', 'g', 'p']);
      if (e.repeat && !repeatSafe.has(e.key.toLowerCase())) return;

      // Card-specific keybinds strictly require hovering a card (A7 residual)
      if (hoveredCard && hoveredCard.id) {
        const targetId = hoveredCard.id;
        if (e.key === '+') {
          modifyCard(targetId, (c) => ({ counters: (c.counters ?? 0) + 1 }));
          return;
        } else if (e.key === '-') {
          modifyCard(targetId, (c) => ({ counters: Math.max(0, (c.counters ?? 0) - 1) }));
          return;
        } else if (e.key.toLowerCase() === 'c') {
          duplicateCard(targetId);
          return;
        } else if (e.key === 'Delete') {
          deleteCard(targetId);
          return;
        } else if (e.key.toLowerCase() === 't') {
          modifyCard(targetId, (c) => ({ isTapped: !c.isTapped }));
          return;
        } else if (e.key.toLowerCase() === 'f') {
          modifyCard(targetId, (c) => ({ faceDown: !c.faceDown }));
          return;
        } else if (e.key.toLowerCase() === 'q') {
          transformCard(targetId);
          return;
        } else if (e.key.toLowerCase() === 'a') {
          startTargeting(targetId, 'Attacks');
          return;
        } else if (e.key.toLowerCase() === 'x') {
          startTargeting(targetId, 'Targets');
          return;
        } else if (e.key.toLowerCase() === 'e') {
          startAttaching(targetId);
          return;
        } else if (e.key === ']') {
          adjustCardPT(targetId, 1, 1);
          return;
        } else if (e.key === '[') {
          adjustCardPT(targetId, -1, -1);
          return;
        } else if (e.key.toLowerCase() === 'n') {
          modifyCard(targetId, (c) => {
            const next = !c.noUntap;
            logAction(`${next ? 'locked' : 'unlocked'} ${c.name || 'card'} (Does ${next ? 'NOT' : ''} untap automatically).`);
            return { noUntap: next };
          });
          return;
        } else if (e.key.toLowerCase() === 'v') {
          if (hoveredCard.zone === 'hand') {
            revealSingleCard(hoveredCard);
            return;
          }
        } else if (e.key === '?' || e.key === '/') {
          const cardName = hoveredCard.frontName || hoveredCard.name;
          if (cardName) {
            openExternalUrl(`https://www.google.com/search?q=${encodeURIComponent(cardName + ' rules mtg')}`);
            logAction(`searched rules for "${cardName}".`);
            return;
          }
        }
      }

      if (e.key.toLowerCase() === 'd') {
        drawCard(1);
      } else if (e.key.toLowerCase() === 'u') {
        untapAll();
      } else if (e.key.toLowerCase() === 'm') {
        if (isOpeningDeal) {
          dealOpeningHand();
        } else {
          startLondonMulligan(false);
        }
        return;
      } else if (e.key.toLowerCase() === 'k') {
        flipCoin();
      } else if (e.key === '6') {
        rollD6();
      } else if (e.key.toLowerCase() === 'y') {
        rollPlanar();
      } else if (e.key.toLowerCase() === 'h') {
        toggleRevealHand();
      } else if (e.key.toLowerCase() === 'b') {
        setModal({ type: 'explore', zone: 'sideboard', ownerId: savedId });
      } else if (e.key.toLowerCase() === 's') {
        startScry(1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (e.key === ' ') e.preventDefault();
        if (activePlayerId === savedId) {
          clearTempBuffs();
          logAction(`\n\n------------------------\nPASSES THE TURN\n------------------------\n\n`); 
          socket.emit('pass-turn', savedId);
        } else if (activePlayerId === null) {
          logAction(`takes the first turn!`); 
          socket.emit('take-turn', savedId);
        }
      } else if (e.key.toLowerCase() === 'r') {
        const roll = Math.floor(Math.random() * 20) + 1;
        logAction(`rolled a d20: [ ${roll} ]!`);
      } else if (e.key.toLowerCase() === 'l') {
        updatePlayer(p => ({ life: (p.life ?? 20) - 1 }));
      } else if (e.key.toLowerCase() === 'g') {
        updatePlayer(p => ({ life: (p.life ?? 20) + 1 }));
      } else if (e.key.toLowerCase() === 'p') {
        if (e.shiftKey) {
          updatePlayer(p => ({ poison: Math.max(0, (p.poison ?? 0) - 1) }));
        } else {
          updatePlayer(p => ({ poison: (p.poison ?? 0) + 1 }));
        }
      } else if (e.key.toLowerCase() === 'e') {
        if (e.shiftKey) {
          updatePlayer(p => ({ energy: Math.max(0, (p.energy ?? 0) - 1) }));
        } else {
          updatePlayer(p => ({ energy: (p.energy ?? 0) + 1 }));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoveredCard, cards, selectedCards, activePlayerId, players, modal, confirmDialog, mulliganCount, hasDealtInitialHand, targetingSource, attachingCardId, isOpeningDeal]);

  // Global handler to permanently prevent focus traps and stuck drag states
  useEffect(() => {
    const handleGlobalMouseDown = (e) => {
      // If clicking outside an active input or textarea, blur it so game focus is immediately restored
      if (document.activeElement && 
          (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') && 
          e.target !== document.activeElement && 
          !document.activeElement.contains(e.target)) {
        document.activeElement.blur();
        window.electronAPI?.setIgnoreMenuShortcuts(false);
      }
    };

    const handleGlobalDragEnd = () => {
      setSelectionBox(null);
    };

    const handleWindowFocus = () => {
      setSelectionBox(null);
    };

    window.addEventListener('mousedown', handleGlobalMouseDown, true);
    window.addEventListener('dragend', handleGlobalDragEnd, true);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown, true);
      window.removeEventListener('dragend', handleGlobalDragEnd, true);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    if (modal?.type === 'add_counter') {
      window.focus();
      window.electronAPI?.refocusWindow();
      const timer = setTimeout(() => {
        const el = document.getElementById('customName');
        if (el) {
          el.focus();
          el.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [modal]);

  useEffect(() => {
    localStorage.setItem('cute-mtg-theme', theme);
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  useEffect(() => {
    socket.on('sync', (data) => {
      setCards(data.cards ? data.cards.sort((a,b) => a.order - b.order) : []);
      setPlayers(data.players || {});
      setActivePlayerId(data.activePlayerId || null);
      if (data.logs) setLogs(data.logs);
      if (data.targetArrows !== undefined) setTargetArrows(data.targetArrows);
      if (data.monarch !== undefined) setMonarch(data.monarch);
      if (data.dayNight !== undefined) setDayNight(data.dayNight);
      if (data.stormCount !== undefined) setStormCount(data.stormCount);
      if (data.funnyMode !== undefined) {
        setFunnyMode(data.funnyMode);
        funnyModeRef.current = data.funnyMode;
      }
    });

    socket.on('play-funny-sound', (data) => {
      if (data && data.creatureTypes) {
        playCreatureOgg(data.creatureTypes);
      }
    });
    
    socket.on('play-animation', (anim) => {
      if (anim === 'solitaire') setIsSolitaire(true);
      if (anim === 'fliptable') setIsTableFlipped(true);
      if (anim === 'unflip') setIsTableFlipped(false);
      if (anim === 'gay') {
        setIsGay(true);
        setTimeout(() => setIsGay(false), 4000);
      }
      if (anim && anim.type === 'headpats') {
        setIsHeadpatted(true);
        setTimeout(() => setIsHeadpatted(false), 4000);
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            if (ctx.state === 'suspended') {
              ctx.resume().catch(() => {});
            }
            const playClick = (time) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(6000, time);
              osc.frequency.exponentialRampToValueAtTime(100, time + 0.02);
              gain.gain.setValueAtTime(0, time);
              gain.gain.linearRampToValueAtTime(1, time + 0.002);
              gain.gain.exponentialRampToValueAtTime(0.01, time + 0.02);
              osc.start(time);
              osc.stop(time + 0.02);
            };
            playClick(ctx.currentTime);
            playClick(ctx.currentTime + 0.15); // double clicker sound
            setTimeout(() => {
              try { ctx.close(); } catch(e) {}
            }, 600);
          }
        } catch(e) {}
      }
    });

    return () => {
      socket.off('sync');
      socket.off('play-animation');
      socket.off('play-funny-sound');
    };
  }, []);

  const broadcastCards = (changedCards) => socket.emit('update-cards', changedCards);
  const logAction = (msg) => socket.emit('send-log', `${savedName} ${msg}`);
  const updatePlayer = (updatesOrUpdater) => {
    setPlayers(prev => {
      const currentMe = prev[savedId] || {};
      const updates = typeof updatesOrUpdater === 'function' ? updatesOrUpdater(currentMe) : updatesOrUpdater;
      const nextMe = { ...currentMe, ...updates };
      socket.emit('update-player', updates);
      if (playersRef.current) {
        playersRef.current = { ...prev, [savedId]: nextMe };
      }
      return { ...prev, [savedId]: nextMe };
    });
  };
  const oppId = otherIds[0] || 'opponent';

  const transformCard = (cardId) => {
    const targetCard = cards.find(c => c.id === cardId);
    if (!targetCard) return;
    if (targetCard.ownerId !== savedId && targetCard.controllerId !== savedId) return;
    modifyCard(cardId, (card) => {
      if (!card.backImageUrl && !card.backName) {
        return {};
      }
      const nextTransformed = !card.isTransformed;
      const nextImg = nextTransformed ? (card.backImageUrl || card.imageUrl) : (card.frontImageUrl || card.imageUrl);
      const nextName = nextTransformed ? (card.backName || card.name) : (card.frontName || card.name);
      return {
        isTransformed: nextTransformed,
        imageUrl: nextImg,
        name: nextName
      };
    });
    if (targetCard.backImageUrl || targetCard.backName) {
      const nextTransformed = !targetCard.isTransformed;
      const destName = nextTransformed ? (targetCard.backName || 'back face') : (targetCard.frontName || 'front face');
      logAction(`transformed ${targetCard.name} into ${destName}.`);
    }
  };

  const startTargeting = (cardId, label = 'Targets') => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    setTargetingSource({ cardId, label });
  };

  const completeTargeting = (targetCardId = null, targetPlayerId = null) => {
    if (!targetingSource) return;
    const sourceCard = cards.find(c => c.id === targetingSource.cardId);
    if (!sourceCard) {
      setTargetingSource(null);
      return;
    }
    let targetName = 'Target';
    if (targetCardId) {
      const tc = cards.find(c => c.id === targetCardId);
      targetName = tc ? tc.name : 'a card';
    } else if (targetPlayerId) {
      targetName = players[targetPlayerId]?.name || 'Player';
    }

    const newArrow = {
      id: 'arr-' + Math.random().toString(36).substring(2, 9),
      fromCardId: targetingSource.cardId,
      toCardId: targetCardId,
      toPlayerId: targetPlayerId,
      label: targetingSource.label,
      ownerId: savedId,
      color: targetingSource.label === 'Attacks' ? '#ef4444' : '#3b82f6'
    };

    const nextArrows = [...targetArrows, newArrow];
    setTargetArrows(nextArrows);
    socket.emit('set-target-arrows', nextArrows);
    logAction(`${targetingSource.label === 'Attacks' ? 'attacked' : 'targeted'} ${targetName} with ${sourceCard.name}. 🏹`);
    setTargetingSource(null);
  };

  const removeArrow = (arrowId) => {
    const next = targetArrows.filter(a => a.id !== arrowId);
    setTargetArrows(next);
    socket.emit('set-target-arrows', next);
  };

  const clearTargetArrows = () => {
    setTargetArrows([]);
    socket.emit('clear-target-arrows');
    logAction(`cleared all targeting arrows.`);
  };

  const startAttaching = (cardId) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    setAttachingCardId(cardId);
  };

  const attachCard = (sourceId, targetHostId) => {
    const sourceCard = cards.find(c => c.id === sourceId);
    const hostCard = cards.find(c => c.id === targetHostId);
    if (!sourceCard || !hostCard) {
      setAttachingCardId(null);
      return;
    }
    if (sourceId === targetHostId) {
      setAttachingCardId(null);
      return;
    }
    modifyCard(sourceId, { attachedTo: targetHostId }, false);
    logAction(`attached ${sourceCard.name} to ${hostCard.name}. 📎`);
    setAttachingCardId(null);
  };

  const detachCard = (cardId) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const hostCard = cards.find(c => c.id === card.attachedTo);
    const newX = hostCard ? hostCard.x + 110 : card.x + 20;
    const newY = hostCard ? hostCard.y : card.y;
    modifyCard(cardId, { attachedTo: null, x: newX, y: newY }, false);
    logAction(`detached ${card.name}.`);
  };

  const adjustCardPT = (cardId, dP, dT) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    if (card.ownerId !== savedId && card.controllerId !== savedId) return;
    const p = (card.tempPower || 0) + dP;
    const t = (card.tempToughness || 0) + dT;
    modifyCard(cardId, { tempPower: p, tempToughness: t });
    logAction(`buffed ${card.name} (${p >= 0 ? '+' + p : p}/${t >= 0 ? '+' + t : t} temp).`);
  };

  const clearTempBuffs = () => {
    const myBattlefieldCards = cards.filter(c => (c.controllerId ? c.controllerId === savedId : c.ownerId === savedId) && c.zone === 'battlefield' && ((c.tempPower || 0) !== 0 || (c.tempToughness || 0) !== 0));
    if (myBattlefieldCards.length === 0) return;
    const updates = myBattlefieldCards.map(c => ({ id: c.id, tempPower: 0, tempToughness: 0 }));
    broadcastCards(updates);
    setCards(prev => prev.map(c => {
      const u = updates.find(x => x.id === c.id);
      return u ? { ...c, tempPower: 0, tempToughness: 0 } : c;
    }));
    logAction(`cleared all temporary P/T buffs for end of turn.`);
  };

  const claimMonarch = (pId) => {
    socket.emit('set-monarch', pId);
  };

  const cycleDayNight = () => {
    const nextVal = dayNight === 'none' ? 'day' : dayNight === 'day' ? 'night' : 'none';
    socket.emit('set-day-night', nextVal);
  };

  const handleBoardMouseMove = (e) => {
    if (!targetingSource) return;
    const container = document.getElementById('battlefield-container');
    if (container) {
      const rect = container.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const getCenter = (el, container) => {
    if (!el || !container) return null;
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    return {
      x: elRect.left - cRect.left + elRect.width / 2,
      y: elRect.top - cRect.top + elRect.height / 2
    };
  };

  const setStartingLife = (amt) => {
    updatePlayer({ life: amt, startingLife: amt });
    logAction(`set starting life to ${amt} (${amt === 40 ? 'Commander' : amt === 30 ? 'Two-Headed Giant' : 'Constructed'}).`);
  };

  const updateCommanderDamage = (commId, delta, commName) => {
    const current = myData.commanderDamage?.[commId] ?? 0;
    const next = Math.max(0, current + delta);
    const applied = next - current;
    if (applied === 0) return;
    const newDamage = { ...(myData.commanderDamage || {}), [commId]: next };
    updatePlayer({ commanderDamage: newDamage });
    logAction(`adjusted commander damage from ${commName}: ${next}/21 (${applied > 0 ? '+' + applied : applied}).`);
  };

  const startLondonMulligan = async (skipConfirm = false) => {
    if (!skipConfirm && !isOpeningDeal) {
      const ok = await askConfirm("Start London Mulligan? (Returns hand to library, shuffles, and draws 7)", "London Mulligan", "Mulligan", "Cancel");
      if (!ok) return;
    }
    if (mulliganCount >= 7) {
      logAction(`cannot take another London Mulligan (limit of 7 reached).`);
      return;
    }
    const nextCount = Math.min(7, mulliganCount + 1);
    setMulliganCount(nextCount);

    // MTG Rule 103.4: London mulligan only returns HAND cards to library
    const myHand = cards.filter(c => c.ownerId === savedId && c.zone === 'hand');
    const myLibrary = cards.filter(c => c.ownerId === savedId && c.zone === 'library');

    // Combine library and hand, assign fresh random order
    const combined = [...myLibrary, ...myHand].map(c => ({
      ...c,
      zone: 'library',
      faceDown: true,
      x: 0, y: 0,
      isTapped: false,
      counters: 0,
      customCounters: {},
      tempPower: 0,
      tempToughness: 0,
      attachedTo: null,
      order: Math.random()
    })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const toDraw = combined.slice(-7);
    const remainingInLibrary = combined.slice(0, -7);

    const updates = [
      ...remainingInLibrary,
      ...toDraw.map((c, i) => ({
        ...c,
        zone: 'hand',
        faceDown: false,
        order: Date.now() + i
      }))
    ];

    const updateMap = new Map(updates.map(u => [u.id, u]));
    const newCards = cards.map(c => updateMap.get(c.id) || c);
    setCards(newCards);
    broadcastCards(updates);
    setLondonSelected([]);

    logAction(`took London Mulligan #${nextCount} (shuffled hand into library and drew 7).`);
    setModal({ type: 'london_mulligan', count: nextCount });
  };

  const resetRound = () => {
    socket.emit('reset-round', savedId);
    setMulliganCount(0);
    setHasDealtInitialHand(false);
  };

  const toggleRevealHand = () => {
    const next = !myData.revealedHand;
    updatePlayer({ revealedHand: next });
    logAction(next ? `revealed their hand to opponents.` : `hid their hand.`);
  };

  const revealSingleCard = (card) => {
    logAction(`reveals [ ${card.name} ] from hand!`);
  };

  const millCards = (amount) => {
    const myLibrary = cards
      .filter(c => c.ownerId === savedId && c.zone === 'library')
      .sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    if (myLibrary.length === 0) return;
    const toMill = myLibrary.slice(-amount);
    if (toMill.length === 0) return;
    moveCards(toMill.map(c => c.id), 'graveyard');
    logAction(`milled ${toMill.length} card(s): ${toMill.map(c => c.name || 'card').join(', ')}.`);
  };

  const exileTopCards = (amount, faceDown = false) => {
    const myLibrary = cards
      .filter(c => c.ownerId === savedId && c.zone === 'library')
      .sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    if (myLibrary.length === 0) return;
    const toExile = myLibrary.slice(-amount);
    if (toExile.length === 0) return;
    const ids = toExile.map(c => c.id);
    moveCards(ids, 'exile', 0, 0, false, null, faceDown ? true : null);
    logAction(`exiled ${toExile.length} card(s) from top of library${faceDown ? ' (face-down)' : ''}.`);
  };

  const discardRandomCard = () => {
    const myHand = cards.filter(c => c.ownerId === savedId && c.zone === 'hand');
    if (myHand.length === 0) return;
    const randomCard = myHand[Math.floor(Math.random() * myHand.length)];
    moveCard(randomCard.id, 'graveyard');
    logAction(`discarded a random card: ${randomCard.name || 'a card'}.`);
  };

  const flipCoin = () => {
    const isHeads = Math.random() < 0.5;
    const result = isHeads ? 'HEADS' : 'TAILS';
    logAction(`flipped a coin: [ ${result} ]!`);
  };

  const rollD6 = () => {
    const roll = Math.floor(Math.random() * 6) + 1;
    logAction(`rolled a d6: [ ${roll} ]`);
  };

  const rollPlanar = () => {
    const outcomes = ['CHAOS', 'PLANESWALK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];
    logAction(`rolled the Planar Die: [ ${result} ]`);
  };

  const payCompanionToHand = (card) => {
    moveCard(card.id, 'hand');
    logAction(`paid {3} to put companion ${card.name} into their hand.`);
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim().toLowerCase();
    if (msg === '/restart') {
      const ok = await askConfirm("Are you sure you want to completely hard reset the game and clear all cards and undo history for both players?", "Hard Reset Game", "Hard Reset", "Cancel");
      if (ok) {
        socket.emit('hard-reset');
      }
    } else if (msg === '/clear') {
      setLogs([]);
      socket.emit('clear-logs');
    } else if (msg.startsWith('/roll')) {
      const parts = msg.split(' ');
      const sides = parseInt(parts[1], 10) || 20;
      const roll = Math.floor(Math.random() * sides) + 1;
      logAction(`rolled a d${sides}: [ ${roll} ]`);
    } else if (msg === '/mulligan') {
      startLondonMulligan();
    } else if (msg === '/flip' || msg === '/coin') {
      flipCoin();
    } else if (msg === '/d6') {
      rollD6();
    } else if (msg === '/planar') {
      rollPlanar();
    } else if (msg.startsWith('/mill')) {
      const parts = msg.split(' ');
      const count = parseInt(parts[1], 10) || 1;
      millCards(count);
    } else if (msg === '/solitaire') {
      socket.emit('trigger-animation', 'solitaire');
      logAction(`won the game! (Solitaire mode)`);
    } else if (msg === '/fliptable') {
      socket.emit('trigger-animation', 'fliptable');
      logAction(`flipped the table! (╯°□°）╯︵ ┻━┻`);
    } else if (msg === '/unflip') {
      socket.emit('trigger-animation', 'unflip');
      logAction(`unflipped the table. ┬─┬ ノ( ゜-゜ノ)`);
    } else if (msg === '/gay') {
      socket.emit('trigger-animation', 'gay');
      logAction(`thinks someone here is gay 🏳️‍🌈`);
    } else if (msg.startsWith('/rule')) {
      const parts = chatInput.trim().split(/\s+/);
      let queryTarget = '';
      if (parts.length > 1) {
        queryTarget = parts.slice(1).join(' ');
      } else {
        const target = hoveredCard || lastHoveredCardRef.current;
        if (target) {
          queryTarget = target.frontName || target.name;
        }
      }

      if (queryTarget) {
        const fullQuery = `${queryTarget} rules mtg`;
        openExternalUrl(`https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`);
        logAction(`searched rules for "${queryTarget}".`);
      } else {
        logAction(`[Rule Search] Hover over any card or type "/rule <card name>" to search rules.`);
      }
    } else if (msg === '/headpats') {
      socket.emit('trigger-animation', { type: 'headpats', from: savedId });
      logAction(`sends headpats!`);
    } else if (msg === '/funnymode' || msg === '/funny') {
      socket.emit('toggle-funny-mode');
      if (!socket.connected) {
        const next = !funnyModeRef.current;
        setFunnyMode(next);
        funnyModeRef.current = next;
        logAction(`turned Funny Mode ${next ? 'ON 🎉 (Creature sound themes active)' : 'OFF'}.`);
      }
    } else {
      socket.emit('send-log', `${savedName} says: ${chatInput}`);
    }
    setChatInput('');
  };

  const loadDeckFromXml = async (xmlString, filename = 'deck') => {
    const currentCards = cardsRef.current || cards;
    const currentOwned = currentCards.filter(c => c.ownerId === savedId);
    if (currentOwned.length > 0) {
      const ok = await askConfirm("Loading a new deck will replace all your current cards. Continue?", "Load New Deck", "Load Deck", "Cancel");
      if (!ok) return;
    }

    try {
      const parseResult = await parseDeckXml(xmlString);
      const deckCards = Array.isArray(parseResult) ? parseResult : (parseResult.cards || []);
      const unresolved = parseResult.unresolved || parseResult._unresolvedCards || [];
      if (unresolved.length > 0) {
        logAction(`[Deck Import Warning] Could not find data for ${unresolved.length} card(s): ${unresolved.slice(0, 5).join(', ')}${unresolved.length > 5 ? '...' : ''}`);
      }

      const newDeckCards = deckCards.map(c => {
        const zLow = (c.zone || '').toLowerCase();
        const isCompanion = Boolean(c.isCompanion || zLow.includes('companion'));
        const isCommander = Boolean((c.isCommander || zLow.includes('command')) && !isCompanion);
        const isSideboard = Boolean(c.isSideboard || zLow.includes('sideboard'));
        let finalZone = 'library';
        if (isCommander || isCompanion) finalZone = 'command_zone';
        else if (isSideboard) finalZone = 'sideboard';
        
        return {
          ...c,
          ownerId: savedId, 
          originalOwnerId: savedId,
          controllerId: savedId,
          zone: finalZone,
          originalZone: finalZone,
          x: 0, y: 0,
          isTapped: false,
          counters: 0,
          customCounters: {},
          isCommander,
          commanderTax: 0,
          isCompanion,
          frontImageUrl: c.frontImageUrl || c.imageUrl,
          backImageUrl: c.backImageUrl || null,
          frontName: c.frontName || c.name,
          backName: c.backName || null,
          isTransformed: false,
          tempPower: 0,
          tempToughness: 0,
          attachedTo: null
        };
      });
      
      setHasDealtInitialHand(false);
      setMulliganCount(0);
      const remaining = currentCards.filter(c => c.ownerId !== savedId);
      setCards([...remaining, ...newDeckCards].sort((a,b) => (a.order ?? 0) - (b.order ?? 0)));
      const deletions = currentCards.filter(c => c.ownerId === savedId).map(c => ({ id: c.id, delete: true }));
      broadcastCards([...deletions, ...newDeckCards]);
      logAction(`loaded and shuffled ${filename}.`);
    } catch (err) {
      console.error("Failed to parse deck:", err);
      await showAlert("Failed to load deck: " + err.message, "Deck Load Error");
    }
  };

  const isOpeningDeckRef = useRef(false);
  const handleNativeDeckOpen = async () => {
    if (isOpeningDeckRef.current) return;
    isOpeningDeckRef.current = true;
    try {
      if (window.electronAPI?.selectDeckFile) {
        const res = await window.electronAPI.selectDeckFile();
        window.electronAPI?.refocusWindow();
        window.focus();
        if (res && !res.canceled && res.content) {
          await loadDeckFromXml(res.content, res.filename);
        }
        return;
      }
      document.getElementById('electron-load-deck')?.click();
    } catch(e) {
      console.warn("Native file dialog fallback", e);
      document.getElementById('electron-load-deck')?.click();
    } finally {
      setTimeout(() => {
        isOpeningDeckRef.current = false;
      }, 300);
    }
  };

  useEffect(() => {
    if (!window.electronAPI?.onMenuLoadDeck) return;
    const unsubscribe = window.electronAPI.onMenuLoadDeck(() => {
      handleNativeDeckOpen();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      await loadDeckFromXml(text, file.name);
    } catch (err) {
      console.error("File upload error:", err);
      await showAlert("Failed to read file: " + err.message, "File Read Error");
    }
  };

  const moveCards = async (idsToMove, newZone, baseX = 0, baseY = 0, toBottom = false, anchorId = null, forceFaceDown = null) => {
    if (!Array.isArray(idsToMove) || idsToMove.length === 0) return;

    const cardsToProcess = [];
    for (const id of idsToMove) {
      const c = cards.find(card => card.id === id);
      if (!c) continue;
      if (c.ownerId !== savedId && c.controllerId !== savedId) {
        const ok = await askConfirm(`Take control of ${c.name || 'this card'} from the opponent?`, "Take Control");
        if (!ok) {
          continue;
        }
        logAction(`took control of ${c.name || 'a card'}.`);
      }
      cardsToProcess.push(c);
    }

    if (cardsToProcess.length === 0) return;

    // Snapshot original positions and zones of all cards BEFORE any card is updated
    const origMap = new Map();
    cardsToProcess.forEach(c => {
      origMap.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, zone: c.zone });
    });
    const anchorOrig = anchorId ? origMap.get(anchorId) : (cardsToProcess.length > 0 ? origMap.get(cardsToProcess[0].id) : null);

    let stormDelta = 0;
    const processIds = new Set(cardsToProcess.map(c => c.id));
    const detachedExtraCards = [];
    const updatedCardsMap = new Map();

    cardsToProcess.forEach((card, idx) => {
      const prevZone = card.zone;
      const orig = origMap.get(card.id) || { x: 0, y: 0, zone: prevZone };
      const updated = { ...card };

      if (newZone === 'battlefield') {
        updated.controllerId = savedId;
        if (!updated.originalOwnerId) updated.originalOwnerId = updated.ownerId;
      } else {
        const realOwner = updated.originalOwnerId || updated.ownerId;
        updated.ownerId = realOwner;
        updated.controllerId = realOwner;
      }

      updated.zone = newZone;
      if (forceFaceDown !== null) {
        updated.faceDown = forceFaceDown;
      } else {
        updated.faceDown = (newZone === 'library');
      }

      if (newZone === 'battlefield') {
        if (anchorOrig && prevZone === 'battlefield') {
          const offsetX = orig.x - anchorOrig.x;
          const offsetY = orig.y - anchorOrig.y;
          updated.x = Math.max(0, baseX + offsetX);
          updated.y = Math.max(0, baseY + offsetY);
        } else {
          updated.x = Math.max(0, baseX + (idx % 6) * 35);
          updated.y = Math.max(0, baseY + Math.floor(idx / 6) * 35);
        }
      } else {
        updated.x = 0;
        updated.y = 0;
      }

      if (newZone === 'library') {
        updated.isTapped = false;
        updated.counters = 0;
        if (toBottom) {
          const libOrders = cards.filter(c => c.ownerId === updated.ownerId && c.zone === 'library').map(c => c.order ?? 0);
          const minOrder = libOrders.length > 0 ? Math.min(0, ...libOrders) : 0;
          updated.order = minOrder - 1 - idx;
        } else {
          updated.order = Date.now() + idx;
        }
      } else {
        updated.order = Date.now() + idx;
      }

      if (newZone === 'command_zone') {
        if (!updated.isCompanion) {
          updated.isCommander = true;
        }
        updated.isTapped = false;
      }

      if (prevZone === 'hand') {
        const typeStr = (updated.typeLine || '').toLowerCase();
        const isLand = typeStr.includes('land');
        if (newZone === 'battlefield' && !isLand) {
          stormDelta++;
        }
      }

      if (prevZone === 'battlefield' && newZone !== 'battlefield') {
        updated.isTapped = false;
        updated.counters = 0;
        updated.customCounters = {};
        updated.attachedTo = null;
        updated.tempPower = 0;
        updated.tempToughness = 0;
        const attached = cards.filter(c => c.attachedTo === updated.id && !processIds.has(c.id));
        attached.forEach(att => {
          const typeLower = (att.typeLine || '').toLowerCase();
          const isAura = typeLower.includes('aura') || typeLower.includes('enchantment — aura');
          if (isAura) {
            // MTG Rule 704.5m: An aura attached to an illegal/missing permanent is put into its owner's graveyard
            detachedExtraCards.push({
              ...att,
              attachedTo: null,
              zone: 'graveyard',
              isTapped: false,
              order: Date.now()
            });
            logAction(`${att.name || 'Aura'} was put into graveyard because its host left the battlefield (Rule 704.5m).`);
          } else {
            // Equipment / Fortification stays on the battlefield, unattached
            detachedExtraCards.push({
              ...att,
              attachedTo: null
            });
          }
        });

        // MTG Rule 111.7: A token that leaves the battlefield ceases to exist
        if (updated.isToken) {
          updated.delete = true;
          logAction(`${updated.name || 'Token'} token ceased to exist upon leaving the battlefield (Rule 111.7).`);
        }
      }

      if (newZone === 'battlefield' && prevZone !== 'battlefield') {
        if (funnyModeRef.current) {
          const cTypes = extractCardCreatureTypes(updated);
          socket.emit('play-funny-sound', { 
            cardName: updated.frontName || updated.name, 
            creatureTypes: cTypes 
          });
          if (!socket.connected && cTypes.length > 0) playCreatureOgg(cTypes);
        }
        if (prevZone === 'command_zone') {
          if (updated.isCompanion) {
            logAction(`casts Companion ${updated.name || 'card'} from the Command Zone.`);
          } else {
            const nextTax = (updated.commanderTax || 0) + 2;
            updated.commanderTax = nextTax;
            updated.isCommander = true;
            logAction(`casts ${updated.name || 'Commander'} from the Command Zone (Tax now +{${nextTax}}).`);
          }
        } else {
          logAction(`played ${updated.name || 'a card'}.`);
        }
      } else if (newZone === 'graveyard' && prevZone !== 'graveyard') {
        logAction(`put ${updated.name || 'a card'} into their graveyard.`);
      } else if (newZone === 'exile' && prevZone !== 'exile') {
        logAction(`exiled ${updated.name || 'a card'}.`);
      } else if (newZone === 'hand' && prevZone !== 'hand') {
        if (prevZone === 'library') {
          logAction(`put a card from library into their hand.`);
        } else {
          logAction(`returned ${updated.name || 'a card'} to hand.`);
        }
      }

      updatedCardsMap.set(updated.id, updated);
    });

    if (newZone === 'hand' || newZone === 'battlefield') {
      setHasDealtInitialHand(true);
    }
    if (stormDelta > 0) {
      socket.emit('set-storm-count', stormCount + stormDelta);
    }

    const detachedMap = new Map(detachedExtraCards.map(c => [c.id, c]));
    const nextCards = cards
      .filter(c => !updatedCardsMap.get(c.id)?.delete)
      .map(c => {
        if (updatedCardsMap.has(c.id)) return updatedCardsMap.get(c.id);
        if (detachedMap.has(c.id)) return detachedMap.get(c.id);
        return c;
      }).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));

    const movedList = [...updatedCardsMap.values(), ...detachedExtraCards];

    setCards(nextCards);
    broadcastCards(movedList);
    setSelectedCards([]);
  };

  const moveCard = (id, newZone, x=0, y=0, toBottom = false, forceFaceDown = null) => {
    return moveCards([id], newZone, x, y, toBottom, null, forceFaceDown);
  };

  const modifyCard = (id, updatesOrUpdater, applyToSelection = true) => {
    const ids = (applyToSelection && selectedCards.includes(id)) ? selectedCards : [id];
    const allowedIds = ids.filter(cid => {
      const c = cards.find(x => x.id === cid);
      return c && (c.ownerId === savedId || c.controllerId === savedId);
    });
    if (allowedIds.length === 0) return;

    const broadcastList = [];
    const updatedMap = new Map();

    allowedIds.forEach(cid => {
      const c = cards.find(x => x.id === cid);
      if (!c) return;

      const updates = typeof updatesOrUpdater === 'function' ? updatesOrUpdater(c) : updatesOrUpdater;
      
      if (updates.counters !== undefined && updates.counters !== c.counters) {
        const diff = updates.counters - (c.counters || 0);
        logAction(`${diff > 0 ? 'added' : 'removed'} a +1/+1 counter on ${c.name || 'a card'}.`);
      }
      if (updates.faceDown !== undefined && updates.faceDown !== c.faceDown) {
        logAction(`turned ${c.name || 'a card'} face ${updates.faceDown ? 'down' : 'up'}.`);
      }
      if (updates.commanderTax !== undefined && updates.commanderTax !== c.commanderTax) {
        logAction(`set Commander Tax on ${c.name || 'Commander'} to +{${updates.commanderTax}}.`);
      }
      if (updates.customCounters) {
        if (c.customCounters) {
          Object.keys(c.customCounters).forEach(k => {
            if (!updates.customCounters[k]) logAction(`removed a ${k} counter from ${c.name || 'a card'}.`);
          });
        }
      }

      const updatedCard = { ...c, ...updates };
      updatedMap.set(cid, updatedCard);
      broadcastList.push(updatedCard);
    });

    setCards(prev => prev.map(c => updatedMap.has(c.id) ? updatedMap.get(c.id) : c));
    if (broadcastList.length > 0) broadcastCards(broadcastList);
  };

  const deleteCard = (id) => {
    const ids = selectedCards.includes(id) ? selectedCards : [id];
    const allowedIds = ids.filter(cid => {
      const c = cards.find(x => x.id === cid);
      return c && (c.ownerId === savedId || c.controllerId === savedId);
    });
    if (allowedIds.length === 0) return;
    setCards(prev => prev.filter(c => !allowedIds.includes(c.id)));
    broadcastCards(allowedIds.map(cid => ({ id: cid, delete: true })));
    logAction(`deleted ${allowedIds.length} card(s).`);
  };

  const duplicateCard = (id) => {
    const ids = selectedCards.includes(id) ? selectedCards : [id];
    const clones = [];
    ids.forEach(cid => {
      const card = cards.find(c => c.id === cid);
      if (!card) return;
      if (card.ownerId !== savedId && card.controllerId !== savedId) return;
      clones.push({ 
        ...card, 
        id: 'clone-' + Math.random().toString(36).substring(2, 10),
        isToken: true,
        ownerId: savedId,
        originalOwnerId: savedId,
        controllerId: savedId,
        x: card.x + 20, y: card.y + 20,
        attachedTo: null,
        order: Date.now()
      });
    });
    if (clones.length === 0) return;
    setCards(prev => [...prev, ...clones]);
    broadcastCards(clones);
    logAction(`duplicated ${clones.length} card(s).`);
  };

  const untapAll = () => {
    const updates = [];
    let stunRemovedCount = 0;
    cards.forEach(c => {
      if ((c.controllerId ? c.controllerId === savedId : c.ownerId === savedId) && c.zone === 'battlefield' && c.isTapped) {
        if (c.noUntap) return;
        if (c.customCounters && (c.customCounters['Stun'] || 0) > 0) {
          const newCustom = { ...c.customCounters, Stun: c.customCounters['Stun'] - 1 };
          if (newCustom['Stun'] <= 0) delete newCustom['Stun'];
          updates.push({ id: c.id, customCounters: newCustom });
          stunRemovedCount++;
          return;
        }
        updates.push({ id: c.id, isTapped: false });
      }
    });
    if (updates.length > 0) {
      setCards(prev => {
        const uMap = new Map(updates.map(u => [u.id, u]));
        return prev.map(c => uMap.has(c.id) ? { ...c, ...uMap.get(c.id) } : c);
      });
      broadcastCards(updates);
      if (stunRemovedCount > 0) {
        logAction(`untapped permanents (removed ${stunRemovedCount} Stun counter(s) instead of untapping).`);
      } else {
        logAction(`untapped their permanents.`);
      }
    }
  };

  const addCustomCounter = (id) => {
    setModal({ type: 'add_counter', cardId: id });
    window.electronAPI?.refocusWindow();
  };

  const drawCard = (amount = 1) => {
    setHasDealtInitialHand(true);
    const myLibrary = cards.filter(c => c.ownerId === savedId && c.zone === 'library').sort((a,b) => a.order - b.order);
    if (myLibrary.length === 0) {
      logAction(`attempted to draw from an empty library! (Rule 704.5b - Game Loss 💀)`);
      return;
    }
    const toDraw = myLibrary.slice(-amount);
    if (toDraw.length < amount) {
      logAction(`attempted to draw ${amount} cards but only had ${toDraw.length} remaining in library! (Rule 704.5b - Game Loss 💀)`);
    }
    if (toDraw.length === 0) return;

    const updates = toDraw.map((c, i) => ({
      ...c,
      zone: 'hand',
      faceDown: false,
      order: Date.now() + i
    }));

    const newCards = [...cards];
    updates.forEach(u => {
      const idx = newCards.findIndex(c => c.id === u.id);
      if (idx !== -1) newCards[idx] = u;
    });
    setCards(newCards);
    broadcastCards(updates);
    logAction(`drew ${toDraw.length} card${toDraw.length > 1 ? 's' : ''}.`);
  };

  const shuffleLibrary = () => {
    const updates = [];
    const newCards = cards.map(c => {
      if (c.ownerId === savedId && c.zone === 'library') {
        const c2 = { ...c, order: Math.random() };
        updates.push(c2);
        return c2;
      }
      return c;
    });
    setCards(newCards.sort((a,b) => a.order - b.order));
    broadcastCards(updates);
    logAction(`shuffled their library.`);
  };

  const dealOpeningHand = () => {
    setHasDealtInitialHand(true);
    setMulliganCount(0);
    const myLibrary = cards
      .filter(c => c.ownerId === savedId && c.zone === 'library')
      .map(c => ({ ...c, order: Math.random() }))
      .sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    if (myLibrary.length === 0) return;

    const toDraw = myLibrary.slice(-7);
    const remaining = myLibrary.slice(0, -7);

    const updates = [
      ...remaining,
      ...toDraw.map((c, i) => ({
        ...c,
        zone: 'hand',
        faceDown: false,
        order: Date.now() + i
      }))
    ];

    const updateMap = new Map(updates.map(u => [u.id, u]));
    const newCards = cards.map(c => updateMap.get(c.id) || c);
    setCards(newCards);
    broadcastCards(updates);
    logAction(`dealt an opening hand of 7 cards.`);
  };

  const searchTokens = async (e) => {
    e.preventDefault();
    setTokenResults([]);
    try {
      let res = await fetch(`${serverUrl}/api/tokens/search?q=${encodeURIComponent(tokenSearchQuery)}`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) {
        res = await fetch(`https://api.scryfall.com/cards/search?q=t:token+${encodeURIComponent(tokenSearchQuery)}`, {
          signal: AbortSignal.timeout(8000)
        });
      }
      if (res.ok) {
        const data = await res.json();
        const results = (data.data || []).map(card => {
          let frontImg = card.frontImageUrl || card.imageUrl || card.img;
          if (frontImg && !frontImg.startsWith('http')) frontImg = `${serverUrl}${frontImg}`;
          if (!frontImg && card.image_uris) frontImg = card.image_uris.normal;
          if (!frontImg && card.card_faces?.[0]?.image_uris) frontImg = card.card_faces[0].image_uris.normal;
          if (!frontImg) frontImg = CARD_BACK;

          let backImg = card.backImageUrl || card.backImg;
          if (backImg && !backImg.startsWith('http')) backImg = `${serverUrl}${backImg}`;
          if (!backImg && card.card_faces?.[1]?.image_uris) backImg = card.card_faces[1].image_uris.normal;

          let frontName = card.frontName || card.name;
          let backName = card.backName || (card.card_faces?.[1]?.name || null);

          return { 
            name: card.name, 
            img: frontImg, 
            frontImg, 
            backImg, 
            frontName, 
            backName,
            typeLine: card.typeLine || card.type_line || ''
          };
        });
        setTokenResults(results);
      }
    } catch (err) {
      console.warn("Token search failed:", err);
    }
  };

  const spawnToken = (tokenData) => {
    const token = {
      id: 'token-' + Math.random().toString(36).substring(2, 10),
      name: tokenData.frontName || tokenData.name,
      ownerId: savedId,
      originalOwnerId: savedId,
      controllerId: savedId,
      zone: 'battlefield',
      x: 100, y: 100,
      isTapped: false,
      counters: 0,
      imageUrl: tokenData.frontImg || tokenData.img,
      frontImageUrl: tokenData.frontImg || tokenData.img,
      backImageUrl: tokenData.backImg || null,
      frontName: tokenData.frontName || tokenData.name,
      backName: tokenData.backName || null,
      typeLine: tokenData.typeLine || '',
      isTransformed: false,
      tempPower: 0,
      tempToughness: 0,
      attachedTo: null,
      faceDown: false,
      isToken: true,
      order: Date.now()
    };
    setCards(prev => [...prev, token]);
    broadcastCards([token]);
    logAction(`created a ${tokenData.name} token.`);
    if (funnyModeRef.current) {
      const cTypes = extractCardCreatureTypes(token);
      socket.emit('play-funny-sound', { 
        cardName: token.frontName || token.name, 
        creatureTypes: cTypes 
      });
      if (!socket.connected && cTypes.length > 0) playCreatureOgg(cTypes);
    }
    setModal(null);
  };

  const restartGame = async () => {
    const startLife = myData.startingLife ?? 20;
    const ok = await askConfirm(`Restart game? This moves all your cards back to your library and resets your life to ${startLife}.`, "Restart Game");
    if (!ok) return;

    setHasDealtInitialHand(false);
    setMulliganCount(0);
    const updates = [];
    cards.filter(c => c.ownerId === savedId).forEach(c => {
      if (c.isToken) {
        updates.push({ id: c.id, delete: true });
      } else {
        const destZone = c.originalZone || 'library';
        updates.push({
          ...c,
          ownerId: savedId,
          originalOwnerId: savedId,
          controllerId: savedId,
          zone: destZone,
          x: 0, y: 0, isTapped: false, counters: 0, customCounters: {}, 
          commanderTax: 0,
          tempPower: 0,
          tempToughness: 0,
          attachedTo: null,
          isTransformed: false,
          imageUrl: c.frontImageUrl || c.imageUrl,
          name: c.frontName || c.name,
          faceDown: destZone === 'library', 
          order: Math.random()
        });
      }
    });
    updatePlayer({ life: startLife, poison: 0, energy: 0, experience: 0, commanderDamage: {}, mana: { w:0, u:0, b:0, r:0, g:0, c:0 }, revealedHand: false });
    broadcastCards(updates);
    socket.emit('reset-turn');
    logAction(`restarted their deck.`);
  };

  const startScry = (amount) => {
    const myLibrary = cards
      .filter(c => c.ownerId === savedId && c.zone === 'library')
      .sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    if (myLibrary.length === 0) return;
    const scryCards = myLibrary.slice(-amount).reverse();
    setModal({ type: 'scry', cards: scryCards, topCards: [...scryCards], bottomCards: [] });
    logAction(`is scrying ${amount}.`);
  };

  const rollDice = (sides) => {
    const result = Math.floor(Math.random() * sides) + 1;
    logAction(`rolled a d${sides} and got: ${result}`);
  };

  const updateMana = (color, delta) => {
    const newMana = { ...myData.mana, [color]: Math.max(0, (myData.mana[color] || 0) + delta) };
    updatePlayer({ mana: newMana });
  };

  // Selection Box Handlers
  const onMouseDownBoard = (e) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setSelectionBox({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top,
    });
  };

  const onMouseMoveBoard = (e) => {
    if (!selectionBox) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setSelectionBox(prev => ({
      ...prev,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top,
    }));
  };

  const onMouseUpBoard = (e) => {
    if (!selectionBox) return;
    const left = Math.min(selectionBox.startX, selectionBox.endX);
    const right = Math.max(selectionBox.startX, selectionBox.endX);
    const top = Math.min(selectionBox.startY, selectionBox.endY);
    const bottom = Math.max(selectionBox.startY, selectionBox.endY);
    
    // Ignore clicks (small boxes)
    if (right - left < 10 && bottom - top < 10) {
      setSelectedCards([]);
      setSelectionBox(null);
      return;
    }

    const myBoardCards = cards.filter(c => (c.controllerId ? c.controllerId === savedId : c.ownerId === savedId) && c.zone === 'battlefield');
    const selected = myBoardCards.filter(c => {
      let cardX = c.x || 0;
      let cardY = c.y || 0;
      if (c.attachedTo) {
        const hostCard = myBoardCards.find(h => h.id === c.attachedTo);
        if (hostCard) {
          const attachedSiblings = myBoardCards.filter(sib => sib.attachedTo === hostCard.id);
          const attachIdx = attachedSiblings.findIndex(sib => sib.id === c.id);
          cardX = hostCard.x + (attachIdx + 1) * 22;
          cardY = hostCard.y + (attachIdx + 1) * 28;
        }
      }
      const effectiveY = cardX < 320 ? Math.max(210, cardY) : cardY;
      const cardW = c.isTapped ? 140 : 100;
      const cardH = c.isTapped ? 100 : 140;
      const cLeft = cardX;
      const cRight = cardX + cardW;
      const cTop = effectiveY;
      const cBottom = effectiveY + cardH;
      return !(cRight < left || cLeft > right || cBottom < top || cTop > bottom);
    });
    
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
       setSelectedCards(prev => [...new Set([...prev, ...selected.map(c => c.id)])]);
    } else {
       setSelectedCards(selected.map(c => c.id));
    }
    setSelectionBox(null);
  };

  // Drag Handlers
  const getDragCardIds = (e) => {
    const idsStr = e.dataTransfer.getData('cardIds');
    if (idsStr) {
      try {
        const parsed = JSON.parse(idsStr);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (err) {}
    }
    const singleId = e.dataTransfer.getData('cardId');
    if (singleId) return [singleId];
    return [];
  };

  const onDragStart = (e, id) => {
    const draggedCard = cards.find(c => c.id === id);
    let ids = [id];
    if (draggedCard && selectedCards.includes(id)) {
      const validSelected = selectedCards.filter(sid => {
        const c = cards.find(item => item.id === sid);
        return c && c.zone === draggedCard.zone && (c.controllerId ? c.controllerId === savedId : c.ownerId === savedId);
      });
      if (validSelected.length > 0) {
        ids = validSelected;
      }
    } else {
      ids = [id];
      setSelectedCards([id]);
    }

    e.dataTransfer.setData('cardId', id);
    e.dataTransfer.setData('cardIds', JSON.stringify(ids));
    e.dataTransfer.setData('anchorId', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDropBoard = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const isOpponentBoard = e.currentTarget.id !== 'my-battlefield';
    const baseX = Math.max(0, e.clientX - rect.left - 50);
    const baseY = isOpponentBoard
      ? Math.max(0, rect.bottom - e.clientY - 70)
      : Math.max(0, e.clientY - rect.top - 70);

    const ids = getDragCardIds(e);
    const anchorId = e.dataTransfer.getData('anchorId') || ids[0];
    if (ids.length > 0) {
      moveCards(ids, 'battlefield', baseX, baseY, false, anchorId);
      const anchorCard = cards.find(c => c.id === anchorId) || cards.find(c => c.id === ids[0]);
      ids.forEach((cardId, i) => {
        const attached = cards.filter(c => c.attachedTo === cardId && c.zone === 'battlefield' && !ids.includes(c.id));
        if (attached.length > 0) {
          const hostCard = cards.find(c => c.id === cardId);
          let hostX = baseX;
          let hostY = baseY;
          if (hostCard && anchorCard && hostCard.zone === 'battlefield' && anchorCard.zone === 'battlefield') {
            hostX = Math.max(0, baseX + (hostCard.x - anchorCard.x));
            hostY = Math.max(0, baseY + (hostCard.y - anchorCard.y));
          } else if (i > 0) {
            hostX = Math.max(0, baseX + (i % 6) * 35);
            hostY = Math.max(0, baseY + Math.floor(i / 6) * 35);
          }
          attached.forEach((att, idx) => {
            moveCard(att.id, 'battlefield', hostX + (idx + 1) * 22, hostY + (idx + 1) * 28);
          });
        }
      });
    }
  };

  const onDropLibrary = (e) => {
    e.preventDefault();
    const ids = getDragCardIds(e);
    if (ids.length === 0) return;
    setModal({ type: 'library_drop', ids });
  };

  const renderZoneCard = (card, draggable=true) => {
    const isCommandZone = card.zone === 'command_zone';
    const isHand = card.zone === 'hand';
    const isSelected = selectedCards.includes(card.id);

    return (
      <div 
        key={card.id} draggable={draggable}
        onDragStart={(e) => onDragStart(e, card.id)}
        onDragEnd={() => setSelectionBox(null)}
        onMouseEnter={() => handleSetHoveredCard(card)} onMouseLeave={() => handleSetHoveredCard(null)}
        onMouseDown={(e) => {
          if (e.button === 2) { e.stopPropagation(); return; }
          if (!selectedCards.includes(card.id) && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            setSelectedCards([card.id]);
          }
        }}
        onClick={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            e.stopPropagation();
            setSelectedCards(prev => prev.includes(card.id) ? prev.filter(c => c !== card.id) : [...prev, card.id]);
          } else {
            e.stopPropagation();
            setSelectedCards([card.id]);
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (isHand) {
            const toPlay = selectedCards.includes(card.id) ? selectedCards : [card.id];
            moveCards(toPlay, 'battlefield', 100, 100);
          }
        }}
        className={`cursor-grab active:cursor-grabbing hover:-translate-y-2 transition-all shrink-0 relative group ${isSelected ? 'ring-4 ring-blue-500 rounded -translate-y-3 shadow-xl shadow-blue-500/30' : ''}`}
      >
        <img src={card.faceDown ? getCardBackForCard(card) : card.imageUrl} className="w-[90px] lg:w-[100px] rounded shadow border border-gray-300 dark:border-gray-600 pointer-events-none" />
        
        {/* Command Zone Enhancements */}
        {isCommandZone && (
          <>
            <div className="absolute top-1 left-1 bg-black/80 text-amber-300 text-[9px] font-black px-1.5 py-0.5 rounded shadow pointer-events-none">
              {card.isCompanion ? 'COMPANION' : card.isPartner ? 'PARTNER' : 'COMMANDER'}
            </div>
            <div 
              className="absolute top-6 left-1 right-1 flex items-center justify-between bg-black/90 text-white rounded px-1.5 py-0.5 text-[10px] z-30 font-bold border border-amber-400/50 shadow-md" 
              onMouseDown={e => e.stopPropagation()} 
              onClick={e => e.stopPropagation()}
            >
              <button 
                onMouseDown={e => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = Math.max(0, (card.commanderTax || 0) - 2);
                  modifyCard(card.id, { commanderTax: next });
                }} 
                className="hover:text-red-400 hover:bg-red-950/60 px-1.5 py-0.5 rounded text-xs font-black cursor-pointer" 
                title="Subtract 2 Commander Tax"
              >
                -2
              </button>
              <span className="text-amber-300 font-extrabold select-none" title="Commander Tax (Rule 903.8)">
                Tax: +{card.commanderTax || 0}
              </span>
              <button 
                onMouseDown={e => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = (card.commanderTax || 0) + 2;
                  modifyCard(card.id, { commanderTax: next });
                }} 
                className="hover:text-green-400 hover:bg-green-950/60 px-1.5 py-0.5 rounded text-xs font-black cursor-pointer" 
                title="Add 2 Commander Tax"
              >
                +2
              </button>
            </div>
            {card.isCompanion && (
              <button 
                onMouseDown={e => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); payCompanionToHand(card); }}
                className="absolute bottom-1 left-1 right-1 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-bold py-0.5 rounded shadow z-20 text-center cursor-pointer"
                title="Pay {3} to put Companion into hand (Rule 702.139a)"
              >
                Pay 3 to Hand
              </button>
            )}
            {!card.isCompanion && (
              <button 
                onMouseDown={e => e.stopPropagation()}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  moveCard(card.id, 'battlefield', 100, 100); 
                }}
                className="absolute bottom-1 left-1 right-1 bg-amber-600/95 hover:bg-amber-700 text-white text-[9px] font-bold py-1 rounded shadow-lg z-20 text-center uppercase cursor-pointer border border-amber-300 tracking-wider"
                title={`Cast to Battlefield (Tax: +${card.commanderTax || 0})`}
              >
                Cast {(card.commanderTax || 0) > 0 ? `(+${card.commanderTax})` : ''}
              </button>
            )}
          </>
        )}

        {/* Hand Card Actions */}
        {isHand && (
          <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            {(card.backImageUrl || card.backName) && (
              <button 
                onClick={(e) => { e.stopPropagation(); transformCard(card.id); }} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white p-1 rounded-full shadow text-[10px] cursor-pointer" 
                title={`Transform / Flip Face to ${card.isTransformed ? (card.frontName || 'Front') : (card.backName || 'Back')}`}
              >
                <RefreshCw size={12} className={card.isTransformed ? 'rotate-180 transition-transform' : ''}/>
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); revealSingleCard(card); }} 
              className="bg-blue-600 hover:bg-blue-700 text-white p-1 rounded-full shadow text-[10px] cursor-pointer" 
              title="Reveal this card to all opponents"
            >
              <Eye size={12}/>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); moveCard(card.id, 'graveyard'); }} 
              className="bg-red-600 hover:bg-red-700 text-white p-1 rounded-full shadow text-[10px] cursor-pointer" 
              title="Discard card"
            >
              <Trash2 size={12}/>
            </button>
          </div>
        )}

      </div>
    );
  };

  return (
    <div style={{ transform: isTableFlipped ? 'rotateX(180deg) rotateZ(15deg) translateY(100vh)' : 'none', transition: isTableFlipped ? 'transform 1.5s cubic-bezier(0.55, 0.085, 0.68, 0.53)' : 'transform 1s ease' }} className="w-screen h-screen flex bg-[#fff0f5] dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans overflow-hidden transition-colors duration-300 transform origin-center">
      
      <div className="sr-only">
        <input type="file" id="electron-load-deck" accept=".o8d" onChange={(e) => { handleFileUpload(e); setModal(null); }} />
        <button id="electron-open-deck" onClick={handleNativeDeckOpen} />
        <button id="electron-undo" onClick={() => socket.emit('undo')} />
        <button id="electron-redo" onClick={() => socket.emit('redo')} />
        <button id="electron-toggle-advanced-play" onClick={toggleAdvancedPlay} />
        <button id="electron-help" onClick={() => setModal({ type: 'help' })} />
        <button id="electron-dark-mode" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
        <button id="electron-restart" onClick={() => restartGame()} />
        <button id="electron-london-mulligan" onClick={() => isOpeningDeal ? dealOpeningHand() : startLondonMulligan()} />
        <button id="electron-sideboard-reset" onClick={resetRound} />
        <button id="electron-life-20" onClick={() => setStartingLife(20)} />
        <button id="electron-life-30" onClick={() => setStartingLife(30)} />
        <button id="electron-life-40" onClick={() => setStartingLife(40)} />
        <button id="electron-clear" onClick={async () => { 
          const ok = await askConfirm("Clear and permanently wipe all your cards (table, hand, library, graveyard) and reset your life?", "Clear All My Cards (Full Wipe)");
          if (ok) {
            const deletions = cards.filter(c => c.ownerId === savedId).map(c => ({ id: c.id, delete: true }));
            broadcastCards(deletions);
            updatePlayer({ life: myData.startingLife ?? 20, poison: 0, energy: 0, experience: 0, commanderDamage: {}, mana: { w:0, u:0, b:0, r:0, g:0, c:0 } });
            logAction(`cleared and reset all their cards and life.`);
          } 
        }} />
        <button id="electron-name" onClick={() => setModal({ type: 'prompt_name' })} />
        <button id="electron-appearance" onClick={() => setModal({ type: 'appearance' })} />
      </div>
      {/* Modals Overlay */}
      {modal && (
        <div 
          className="absolute inset-0 bg-black/60 z-[100] flex items-center justify-center p-4"
          onDragOver={e => e.preventDefault()}
          onDrop={(e) => {
            const ids = getDragCardIds(e);
            if (ids.length > 0 && (modal.type === 'explore' || modal.type === 'token_search')) {
              if (e.clientY > window.innerHeight * 0.75) {
                moveCards(ids, 'hand');
              } else {
                const board = document.getElementById('my-battlefield');
                if (board) {
                  const rect = board.getBoundingClientRect();
                  moveCards(ids, 'battlefield', e.clientX - rect.left - 50, e.clientY - rect.top - 70);
                } else {
                  moveCards(ids, 'battlefield', e.clientX - 50, e.clientY - 70);
                }
              }
              closeModal();
            }
          }}
          onClick={(e) => { if(e.target === e.currentTarget) closeModal(); }}
        >
          
          {modal.type === 'prompt_server_ip' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col gap-4 border border-pink-300 w-full max-w-sm">
              <h2 className="text-2xl font-bold text-pink-600">Connect to Server</h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Enter the local IP address and port of the host player's server.</p>
              <input 
                type="text" 
                id="ip-input" 
                defaultValue="http://localhost:3000" 
                className="p-2 border border-gray-300 rounded text-black font-mono w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none" 
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); e.currentTarget.focus(); }}
                onFocus={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(true);
                }}
                onBlur={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(false);
                }}
              />
              <button onClick={() => {
                const newIp = document.getElementById('ip-input').value;
                if (newIp) {
                  localStorage.setItem('mtg-server-url', newIp);
                  window.location.reload();
                }
              }} className="bg-indigo-500 text-white p-3 rounded-lg shadow font-bold hover:bg-indigo-600">Connect</button>
            </div>
          )}

          {modal.type === 'prompt_name' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col gap-4 border border-pink-300 w-full max-w-sm">
              <h2 className="text-xl font-bold text-pink-600">Enter Player Name</h2>
              <input 
                type="text" 
                id="name-input" 
                defaultValue={savedName} 
                className="p-2 border border-gray-300 rounded text-black w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none" 
                autoFocus 
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); e.currentTarget.focus(); }}
                onFocus={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(true);
                }}
                onBlur={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(false);
                }}
                onKeyDown={(e) => { if(e.key==='Enter') document.getElementById('btn-name').click() }} 
              />
              <button id="btn-name" onClick={() => {
                const newName = document.getElementById('name-input').value;
                if (newName) {
                  localStorage.setItem('cute-mtg-name', newName);
                  window.location.reload();
                }
              }} className="bg-pink-500 text-white p-2 rounded shadow font-bold hover:bg-pink-600">Save Name</button>
            </div>
          )}

          {modal.type === 'prompt_scry' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col gap-4 border border-blue-300 w-full max-w-sm">
              <h2 className="text-xl font-bold text-blue-600">Scry how many?</h2>
              <input 
                type="number" 
                id="scry-input" 
                defaultValue="2" 
                className="p-2 border border-gray-300 rounded text-black w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none" 
                autoFocus 
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); e.currentTarget.focus(); }}
                onFocus={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(true);
                }}
                onBlur={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(false);
                }}
                onKeyDown={(e) => { if(e.key==='Enter') document.getElementById('btn-scry').click() }} 
              />
              <button id="btn-scry" onClick={() => {
                const num = parseInt(document.getElementById('scry-input').value, 10);
                if (num) {
                  startScry(num);
                  setModal(null);
                }
              }} className="bg-blue-500 text-white p-2 rounded shadow font-bold hover:bg-blue-600">Scry</button>
            </div>
          )}

          {modal.type === 'prompt_draw' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col gap-4 border border-indigo-300 w-full max-w-sm">
              <h2 className="text-xl font-bold text-indigo-600">Draw how many?</h2>
              <input 
                type="number" 
                id="draw-input" 
                defaultValue="7" 
                className="p-2 border border-gray-300 rounded text-black w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none" 
                autoFocus 
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); e.currentTarget.focus(); }}
                onFocus={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(true);
                }}
                onBlur={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(false);
                }}
                onKeyDown={(e) => { if(e.key==='Enter') document.getElementById('btn-draw').click() }} 
              />
              <button id="btn-draw" onClick={() => {
                const amt = parseInt(document.getElementById('draw-input').value, 10);
                if (amt > 0) {
                  drawCard(amt);
                  setModal(null);
                }
              }} className="bg-indigo-500 text-white p-2 rounded shadow font-bold hover:bg-indigo-600">Draw</button>
            </div>
          )}

          {modal.type === 'prompt_mill' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col gap-4 border border-gray-400 w-full max-w-sm">
              <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2"><Skull size={20}/> Mill how many cards?</h2>
              <input 
                type="number" 
                id="mill-input" 
                defaultValue="3" 
                className="p-2 border border-gray-300 rounded text-black dark:bg-gray-700 dark:border-gray-600 dark:text-white w-full outline-none" 
                autoFocus 
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); e.currentTarget.focus(); }}
                onFocus={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(true);
                }}
                onBlur={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(false);
                }}
                onKeyDown={(e) => { if(e.key==='Enter') document.getElementById('btn-mill').click() }} 
              />
              <button id="btn-mill" onClick={() => {
                const amt = parseInt(document.getElementById('mill-input').value, 10);
                if (amt > 0) {
                  millCards(amt);
                  setModal(null);
                }
              }} className="bg-gray-700 hover:bg-gray-800 text-white p-2 rounded shadow font-bold">Mill Cards</button>
            </div>
          )}

          {modal.type === 'prompt_exile_top' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col gap-4 border border-slate-400 w-full max-w-sm">
              <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><SunIcon size={20}/> Exile from top of library</h2>
              <div className="flex flex-col gap-3">
                <input 
                  type="number" 
                  id="exile-input" 
                  defaultValue="1" 
                  className="p-2 border border-gray-300 rounded text-black dark:bg-gray-700 dark:border-gray-600 dark:text-white w-full outline-none" 
                  autoFocus 
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); e.currentTarget.focus(); }}
                  onFocus={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(true);
                }}
                onBlur={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(false);
                }}
                  onKeyDown={(e) => { if(e.key==='Enter') document.getElementById('btn-exile').click() }} 
                />
                <label className="flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" id="exile-face-down" className="rounded" />
                  Exile Face-Down (Impulse / Foretell)
                </label>
              </div>
              <button id="btn-exile" onClick={() => {
                const amt = parseInt(document.getElementById('exile-input').value, 10);
                const faceDown = document.getElementById('exile-face-down')?.checked || false;
                if (amt > 0) {
                  exileTopCards(amt, faceDown);
                  setModal(null);
                }
              }} className="bg-slate-600 hover:bg-slate-700 text-white p-2 rounded shadow font-bold">Exile Cards</button>
            </div>
          )}


          {modal.type === 'library_drop' && (() => {
            const ids = modal.ids || (modal.id ? [modal.id] : []);
            return (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 border border-pink-300">
                <h2 className="text-xl font-bold text-pink-600 dark:text-pink-400">Put {ids.length > 1 ? `${ids.length} Cards` : 'Card'} on Library</h2>
                <div className="flex gap-4">
                  <button onClick={() => { moveCards(ids, 'library', 0, 0, false); setModal(null); }} className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2 rounded-lg font-bold shadow cursor-pointer">Top</button>
                  <button onClick={() => { moveCards(ids, 'library', 0, 0, true); setModal(null); }} className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-lg font-bold shadow cursor-pointer">Bottom</button>
                </div>
                <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 mt-2 text-sm cursor-pointer">Cancel</button>
              </div>
            );
          })()}

          {modal.type === 'scry' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl flex flex-col gap-5 border-2 border-pink-400 w-[95vw] max-w-5xl max-h-[90vh] shadow-2xl">
              <div className="flex justify-between items-center w-full border-b pb-3 border-pink-200 dark:border-gray-700">
                <div>
                  <h2 className="text-2xl font-bold text-pink-600 dark:text-pink-400 flex items-center gap-2">
                    <Sparkles size={24}/> Scry ({modal.cards.length} card{modal.cards.length > 1 ? 's' : ''})
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Arrange cards to keep on Top or put on Bottom of your library. Top cards are drawn from left to right.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    const topList = modal.topCards || [];
                    const bottomList = modal.bottomCards || [];
                    const myLibrary = cards.filter(c => c.ownerId === savedId && c.zone === 'library');
                    const libOrders = myLibrary.map(c => c.order ?? 0);
                    const maxOrder = libOrders.length > 0 ? Math.max(...libOrders) : 0;
                    const minOrder = libOrders.length > 0 ? Math.min(...libOrders) : 0;

                    const updates = [];
                    topList.forEach((c, idx) => {
                      updates.push({
                        id: c.id,
                        zone: 'library',
                        faceDown: true,
                        isTapped: false,
                        counters: 0,
                        order: maxOrder + (topList.length - idx)
                      });
                    });
                    bottomList.forEach((c, idx) => {
                      updates.push({
                        id: c.id,
                        zone: 'library',
                        faceDown: true,
                        isTapped: false,
                        counters: 0,
                        order: minOrder - 1 - idx
                      });
                    });

                    setCards(prev => {
                      const uMap = new Map(updates.map(u => [u.id, u]));
                      return prev.map(c => uMap.has(c.id) ? { ...c, ...uMap.get(c.id) } : c);
                    });
                    broadcastCards(updates);
                    logAction(`finished Scry: ${topList.length} card(s) kept on top, ${bottomList.length} card(s) put on bottom.`);
                    setModal(null);
                  }}
                  className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer shadow-lg flex items-center gap-2 transition-transform hover:scale-105"
                >
                  Confirm Scry ({modal.topCards?.length || 0} Top / {modal.bottomCards?.length || 0} Bottom)
                </button>
              </div>

              <div className="flex flex-col gap-6 overflow-y-auto pr-1 custom-scrollbar">
                {/* Top of Library Section */}
                <div className="flex flex-col gap-2 bg-pink-50/50 dark:bg-gray-900/50 p-4 rounded-xl border border-pink-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-pink-700 dark:text-pink-300 flex items-center gap-1.5">
                      📖 Keep on Top of Library ({modal.topCards?.length || 0})
                    </span>
                    <span className="text-[11px] text-gray-500">Drawn in order: 1st, 2nd, etc.</span>
                  </div>
                  <div className="flex flex-wrap gap-4 min-h-[190px] items-center p-2 rounded-lg border-2 border-dashed border-pink-300 dark:border-pink-800">
                    {modal.topCards?.map((c, idx) => (
                      <div key={c.id} className="flex flex-col items-center gap-1.5 shrink-0 bg-white dark:bg-gray-800 p-2 rounded-lg shadow border border-pink-200 dark:border-gray-700">
                        <div className="relative">
                          <img src={c.imageUrl} className="w-[125px] rounded shadow" />
                          <span className="absolute top-1 left-1 bg-pink-600 text-white font-black text-[10px] px-1.5 py-0.5 rounded shadow">
                            Draw #{idx + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 w-full justify-between">
                          <div className="flex gap-1">
                            <button
                              disabled={idx === 0}
                              onClick={() => {
                                setModal(prev => {
                                  const list = [...(prev.topCards || [])];
                                  const temp = list[idx - 1];
                                  list[idx - 1] = list[idx];
                                  list[idx] = temp;
                                  return { ...prev, topCards: list };
                                });
                              }}
                              className={`p-1 rounded text-xs font-bold ${idx === 0 ? 'opacity-30 cursor-not-allowed' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 cursor-pointer'}`}
                              title="Move Earlier in Draw Order"
                            >
                              ◀
                            </button>
                            <button
                              disabled={idx === (modal.topCards?.length || 1) - 1}
                              onClick={() => {
                                setModal(prev => {
                                  const list = [...(prev.topCards || [])];
                                  const temp = list[idx + 1];
                                  list[idx + 1] = list[idx];
                                  list[idx] = temp;
                                  return { ...prev, topCards: list };
                                });
                              }}
                              className={`p-1 rounded text-xs font-bold ${idx === (modal.topCards?.length || 1) - 1 ? 'opacity-30 cursor-not-allowed' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 cursor-pointer'}`}
                              title="Move Later in Draw Order"
                            >
                              ▶
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              setModal(prev => ({
                                ...prev,
                                topCards: prev.topCards.filter(x => x.id !== c.id),
                                bottomCards: [...(prev.bottomCards || []), c]
                              }));
                            }}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer shadow"
                          >
                            To Bottom ↓
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!modal.topCards || modal.topCards.length === 0) && (
                      <span className="text-xs text-gray-400 font-bold mx-auto">No cards kept on top</span>
                    )}
                  </div>
                </div>

                {/* Bottom of Library Section */}
                <div className="flex flex-col gap-2 bg-purple-50/50 dark:bg-gray-900/50 p-4 rounded-xl border border-purple-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                      ⬇️ Put on Bottom of Library ({modal.bottomCards?.length || 0})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 min-h-[190px] items-center p-2 rounded-lg border-2 border-dashed border-purple-300 dark:border-purple-800">
                    {modal.bottomCards?.map((c, idx) => (
                      <div key={c.id} className="flex flex-col items-center gap-1.5 shrink-0 bg-white dark:bg-gray-800 p-2 rounded-lg shadow border border-purple-200 dark:border-gray-700">
                        <div className="relative">
                          <img src={c.imageUrl} className="w-[125px] rounded shadow opacity-85" />
                          <span className="absolute top-1 left-1 bg-purple-600 text-white font-black text-[10px] px-1.5 py-0.5 rounded shadow">
                            Bottom #{idx + 1}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setModal(prev => ({
                              ...prev,
                              bottomCards: prev.bottomCards.filter(x => x.id !== c.id),
                              topCards: [...(prev.topCards || []), c]
                            }));
                          }}
                          className="bg-pink-600 hover:bg-pink-700 text-white px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer shadow w-full"
                        >
                          To Top ↑
                        </button>
                      </div>
                    ))}
                    {(!modal.bottomCards || modal.bottomCards.length === 0) && (
                      <span className="text-xs text-gray-400 font-bold mx-auto">No cards put on bottom</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {modal.type === 'token_search' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl flex flex-col gap-4 border border-teal-300 w-[600px] max-h-[80vh]">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-teal-600">Create Token</h2>
                <button onClick={() => setModal(null)} className="text-gray-400 font-bold text-xl">×</button>
              </div>
              <form onSubmit={searchTokens} className="flex gap-2">
                <input type="text" value={tokenSearchQuery} onChange={e => setTokenSearchQuery(e.target.value)} placeholder="e.g. Goblin, Treasure" className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 outline-none" autoFocus />
                <button type="submit" className="bg-teal-500 text-white px-4 py-2 rounded font-bold">Search</button>
              </form>
              <div className="flex flex-wrap gap-4 overflow-y-auto p-2 justify-center">
                {tokenResults.map((t, i) => (
                  <img key={i} src={t.img} onClick={() => spawnToken(t)} className="w-[120px] rounded shadow cursor-pointer hover:scale-105 transition-transform" />
                ))}
                {tokenResults.length === 0 && <span className="text-gray-500 m-4">Search to find official token art...</span>}
              </div>
            </div>
          )}

          {modal.type === 'add_counter' && (
            <div 
              className="bg-white dark:bg-gray-800 p-6 rounded-xl flex flex-col gap-4 border border-amber-300 w-[500px]"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-amber-600 dark:text-amber-400">Add Counter</h2>
                <button onClick={() => setModal(null)} className="text-gray-400 font-bold text-xl hover:text-gray-600 dark:hover:text-gray-200">×</button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {COUNTER_TYPES.map(type => (
                  <button key={type.name} onClick={() => {
                    modifyCard(modal.cardId, (c) => {
                      const newCustom = { ...(c.customCounters || {}) };
                      newCustom[type.name] = (newCustom[type.name] || 0) + 1;
                      return { customCounters: newCustom };
                    });
                    logAction(`added a ${type.name} counter to a card.`);
                    setModal(null);
                  }} className={`${type.color} text-white p-2 rounded-lg shadow hover:brightness-110 flex flex-col items-center justify-center gap-1 font-bold text-xs border border-black/20 transition-transform active:scale-95`}>
                    <span className="text-xl drop-shadow-md">{type.icon}</span>
                    <span className="truncate w-full text-center">{type.name}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-4 border-t border-amber-200 dark:border-amber-700 flex gap-2">
                <input 
                  id="customName" 
                  type="text" 
                  autoFocus
                  placeholder="Custom Name" 
                  className="flex-1 p-2 rounded border dark:bg-gray-700 dark:border-gray-600 outline-none text-sm" 
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); e.currentTarget.focus(); }}
                  onFocus={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(true);
                }}
                onBlur={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(false);
                }}
                  onKeyDown={(e) => { e.stopPropagation(); if(e.key==='Enter') document.getElementById('btn-add-custom').click() }} 
                />
                <input 
                  id="customQty" 
                  type="number" 
                  defaultValue="1" 
                  className="w-16 p-2 rounded border dark:bg-gray-700 dark:border-gray-600 outline-none text-sm" 
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); e.currentTarget.focus(); }}
                  onFocus={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(true);
                }}
                onBlur={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(false);
                }}
                  onKeyDown={(e) => { e.stopPropagation(); if(e.key==='Enter') document.getElementById('btn-add-custom').click() }} 
                />
                <button id="btn-add-custom" onClick={() => {
                  const name = document.getElementById('customName').value.trim();
                  const qty = parseInt(document.getElementById('customQty').value, 10);
                  if (name && !isNaN(qty)) {
                    modifyCard(modal.cardId, (c) => {
                      const newCustom = { ...(c.customCounters || {}) };
                      newCustom[name] = (newCustom[name] || 0) + qty;
                      if (newCustom[name] <= 0) delete newCustom[name];
                      return { customCounters: newCustom };
                    });
                    logAction(`added ${qty} ${name} counters to a card.`);
                    setModal(null);
                  }
                }} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded font-bold shadow text-sm">Add</button>
              </div>
            </div>
          )}

          {modal.type === 'dice_menu' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl flex flex-col gap-4 border-2 border-purple-400 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
                <h2 className="text-xl font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                  <Coins size={22}/> Dice & Coin Flips
                </h2>
                <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { flipCoin(); setModal(null); }}
                  className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 hover:brightness-110 flex flex-col items-center gap-2 transition-transform active:scale-95 shadow-sm"
                >
                  <Coins size={36} className="text-amber-500" />
                  <span className="font-bold text-sm text-amber-700 dark:text-amber-300">Flip Coin (K)</span>
                  <span className="text-[10px] text-gray-500">Heads or Tails</span>
                </button>

                <button 
                  onClick={() => { rollD6(); setModal(null); }}
                  className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700 hover:brightness-110 flex flex-col items-center gap-2 transition-transform active:scale-95 shadow-sm"
                >
                  <Dices size={36} className="text-blue-500" />
                  <span className="font-bold text-sm text-blue-700 dark:text-blue-300">Roll d6 (6)</span>
                  <span className="text-[10px] text-gray-500">Standard 6-sided die</span>
                </button>

                <button 
                  onClick={() => { const r = Math.floor(Math.random() * 20) + 1; logAction(`rolled a d20: [ ${r} ]`); setModal(null); }}
                  className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-700 hover:brightness-110 flex flex-col items-center gap-2 transition-transform active:scale-95 shadow-sm"
                >
                  <Sparkles size={36} className="text-purple-500" />
                  <span className="font-bold text-sm text-purple-700 dark:text-purple-300">Roll d20 (R)</span>
                  <span className="text-[10px] text-gray-500">Spindown / D20</span>
                </button>

                <button 
                  onClick={() => { rollPlanar(); setModal(null); }}
                  className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-700 hover:brightness-110 flex flex-col items-center gap-2 transition-transform active:scale-95 shadow-sm"
                >
                  <Swords size={36} className="text-indigo-500" />
                  <span className="font-bold text-sm text-indigo-700 dark:text-indigo-300">Planar Die (Y)</span>
                  <span className="text-[10px] text-gray-500">Planechase (Chaos/Planeswalk)</span>
                </button>
              </div>

              <div className="border-t dark:border-gray-700 pt-3 flex items-center justify-between">
                <span className="text-xs text-gray-500 font-semibold">Other Dice:</span>
                <div className="flex gap-1.5">
                  {[4, 8, 10, 12, 100].map(sides => (
                    <button 
                      key={sides}
                      onClick={() => {
                        const roll = Math.floor(Math.random() * sides) + 1;
                        logAction(`rolled a d${sides}: [ ${roll} ]!`);
                        setModal(null);
                      }}
                      className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-xs font-bold"
                    >
                      d{sides}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {modal.type === 'library_menu' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl flex flex-col gap-4 border-2 border-pink-300 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
                <h2 className="text-xl font-bold text-pink-600 dark:text-pink-400 flex items-center gap-2">
                  <BookOpen size={22}/> Library Actions
                </h2>
                <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
              </div>

              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { drawCard(1); setModal(null); }} className="p-2.5 rounded-lg bg-pink-50 dark:bg-gray-700 hover:bg-pink-100 font-bold text-sm flex items-center justify-center gap-1.5 text-pink-700 dark:text-pink-300">
                    Draw 1
                  </button>
                  <button onClick={() => setModal({ type: 'prompt_draw' })} className="p-2.5 rounded-lg bg-pink-50 dark:bg-gray-700 hover:bg-pink-100 font-bold text-sm flex items-center justify-center gap-1.5 text-pink-700 dark:text-pink-300">
                    Draw X...
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { millCards(1); setModal(null); }} className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 font-bold text-sm flex items-center justify-center gap-1.5 text-gray-700 dark:text-gray-200">
                    <Skull size={14}/> Mill 1
                  </button>
                  <button onClick={() => setModal({ type: 'prompt_mill' })} className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 font-bold text-sm flex items-center justify-center gap-1.5 text-gray-700 dark:text-gray-200">
                    <Skull size={14}/> Mill X...
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { exileTopCards(1, false); setModal(null); }} className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 font-bold text-sm flex items-center justify-center gap-1.5 text-slate-700 dark:text-slate-200">
                    <SunIcon size={14}/> Exile Top 1
                  </button>
                  <button onClick={() => setModal({ type: 'prompt_exile_top' })} className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 font-bold text-sm flex items-center justify-center gap-1.5 text-slate-700 dark:text-slate-200">
                    <SunIcon size={14}/> Exile Top X...
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { startScry(1); setModal(null); }} className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 font-bold text-sm flex items-center justify-center gap-1.5 text-blue-700 dark:text-blue-300">
                    Scry 1
                  </button>
                  <button onClick={() => setModal({ type: 'prompt_scry' })} className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 font-bold text-sm flex items-center justify-center gap-1.5 text-blue-700 dark:text-blue-300">
                    Scry X...
                  </button>
                </div>

                <div className="border-t dark:border-gray-700 my-1"></div>

                <button onClick={() => { logAction(`is searching their library.`); setModal({ type: 'explore', zone: 'library', ownerId: savedId }); }} className="p-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow">
                  <Eye size={16}/> Search Library
                </button>

                <button onClick={() => { shuffleLibrary(); setModal(null); }} className="p-2.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow">
                  <Shuffle size={16}/> Shuffle Library
                </button>
              </div>
            </div>
          )}

          {modal.type === 'london_mulligan' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl flex flex-col gap-4 border-2 border-cyan-400 w-[95vw] max-w-5xl max-h-[90vh] shadow-2xl">
              <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
                <div>
                  <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
                    <RefreshCw size={24}/> London Mulligan #{modal.count} (Rule 103.4)
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    Select exactly <span className="font-bold text-pink-500">{modal.count}</span> card{modal.count > 1 ? 's' : ''} to put on the bottom of your library ({londonSelected.length}/{modal.count} selected).
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {modal.count < 7 ? (
                    <button 
                      onClick={() => startLondonMulligan(true)}
                      className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-bold text-sm shadow flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={14}/> Mulligan Again
                    </button>
                  ) : (
                    <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg font-bold">
                      Max 7 Mulligans Reached (0 cards kept)
                    </span>
                  )}
                  {modal.count === 0 && (
                    <button 
                      onClick={() => setModal(null)}
                      className="text-gray-400 hover:text-gray-600 text-2xl font-bold px-2 cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900 rounded-xl justify-center content-start min-h-[300px] custom-scrollbar">
                {cards.filter(c => c.ownerId === savedId && c.zone === 'hand').map((card) => {
                  const isSelected = londonSelected.includes(card.id);
                  const selectedIndex = londonSelected.indexOf(card.id);
                  return (
                    <div 
                      key={card.id} 
                      onClick={() => {
                        if (isSelected) {
                          setLondonSelected(londonSelected.filter(id => id !== card.id));
                        } else {
                          if (londonSelected.length < modal.count) {
                            setLondonSelected([...londonSelected, card.id]);
                          }
                        }
                      }}
                      className={`relative cursor-pointer transition-all duration-200 transform ${
                        isSelected 
                          ? 'scale-105 ring-4 ring-cyan-500 shadow-2xl -translate-y-2' 
                          : 'hover:scale-102 hover:-translate-y-1 opacity-90 hover:opacity-100'
                      }`}
                    >
                      <img src={card.imageUrl} className="w-[140px] md:w-[160px] rounded-lg shadow-md" />
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-cyan-600 text-white font-extrabold w-7 h-7 rounded-full flex items-center justify-center shadow-lg text-sm border-2 border-white">
                          {selectedIndex + 1}
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute bottom-2 left-2 right-2 bg-black/80 text-white text-[11px] font-bold py-1 text-center rounded">
                          To Bottom #{selectedIndex + 1}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-2 border-t dark:border-gray-700">
                <span className="text-sm font-semibold text-gray-500">
                  {londonSelected.length === modal.count 
                    ? `✓ Ready! ${modal.count} card(s) will be put on the bottom of your library.`
                    : `Please choose ${modal.count - londonSelected.length} more card(s).`}
                </span>
                <div className="flex gap-3">
                  {modal.count === 0 && (
                    <button 
                      onClick={() => setModal(null)} 
                      className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold text-sm"
                    >
                      Cancel
                    </button>
                  )}
                  <button 
                    disabled={londonSelected.length !== modal.count}
                    onClick={() => {
                      moveCards(londonSelected, 'library', 0, 0, true);
                      logAction(`completed London Mulligan #${modal.count} (put ${modal.count} card(s) on the bottom of library).`);
                      setModal(null);
                      setLondonSelected([]);
                    }}
                    className={`px-6 py-2 rounded-lg font-bold text-sm shadow flex items-center gap-2 ${
                      londonSelected.length === modal.count 
                        ? 'bg-cyan-500 hover:bg-cyan-600 text-white cursor-pointer animate-pulse' 
                        : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Put on Bottom & Keep Hand
                  </button>
                </div>
              </div>
            </div>
          )}

          {modal.type === 'commander_damage' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl flex flex-col gap-4 border-2 border-red-400 w-full max-w-lg shadow-2xl">
              <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
                <h2 className="text-xl font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                  <Shield size={22}/> Commander Damage Tracker (Rule 903.10)
                </h2>
                <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                A player dealt 21 or more combat damage by the <span className="font-bold underline">same</span> commander loses the game.
              </p>

              <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
                {(() => {
                  const commanders = [...new Map(
                    cards.filter(c => (c.isCommander || c.zone === 'command_zone' || c.originalZone === 'command_zone' || (c.commanderTax || 0) > 0) && !c.isCompanion)
                         .map(c => [c.id, c])
                  ).values()];
                  return (
                    <>
                      {commanders.map(comm => {
                        const commOwner = players[comm.ownerId]?.name || 'Unknown';
                        const damage = myData.commanderDamage?.[comm.id] || 0;
                        const isLethal = damage >= 21;
                        return (
                          <div key={comm.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isLethal ? 'bg-red-100 dark:bg-red-950/60 border-red-500 animate-pulse' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'}`}>
                            <img src={comm.imageUrl} className="w-12 h-16 object-cover rounded shadow" />
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm truncate dark:text-gray-100">{comm.name || 'Commander'}</div>
                              <div className="text-xs text-gray-500">Owner: {commOwner} {comm.ownerId === savedId ? '(You)' : ''}</div>
                              {isLethal && <div className="text-xs font-black text-red-600 dark:text-red-400 mt-0.5">⚠️ 21+ LETHAL DAMAGE TAKEN!</div>}
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => updateCommanderDamage(comm.id, -1, comm.name)} 
                                className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center text-lg cursor-pointer"
                              >
                                -
                              </button>
                              <div className="flex flex-col items-center min-w-[3rem]">
                                <span className={`text-xl font-black ${isLethal ? 'text-red-600' : 'text-gray-800 dark:text-gray-100'}`}>{damage}</span>
                                <span className="text-[10px] text-gray-400">/ 21</span>
                              </div>
                              <button 
                                onClick={() => updateCommanderDamage(comm.id, 1, comm.name)} 
                                className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold flex items-center justify-center text-lg shadow cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {commanders.length === 0 && (
                        <div className="text-center py-6 text-sm text-gray-500">
                          No commanders found.<br/>
                          Move your commander to the Command Zone or mark a card as Commander!
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="flex justify-between items-center pt-3 border-t dark:border-gray-700">
                <span className="text-xs text-gray-500">Total Life: {myData.life}</span>
                <button onClick={() => setModal(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold text-sm hover:bg-gray-300">
                  Close
                </button>
              </div>
            </div>
          )}

          {modal.type === 'settings' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl flex flex-col gap-4 border border-pink-300 w-full max-w-sm shadow-2xl">
              <h2 className="text-2xl font-bold text-pink-600 flex items-center gap-2"><Settings /> Game Options</h2>
              <div className="flex flex-col gap-2.5 mt-2">
                <label className="bg-pink-400 text-white p-2.5 rounded-lg shadow hover:bg-pink-500 cursor-pointer flex justify-center items-center gap-2 font-bold text-sm w-full">
                  <Upload size={16} /> Load Deck (.o8d) <input type="file" accept=".o8d" className="hidden" onChange={(e) => { handleFileUpload(e); setModal(null); }} />
                </label>
                
                <div className="flex gap-2">
                  {isOpeningDeal ? (
                    <button onClick={() => { dealOpeningHand(); setModal(null); }} className="flex-1 bg-emerald-500 text-white p-2 rounded-lg shadow hover:bg-emerald-600 font-bold text-xs flex gap-1 items-center justify-center animate-pulse cursor-pointer">
                      <Sparkles size={14}/> Deal Opening 7
                    </button>
                  ) : (
                    <button onClick={() => { startLondonMulligan(); setModal(null); }} className="flex-1 bg-cyan-500 text-white p-2 rounded-lg shadow hover:bg-cyan-600 font-bold text-xs flex gap-1 items-center justify-center cursor-pointer">
                      <RefreshCw size={14}/> London Mulligan
                    </button>
                  )}
                  <button onClick={() => { resetRound(); setModal(null); }} className="flex-1 bg-indigo-500 text-white p-2 rounded-lg shadow hover:bg-indigo-600 font-bold text-xs flex gap-1 items-center justify-center cursor-pointer" title="Resets board/life but keeps Sideboard intact">
                    Game 2/3 Reset
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs font-bold">
                  <span>Starting Life:</span>
                  <div className="flex gap-1">
                    <button onClick={() => { setStartingLife(20); setModal(null); }} className={`px-2 py-1 rounded ${(myData.startingLife || 20) === 20 ? 'bg-pink-500 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>20</button>
                    <button onClick={() => { setStartingLife(30); setModal(null); }} className={`px-2 py-1 rounded ${(myData.startingLife || 20) === 30 ? 'bg-pink-500 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>30</button>
                    <button onClick={() => { setStartingLife(40); setModal(null); }} className={`px-2 py-1 rounded ${(myData.startingLife || 20) === 40 ? 'bg-pink-500 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>40</button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => { setModal({ type: 'commander_damage' }); }} className="flex-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 p-2 rounded-lg border border-red-300 font-bold text-xs flex gap-1 items-center justify-center">
                    <Shield size={14}/> Cmd Damage
                  </button>
                  <button onClick={() => { setModal({ type: 'dice_menu' }); }} className="flex-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 p-2 rounded-lg border border-purple-300 font-bold text-xs flex gap-1 items-center justify-center">
                    <Coins size={14}/> Dice & Coins
                  </button>
                </div>

                <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="bg-gray-200 dark:bg-gray-700 p-2 rounded-lg shadow hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center font-bold text-sm gap-2">
                  {theme === 'light' ? <><Moon size={14} /> Dark Mode</> : <><Sun size={14} /> Light Mode</>}
                </button>

                <button 
                  onClick={() => setModal({ type: 'appearance' })} 
                  className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white p-2.5 rounded-lg shadow font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
                >
                  <Palette size={16} /> Customize Appearance (Sleeves & Playmat)
                </button>

                <button 
                  onClick={() => toggleAdvancedPlay()} 
                  className={`p-2.5 rounded-lg shadow font-bold text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    advancedPlay ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                  title="Show/hide Attack, Target, Attach, and Temp P/T buttons on cards"
                >
                  <span className="flex items-center gap-2"><Zap size={14} /> Advanced Play (Targeting & Buffs)</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-black ${advancedPlay ? 'bg-indigo-800 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'}`}>
                    {advancedPlay ? 'ON' : 'OFF'}
                  </span>
                </button>

                {window.location.protocol === 'file:' && (
                  <button onClick={() => {
                    setModal({ type: 'prompt_server_ip' });
                  }} className="bg-indigo-500 text-white p-2 rounded-lg shadow hover:bg-indigo-600 font-bold text-sm flex gap-2 items-center justify-center w-full">
                    Change Server IP
                  </button>
                )}

                <div className="border-t border-gray-300 dark:border-gray-600 my-1"></div>

                <button onClick={() => { restartGame(); setModal(null); }} className="bg-orange-400 text-white p-2 rounded-lg shadow hover:bg-orange-500 font-bold text-xs flex gap-2 items-center justify-center w-full"><RefreshCw size={14}/> Restart My Deck</button>
                <button onClick={async () => {
                  setModal(null);
                  const ok = await askConfirm("Clear your entire board and reset your life?", "Clear Board");
                  if (ok) {
                    const deletions = cards.filter(c => c.ownerId === savedId).map(c => ({ id: c.id, delete: true }));
                    broadcastCards(deletions);
                    updatePlayer({ life: myData.startingLife ?? 20, poison: 0, energy: 0, experience: 0, commanderDamage: {}, mana: { w:0, u:0, b:0, r:0, g:0, c:0 } });
                    logAction(`cleared their board!`);
                  }
                }} className="bg-red-500 text-white p-2 rounded-lg shadow hover:bg-red-600 font-bold text-xs flex gap-2 items-center justify-center w-full cursor-pointer"><Skull size={14}/> Clear My Board</button>
              </div>
              <button onClick={() => setModal(null)} className="mt-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold py-1.5 rounded shadow text-sm cursor-pointer">Close</button>
            </div>
          )}

          {modal.type === 'appearance' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl flex flex-col gap-4 border border-pink-300 dark:border-pink-500/40 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between border-b pb-3 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Palette className="text-pink-500" size={24} />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Customize Appearance</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Personalize your card sleeves and battlefield playmat</p>
                  </div>
                </div>
                <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-bold p-1 cursor-pointer">✕</button>
              </div>

              {/* Tab Navigation */}
              <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700/60 p-1">
                <button
                  type="button"
                  onClick={() => setAppearanceTab('sleeves')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    appearanceTab === 'sleeves'
                      ? 'bg-white dark:bg-gray-800 text-pink-600 dark:text-pink-400 shadow'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                  }`}
                >
                  <Layers size={14} /> Card Sleeves (Card Back)
                </button>
                <button
                  type="button"
                  onClick={() => setAppearanceTab('playmat')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    appearanceTab === 'playmat'
                      ? 'bg-white dark:bg-gray-800 text-pink-600 dark:text-pink-400 shadow'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                  }`}
                >
                  <Sparkles size={14} /> Battlefield Playmat
                </button>
              </div>

              {appearanceTab === 'sleeves' && (
                <div className="flex flex-col gap-4">
                  {/* Sleeve Live Preview */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-pink-50/50 dark:bg-gray-900/50 p-4 rounded-xl border border-pink-200 dark:border-gray-700">
                    <div className="relative w-28 h-40 rounded-xl overflow-hidden shadow-xl border-2 border-pink-400 dark:border-pink-500 shrink-0 bg-gray-800">
                      <img src={customCardBack || CARD_BACK} alt="Card sleeve preview" className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 inset-x-1 bg-black/70 text-white text-[9px] font-bold text-center py-0.5 rounded backdrop-blur">
                        Live Preview
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 text-center sm:text-left">
                      <span className="font-bold text-sm text-gray-800 dark:text-gray-100">
                        {customCardBack ? 'Custom Card Sleeve Active' : 'Default Magic Card Back'}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        This artwork appears on the back of all your library cards, face-down cards, and in your opponent's view when hidden.
                      </p>
                      {customCardBack && (
                        <button
                          type="button"
                          onClick={() => handleSetCardBack('')}
                          className="mt-2 text-xs text-red-500 hover:text-red-700 font-bold self-start cursor-pointer flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Reset to Default Magic Back
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sleeve Presets */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Quick Presets</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { name: 'Default Magic', value: '', img: CARD_BACK },
                        { name: 'Anime Aesthetic', value: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80', img: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=200&auto=format&fit=crop&q=60' },
                        { name: 'Cosmic Nebula', value: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=500&auto=format&fit=crop&q=80', img: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=200&auto=format&fit=crop&q=60' },
                        { name: 'Dark Texture', value: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80', img: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=60' },
                      ].map(p => {
                        const isSelected = (customCardBack === p.value) || (!customCardBack && !p.value);
                        return (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => handleSetCardBack(p.value)}
                            className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                              isSelected
                                ? 'border-pink-500 ring-2 ring-pink-400 bg-pink-50 dark:bg-pink-950/30'
                                : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-gray-600 bg-gray-50/50 dark:bg-gray-800'
                            }`}
                          >
                            <img src={p.img} className="w-14 h-20 object-cover rounded shadow" alt={p.name} />
                            <span className="text-[11px] font-bold text-center leading-tight truncate w-full">{p.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom URL or File Upload */}
                  <div className="flex flex-col gap-2 pt-2 border-t dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Custom Image</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Paste image URL (https://...)"
                        value={sleeveUrlInput}
                        onChange={(e) => setSleeveUrlInput(e.target.value)}
                        className="flex-1 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-pink-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (sleeveUrlInput.trim()) {
                            handleSetCardBack(sleeveUrlInput.trim());
                            setSleeveUrlInput('');
                          }
                        }}
                        className="bg-pink-500 hover:bg-pink-600 text-white px-3 py-2 rounded-lg font-bold text-xs cursor-pointer shadow transition-colors"
                      >
                        Apply
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <label className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow transition-colors">
                        <Upload size={14} /> Upload Card Sleeve Image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) {
                              const resized = await resizeImageFile(file, 600, 840, 0.85);
                              if (resized) {
                                const finalUrl = await uploadAssetToServer(resized);
                                handleSetCardBack(finalUrl);
                              }
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {appearanceTab === 'playmat' && (
                <div className="flex flex-col gap-4">
                  {/* Playmat Live Preview */}
                  <div className="flex flex-col gap-2 bg-pink-50/50 dark:bg-gray-900/50 p-4 rounded-xl border border-pink-200 dark:border-gray-700">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-800 dark:text-gray-100">Battlefield Playmat Preview</span>
                      {customBattlefieldBg && (
                        <button
                          type="button"
                          onClick={() => handleSetBattlefieldBg('')}
                          className="text-red-500 hover:text-red-700 font-bold cursor-pointer flex items-center gap-1 text-[11px]"
                        >
                          <Trash2 size={11} /> Reset to Default
                        </button>
                      )}
                    </div>
                    <div 
                      className="w-full h-32 rounded-xl shadow-inner border border-gray-300 dark:border-gray-600 relative overflow-hidden flex items-center justify-center p-2"
                      style={getBattlefieldStyle(customBattlefieldBg)}
                    >
                      {/* Sample Card on playmat */}
                      <div className="w-16 h-22 bg-gray-900 rounded shadow-2xl border border-pink-300 dark:border-gray-600 flex items-center justify-center relative overflow-hidden">
                        <img src={customCardBack || CARD_BACK} className="w-full h-full object-cover opacity-90" alt="card preview" />
                      </div>
                      <div className="absolute bottom-1 right-2 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur">
                        Playmat Preview
                      </div>
                    </div>
                  </div>

                  {/* Playmat Presets */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Playmat Themes</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { name: 'Default Cozy', value: '', previewBg: '#fff0f5' },
                        { name: 'Green Felt', value: 'preset:green_felt', previewBg: '#133926' },
                        { name: 'Dark Marble', value: 'preset:dark_marble', previewBg: '#18181b' },
                        { name: 'Cosmic Space', value: 'preset:cosmic', previewBg: '#090a0f' },
                        { name: 'Rich Wood', value: 'preset:wood', previewBg: '#2a1a12' },
                        { name: 'Sakura Pink', value: 'preset:sakura', previewBg: '#fdf2f8' },
                        { name: 'Cyber Grid', value: 'preset:cyberpunk', previewBg: '#090914' },
                      ].map(p => {
                        const isSelected = (customBattlefieldBg === p.value) || (!customBattlefieldBg && !p.value);
                        return (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => handleSetBattlefieldBg(p.value)}
                            className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                              isSelected
                                ? 'border-pink-500 ring-2 ring-pink-400 bg-pink-50 dark:bg-pink-950/30'
                                : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-gray-600 bg-gray-50/50 dark:bg-gray-800'
                            }`}
                          >
                            <div 
                              className="w-full h-12 rounded-lg shadow-inner border border-black/20"
                              style={p.value ? getBattlefieldStyle(p.value) : { backgroundColor: p.previewBg }}
                            />
                            <span className="text-[11px] font-bold text-center leading-tight truncate w-full">{p.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom URL or File Upload for Playmat */}
                  <div className="flex flex-col gap-2 pt-2 border-t dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Custom Wallpaper / Playmat</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Paste image URL (https://...)"
                        value={playmatUrlInput}
                        onChange={(e) => setPlaymatUrlInput(e.target.value)}
                        className="flex-1 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-pink-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (playmatUrlInput.trim()) {
                            handleSetBattlefieldBg(playmatUrlInput.trim());
                            setPlaymatUrlInput('');
                          }
                        }}
                        className="bg-pink-500 hover:bg-pink-600 text-white px-3 py-2 rounded-lg font-bold text-xs cursor-pointer shadow transition-colors"
                      >
                        Apply
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <label className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow transition-colors">
                        <Upload size={14} /> Upload Playmat Image / Wallpaper
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) {
                              const resized = await resizeImageFile(file, 1600, 900, 0.85);
                              if (resized) {
                                const finalUrl = await uploadAssetToServer(resized);
                                handleSetBattlefieldBg(finalUrl);
                              }
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setModal(null)}
                className="mt-2 bg-pink-500 hover:bg-pink-600 text-white font-bold py-2 rounded-xl shadow text-sm cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {modal.type === 'help' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl flex flex-col gap-4 border border-pink-300 w-full max-w-xl shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
              <h2 className="text-2xl font-bold text-pink-600 flex items-center gap-2"><HelpCircle /> Keybinds & Controls</h2>
              <div className="flex flex-col gap-2 text-sm dark:text-gray-200">
                <div className="font-bold text-pink-500 mt-2">Global Keybinds</div>
                <div className="grid grid-cols-2 gap-y-2 border-l-2 border-pink-200 pl-3">
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">D</span><span>Draw a card</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">S</span><span>Scry 1</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">U</span><span>Untap all permanents</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">M</span><span>London Mulligan</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">K</span><span>Flip a Coin</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">6</span><span>Roll a d6</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">Y</span><span>Roll Planar Die</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">H</span><span>Reveal / Hide Hand</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">B</span><span>Sideboard Explorer</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">Ctrl + Z / Y</span><span>Undo / Redo</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">Enter / Space</span><span>Pass / Take Turn</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">L / G</span><span>Lose / Gain 1 Life</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">R</span><span>Roll a d20</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">P / E</span><span>Add Poison / Energy</span>
                </div>
                
                <div className="font-bold text-pink-500 mt-2">Card Keybinds (Hover a Card)</div>
                <div className="grid grid-cols-2 gap-y-2 border-l-2 border-pink-200 pl-3">
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">T</span><span>Tap / Untap</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">Q</span><span>Transform / Flip Face</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">A</span><span>Attack Target / Player</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">X</span><span>Target with Spell / Ability</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">E</span><span>Attach / Equip to Creature</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">[ / ]</span><span>Temp P/T Buff (-1/-1 or +1/+1)</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">F</span><span>Flip Face-Down / Up</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">+ / -</span><span>Add / Remove +1/+1</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">C</span><span>Duplicate Token</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">V</span><span>Reveal Card in Hand</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">Esc</span><span>Cancel Targeting / Attaching</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">? or /</span><span>Search Rules on Google (or type /rule in chat)</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded max-w-max">Delete</span><span>Delete Card</span>
                </div>

                <div className="font-bold text-pink-500 mt-2">Custom Counters & Targeting</div>
                <div className="border-l-2 border-pink-200 pl-3">
                  <strong>Right-Click</strong> any card to add custom counters (Loyalty, Charge, Stun, etc).<br/>
                  <strong>Targeting</strong>: Press <strong>A</strong> to attack or <strong>X</strong> to target with a card, then click any card or player avatar! Click an arrow to remove it.<br/>
                  <strong>Attaching</strong>: Press <strong>E</strong> or click the paperclip on equipment/auras, then click a creature to attach it!
                </div>
              </div>
              <button onClick={() => setModal(null)} className="mt-4 bg-pink-500 hover:bg-pink-600 text-white font-bold py-2 rounded shadow cursor-pointer">Got it!</button>
            </div>
          )}

          {modal.type === 'pt_modifier' && (() => {
            const card = cards.find(c => c.id === modal.cardId);
            if (!card) return null;
            const currentP = card.tempPower || 0;
            const currentT = card.tempToughness || 0;

            return (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl flex flex-col gap-4 border border-emerald-300 dark:border-emerald-700 shadow-2xl w-96 text-gray-800 dark:text-gray-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <Shield size={18} /> Temp P/T Buff
                  </h2>
                  <span className="text-xs font-bold text-gray-400">Until End of Turn</span>
                </div>

                <div className="text-center font-bold text-sm text-gray-600 dark:text-gray-300">
                  {card.name}
                </div>

                <div className="flex items-center justify-center gap-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Power</span>
                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={() => adjustCardPT(card.id, -1, 0)} className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-black text-sm cursor-pointer">-</button>
                      <span className="text-2xl font-black min-w-[36px] text-center text-emerald-700 dark:text-emerald-300">{currentP >= 0 ? `+${currentP}` : currentP}</span>
                      <button onClick={() => adjustCardPT(card.id, 1, 0)} className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-black text-sm cursor-pointer">+</button>
                    </div>
                  </div>
                  <span className="text-2xl font-light text-gray-400">/</span>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Toughness</span>
                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={() => adjustCardPT(card.id, 0, -1)} className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-black text-sm cursor-pointer">-</button>
                      <span className="text-2xl font-black min-w-[36px] text-center text-emerald-700 dark:text-emerald-300">{currentT >= 0 ? `+${currentT}` : currentT}</span>
                      <button onClick={() => adjustCardPT(card.id, 0, 1)} className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-black text-sm cursor-pointer">+</button>
                    </div>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-1.5 text-xs font-bold">
                  <button onClick={() => { adjustCardPT(card.id, 1, 1); }} className="p-2 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 cursor-pointer">+1/+1</button>
                  <button onClick={() => { adjustCardPT(card.id, 2, 2); }} className="p-2 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 cursor-pointer">+2/+2</button>
                  <button onClick={() => { adjustCardPT(card.id, 3, 3); }} className="p-2 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 cursor-pointer" title="Giant Growth">+3/+3</button>
                  <button onClick={() => { adjustCardPT(card.id, 1, 0); }} className="p-2 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 cursor-pointer">+1/+0</button>
                  <button onClick={() => { adjustCardPT(card.id, 2, 0); }} className="p-2 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 cursor-pointer">+2/+0</button>
                  <button onClick={() => { adjustCardPT(card.id, 0, 1); }} className="p-2 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 cursor-pointer">+0/+1</button>
                  <button onClick={() => { adjustCardPT(card.id, -1, -1); }} className="p-2 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800 cursor-pointer">-1/-1</button>
                  <button onClick={() => { adjustCardPT(card.id, -2, -2); }} className="p-2 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800 cursor-pointer">-2/-2</button>
                </div>

                <div className="flex gap-2 mt-2">
                  <button onClick={() => {
                    modifyCard(card.id, { tempPower: 0, tempToughness: 0 });
                    logAction(`reset P/T buffs on ${card.name}.`);
                    setModal(null);
                  }} className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold py-2 rounded-xl text-xs cursor-pointer">
                    Reset (0/0)
                  </button>
                  <button onClick={() => setModal(null)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs shadow cursor-pointer">
                    Done
                  </button>
                </div>
              </div>
            );
          })()}

          {modal.type === 'explore' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl flex flex-col gap-4 border border-gray-400 w-[900px] max-h-[90vh]">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold capitalize">{modal.zone} Explorer</h2>
                <div className="flex items-center gap-2">
                  <input type="text" placeholder="Search..." value={exploreSearch} onChange={e => setExploreSearch(e.target.value)} className="p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 outline-none w-64" />
                  <button onClick={() => { setModal(null); setExploreSearch(''); }} className="text-gray-400 font-bold text-xl ml-4">×</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 overflow-y-auto p-4 bg-gray-100 dark:bg-gray-900 rounded-lg min-h-[400px] content-start"
                   onDragOver={e => e.preventDefault()}
                   onDrop={e => {
                     e.stopPropagation();
                     const ids = getDragCardIds(e);
                     if (ids.length > 0) moveCards(ids, modal.zone);
                   }}>
                {cards.filter(c => c.zone === modal.zone && c.ownerId === modal.ownerId && (!exploreSearch || (c.name && c.name.toLowerCase().includes(exploreSearch.toLowerCase())))).map(c => (
                  <img key={c.id} src={c.imageUrl} draggable onDragStart={(e) => onDragStart(e, c.id)} onMouseEnter={() => handleSetHoveredCard(c)} onMouseLeave={() => handleSetHoveredCard(null)} className="w-[180px] rounded-lg shadow-lg cursor-grab active:cursor-grabbing hover:scale-105 transition-transform" />
                ))}
              </div>
              <p className="text-sm text-gray-500 text-center">Drag cards out of here to put them on the battlefield or in your hand.</p>
            </div>
          )}

        </div>
      )}

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col relative" id="battlefield-container" onMouseMove={handleBoardMouseMove} onClick={() => { if (targetingSource) setTargetingSource(null); if (attachingCardId) setAttachingCardId(null); }}>
        {/* Hover Image */}
        {hoveredCard && (
          <div className="absolute top-24 left-4 z-50 pointer-events-auto drop-shadow-2xl flex flex-col gap-1.5">
            <img src={hoveredCard.faceDown && (hoveredCard.ownerId !== savedId || hoveredCard.zone === 'library') ? getCardBackForCard(hoveredCard) : (previewFlipped && hoveredCard.backImageUrl ? hoveredCard.backImageUrl : hoveredCard.imageUrl)} className="w-72 rounded-xl border-4 border-pink-300 dark:border-gray-600 shadow-2xl" />
            {hoveredCard.faceDown && hoveredCard.ownerId === savedId && hoveredCard.zone === 'battlefield' && (
              <div className="bg-black/80 text-white text-xs font-bold px-2 py-1 rounded text-center">Face-Down (Private View)</div>
            )}
            {hoveredCard.backImageUrl && (
              <button onClick={() => setPreviewFlipped(prev => !prev)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow flex items-center justify-center gap-1.5 cursor-pointer">
                <RefreshCw size={13} className={previewFlipped ? 'rotate-180 transition-transform' : ''}/>
                {previewFlipped ? 'Show Front Face' : 'Preview Other Face'} (Q)
              </button>
            )}
          </div>
        )}

        {/* Floating Targeting / Attaching Banner */}
        {targetingSource && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 backdrop-blur text-white px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 border border-red-400 animate-pulse pointer-events-auto">
            <Crosshair size={18} className="text-red-300" />
            <span className="font-bold text-sm">{targetingSource.label === 'Attacks' ? 'Select attacker target (Card or Opponent)' : 'Select spell/ability target'}</span>
            <button onClick={() => setTargetingSource(null)} className="bg-red-800 hover:bg-red-700 px-2 py-0.5 rounded text-xs font-bold cursor-pointer">Cancel (Esc)</button>
          </div>
        )}

        {attachingCardId && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-purple-900/90 backdrop-blur text-white px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 border border-purple-400 animate-bounce pointer-events-auto">
            <Paperclip size={18} className="text-purple-300" />
            <span className="font-bold text-sm">Click a creature on your battlefield to attach to</span>
            <button onClick={() => setAttachingCardId(null)} className="bg-purple-800 hover:bg-purple-700 px-2 py-0.5 rounded text-xs font-bold cursor-pointer">Cancel (Esc)</button>
          </div>
        )}

        {/* SVG Arrow Overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible">
          <defs>
            <marker id="arrowhead-red" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
            </marker>
            <marker id="arrowhead-blue" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
            </marker>
            <filter id="arrow-glow">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#000" floodOpacity="0.6"/>
            </filter>
          </defs>

          {targetArrows.map(arrow => {
            const container = document.getElementById('battlefield-container');
            if (!container) return null;
            const fromEl = document.getElementById('card-' + arrow.fromCardId);
            const toEl = arrow.toPlayerId 
              ? document.getElementById(arrow.toPlayerId === savedId ? 'my-info-box' : 'opponent-info-box')
              : document.getElementById('card-' + arrow.toCardId);
            if (!fromEl || !toEl) return null;
            const start = getCenter(fromEl, container);
            const end = getCenter(toEl, container);
            if (!start || !end) return null;

            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const normalX = -dy * 0.12;
            const normalY = dx * 0.12;
            const midX = (start.x + end.x) / 2 + normalX;
            const midY = (start.y + end.y) / 2 + normalY;
            const pathD = `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
            const isAttack = arrow.label === 'Attacks';
            const strokeColor = arrow.color || (isAttack ? '#ef4444' : '#3b82f6');
            const markerId = isAttack ? 'arrowhead-red' : 'arrowhead-blue';

            return (
              <g key={arrow.id} className="pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); removeArrow(arrow.id); }}>
                <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" markerEnd={`url(#${markerId})`} filter="url(#arrow-glow)" opacity="0.9" />
                <path d={pathD} fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.75" />
                <foreignObject x={midX - 35} y={midY - 12} width="70" height="24" className="overflow-visible pointer-events-none">
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-black text-white shadow text-center flex items-center justify-center gap-0.5 border border-white/50 ${isAttack ? 'bg-red-600' : 'bg-blue-600'}`}>
                    {isAttack ? '⚔️ Atk' : '🎯 Target'}
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {targetingSource && (() => {
            const container = document.getElementById('battlefield-container');
            const fromEl = document.getElementById('card-' + targetingSource.cardId);
            if (!container || !fromEl) return null;
            const start = getCenter(fromEl, container);
            if (!start) return null;
            const end = mousePos;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const normalX = -dy * 0.12;
            const normalY = dx * 0.12;
            const midX = (start.x + end.x) / 2 + normalX;
            const midY = (start.y + end.y) / 2 + normalY;
            const pathD = `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
            const isAttack = targetingSource.label === 'Attacks';
            const strokeColor = isAttack ? '#ef4444' : '#3b82f6';
            const markerId = isAttack ? 'arrowhead-red' : 'arrowhead-blue';

            return (
              <g>
                <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="3" strokeDasharray="6 3" strokeLinecap="round" markerEnd={`url(#${markerId})`} opacity="0.85" filter="url(#arrow-glow)" />
                <circle cx={end.x} cy={end.y} r="5" fill={strokeColor} stroke="white" strokeWidth="2" />
              </g>
            );
          })()}
        </svg>

        {/* Opponent Area */}
        <div id="opponent-battlefield" className="flex-1 relative border-b-4 border-dashed border-pink-300 dark:border-gray-700 bg-pink-50/30 dark:bg-gray-900/30" style={getBattlefieldStyle(oppData.battlefieldBg)} onDragOver={e => e.preventDefault()} onDrop={onDropBoard}>
          
          {oppData.revealedHand && (
            <div className="absolute top-4 left-80 right-48 bg-emerald-950/85 backdrop-blur border border-emerald-400 p-2 rounded-xl z-20 shadow-2xl flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-300 px-1">
                <span className="flex items-center gap-1.5"><Eye size={14}/> {oppData.name}'s Revealed Hand ({cards.filter(c => c.ownerId !== savedId && c.zone === 'hand').length} cards)</span>
                <span className="text-[10px] text-emerald-400/80">Live View</span>
              </div>
              <div className="flex gap-2 overflow-x-auto p-1 custom-scrollbar">
                {cards.filter(c => c.ownerId !== savedId && c.zone === 'hand').map(c => (
                  <div key={c.id} className="relative group shrink-0" onMouseEnter={() => handleSetHoveredCard(c)} onMouseLeave={() => handleSetHoveredCard(null)}>
                    <img src={c.imageUrl} className="w-[75px] rounded shadow-md border border-emerald-500 hover:scale-105 transition-transform" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div 
            id="opponent-info-box"
            onClick={() => {
              if (targetingSource) {
                completeTargeting(null, oppId);
              }
            }}
            className={`absolute top-4 right-4 bg-white dark:bg-gray-800 p-3 rounded-xl shadow flex flex-col items-end gap-2 z-10 border border-gray-200 dark:border-gray-700 transition-all ${targetingSource ? 'ring-4 ring-red-500 cursor-crosshair animate-pulse' : ''}`}
          >
            <div className="flex items-center gap-2">
              {monarch === oppId && <Crown size={16} className="text-amber-500 fill-amber-400 animate-bounce" title="Current Monarch" />}
              <span className="font-bold text-gray-500">{oppData.name}</span>
              <Heart className="text-pink-500" />
              <span className="text-2xl font-bold">{oppData.life}</span>
            </div>
            {oppData.poison > 0 && (
              <div 
                className={`flex items-center gap-1 font-bold ${oppData.poison >= 10 ? 'text-red-500 animate-pulse bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded border border-red-500' : 'text-green-600 dark:text-green-400'}`} 
                title={oppData.poison >= 10 ? 'Lethal Poison (Rule 704.5c - Game Loss 💀)' : 'Poison'}
              >
                <Skull size={14} className={oppData.poison >= 10 ? 'text-red-500 animate-bounce' : ''} />
                <span>{oppData.poison}{oppData.poison >= 10 ? ' (DEAD)' : ''}</span>
              </div>
            )}
            {oppData.energy > 0 && (
              <div className="flex items-center gap-1 text-yellow-500 dark:text-yellow-400" title="Energy">
                <Zap size={14} />
                <span className="font-bold">{oppData.energy}</span>
              </div>
            )}
            {oppData.experience > 0 && (
              <div className="flex items-center gap-1 text-purple-500 dark:text-purple-400" title="Experience">
                <Star size={14} />
                <span className="font-bold">{oppData.experience}</span>
              </div>
            )}
          </div>

          <div className="absolute top-4 left-4 flex gap-4 z-10">
            {/* Opponent Hand Mini */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold text-blue-500">Opp Hand</span>
              <div className="w-16 h-24 bg-blue-100 dark:bg-blue-900/40 rounded shadow border-2 border-blue-300 flex items-center justify-center relative">
                <span className="text-3xl font-bold text-blue-800 dark:text-blue-200">{cards.filter(c => c.ownerId !== savedId && c.zone === 'hand').length}</span>
              </div>
            </div>

            {/* Opponent Graveyard Mini */}
            <div className="flex flex-col items-center gap-1 group">
              <span className="text-xs font-bold text-gray-500">Opp Graveyard ({oppGraveCards.length})</span>
              <div className="w-16 h-24 bg-gray-200 dark:bg-gray-800 rounded shadow border-2 border-dashed border-gray-400 relative">
                <button onClick={() => { logAction(`is looking through the opponent's graveyard.`); setModal({type: 'explore', zone: 'graveyard', ownerId: Object.keys(players).find(k => k !== savedId)}); }} className="absolute -top-2 -right-2 bg-gray-700 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 z-20 shadow hover:bg-gray-600"><Eye size={12}/></button>
                {oppGraveCards.length > 0 && (() => {
                  const topGrave = oppGraveCards[oppGraveCards.length - 1];
                  return (
                    <img draggable onDragStart={(e) => onDragStart(e, topGrave.id)} onMouseEnter={() => handleSetHoveredCard(topGrave)} onMouseLeave={() => handleSetHoveredCard(null)} src={topGrave.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-80 cursor-grab" />
                  );
                })()}
              </div>
            </div>
            {/* Opponent Exile Mini */}
            <div className="flex flex-col items-center gap-1 group">
              <span className="text-xs font-bold text-gray-500">Opp Exile ({oppExileCards.length})</span>
              <div className="w-16 h-24 bg-gray-200 dark:bg-gray-800 rounded shadow border-2 border-dashed border-gray-400 relative">
                <button onClick={() => setModal({type: 'explore', zone: 'exile', ownerId: Object.keys(players).find(k => k !== savedId)})} className="absolute -top-2 -right-2 bg-slate-700 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 z-20 shadow hover:bg-slate-600"><Eye size={12}/></button>
                {oppExileCards.length > 0 && (() => {
                  const topExile = oppExileCards[oppExileCards.length - 1];
                  return (
                    <img draggable onDragStart={(e) => onDragStart(e, topExile.id)} onMouseEnter={() => handleSetHoveredCard(topExile)} onMouseLeave={() => handleSetHoveredCard(null)} src={topExile.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-80 cursor-grab grayscale" />
                  );
                })()}
              </div>
            </div>
            {/* Opponent Command Zone Mini */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-500">Command</span>
              <div className="w-16 h-24 rounded relative flex justify-center">
                {cards.filter(c => c.ownerId !== savedId && c.zone === 'command_zone').map((c, i) => (
                  <img key={c.id} draggable onDragStart={(e) => onDragStart(e, c.id)} onMouseEnter={() => handleSetHoveredCard(c)} onMouseLeave={() => handleSetHoveredCard(null)} src={c.imageUrl} className="absolute w-16 h-24 object-cover rounded shadow border border-amber-300 cursor-grab hover:-translate-y-2 transition-transform" style={{ left: i * 20 }} />
                ))}
              </div>
            </div>
          </div>

          {(() => {
            const oppCards = cards.filter(c => (c.controllerId ? c.controllerId !== savedId : c.ownerId !== savedId) && c.zone === 'battlefield');
            return oppCards.map(card => {
              const hostCard = card.attachedTo ? cards.find(c => c.id === card.attachedTo && c.zone === 'battlefield') : null;
              let cardX = card.x;
              let cardY = card.y;
              let isAttached = false;
              if (hostCard) {
                isAttached = true;
                const attachedSiblings = cards.filter(c => c.attachedTo === hostCard.id && c.zone === 'battlefield');
                const attachIdx = attachedSiblings.findIndex(c => c.id === card.id);
                cardX = hostCard.x + (attachIdx + 1) * 22;
                cardY = hostCard.y + (attachIdx + 1) * 28;
              }

              return (
                <div 
                  id={'card-' + card.id}
                  key={card.id} draggable onDragStart={(e) => onDragStart(e, card.id)}
                  onMouseEnter={() => handleSetHoveredCard(card)} onMouseLeave={() => handleSetHoveredCard(null)}
                  onClick={(e) => {
                    if (targetingSource) {
                      e.stopPropagation();
                      completeTargeting(card.id, null);
                    }
                  }}
                  className={`absolute transition-transform cursor-grab z-0 hover:z-50 ${card.isTapped ? 'rotate-90' : 'hover:scale-105'} ${targetingSource ? 'ring-4 ring-red-500 rounded cursor-crosshair' : ''}`} 
                  style={{ 
                    left: `max(0px, min(${cardX}px, calc(100% - 100px)))`, 
                    bottom: `max(0px, min(${cardY}px, calc(100% - 140px)))`,
                    zIndex: isAttached ? 5 : (card.isTapped ? 1 : 0)
                  }}
                >
                  <img src={card.faceDown ? oppCardBack : card.imageUrl} className="w-[100px] rounded shadow-md pointer-events-none" />
                  {isAttached && (
                    <div className="absolute -top-3 left-3 bg-purple-700/95 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow z-30 flex items-center gap-1 border border-purple-300 pointer-events-none">
                      <Paperclip size={10} /> Attached
                    </div>
                  )}
                  {card.noUntap && (
                    <div className="absolute -top-3 right-3 bg-amber-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow z-30 flex items-center gap-1 border border-amber-300 pointer-events-none">
                      🔒 No-Untap
                    </div>
                  )}
                  {((card.tempPower || 0) !== 0 || (card.tempToughness || 0) !== 0) && (
                    <div className={`absolute bottom-1 right-1 font-black text-[10px] px-1.5 py-0.5 rounded shadow z-20 border pointer-events-none ${
                      (card.tempPower || 0) >= 0 ? 'bg-emerald-600 border-emerald-300 text-white' : 'bg-red-600 border-red-300 text-white'
                    }`}>
                      {(card.tempPower || 0) >= 0 ? `+${card.tempPower || 0}` : card.tempPower}/{(card.tempToughness || 0) >= 0 ? `+${card.tempToughness || 0}` : card.tempToughness}
                    </div>
                  )}
                  {card.counters !== 0 && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white font-bold px-3 py-1 rounded-full text-xl">{card.counters > 0 ? `+${card.counters}` : card.counters}</div>
                  )}
                  {card.customCounters && Object.entries(card.customCounters).map(([name, amount], i) => {
                    const type = COUNTER_TYPES.find(t => t.name === name);
                    const bgClass = type ? type.color : 'bg-blue-600/90';
                    const icon = type ? type.icon + ' ' : '';
                    return (
                      <div key={name} className={`absolute left-1/2 -translate-x-1/2 ${bgClass} text-white font-bold px-2 py-0.5 rounded text-xs pointer-events-none whitespace-nowrap shadow z-30`} style={{ top: `calc(50% + ${20 + i*20}px)` }}>
                        {icon}{amount > 1 ? `${amount} ` : ''}{name}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>

        {/* My Battlefield */}
        <div id="my-battlefield" className="flex-1 relative overflow-hidden select-none" style={getBattlefieldStyle(myData.battlefieldBg || customBattlefieldBg)} onDragOver={e => e.preventDefault()} onDrop={onDropBoard} onMouseDown={onMouseDownBoard} onMouseMove={onMouseMoveBoard} onMouseUp={onMouseUpBoard} onMouseLeave={onMouseUpBoard}>
          
          {selectionBox && (
            <div className="absolute bg-blue-500/20 border-2 border-blue-500 pointer-events-none z-50" style={{
              left: Math.min(selectionBox.startX, selectionBox.endX),
              top: Math.min(selectionBox.startY, selectionBox.endY),
              width: Math.abs(selectionBox.startX - selectionBox.endX),
              height: Math.abs(selectionBox.startY - selectionBox.endY),
            }} />
          )}

          <div className="absolute top-4 left-4 z-10">
            {/* My Info & Life */}
            <div 
              id="my-info-box"
              onClick={() => {
                if (targetingSource) {
                  completeTargeting(null, savedId);
                }
              }}
              className={`bg-white dark:bg-gray-800 p-2 rounded-xl shadow flex flex-col gap-2 border border-pink-200 dark:border-gray-700 pointer-events-auto transition-all ${targetingSource ? 'ring-4 ring-blue-500 cursor-crosshair' : ''}`}
            >
              <div className="flex items-center gap-3 w-full">
                <button onClick={() => updatePlayer({ life: myData.life - 1 })} className="font-bold text-xl px-2 hover:text-pink-500">-</button>
                <div className="flex flex-col items-center">
                  {monarch === savedId && <div className="flex items-center gap-1 text-[10px] font-black text-amber-500"><Crown size={12} className="fill-amber-400 animate-bounce" /> MONARCH</div>}
                  <span onClick={() => {
                    setModal({ type: 'prompt_name' });
                  }} className="text-[10px] text-gray-400 font-bold uppercase cursor-pointer hover:text-pink-500" title="Click to change name">{savedName}</span>
                  <div className="flex items-center gap-1 -mt-1"><Heart className="text-pink-500" size={20} /><span className="text-2xl font-bold leading-none">{myData.life}</span></div>
                </div>
                <button onClick={() => updatePlayer({ life: myData.life + 1 })} className="font-bold text-xl px-2 hover:text-pink-500">+</button>

                {!isElectron && (
                  <div className="flex gap-1 ml-auto border border-slate-300 dark:border-slate-600 rounded p-0.5">
                    <button onClick={() => socket.emit('undo')} className="bg-slate-500 text-white p-1 rounded flex items-center justify-center hover:bg-slate-600" title="Undo"><Undo size={14}/></button>
                    <button onClick={() => socket.emit('redo')} className="bg-slate-500 text-white p-1 rounded flex items-center justify-center hover:bg-slate-600" title="Redo"><Redo size={14}/></button>
                  </div>
                )}
              </div>

              {/* Starting Life Presets */}
              <div className="flex items-center justify-between border-t dark:border-gray-700 pt-1 text-[10px]">
                <span className="text-gray-400 font-bold">Start Life:</span>
                <div className="flex gap-1 font-bold">
                  <button onClick={() => setStartingLife(20)} className={`px-1.5 py-0.5 rounded ${(myData.startingLife ?? 20) === 20 ? 'bg-pink-500 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'}`} title="Constructed (20 Life)">20</button>
                  <button onClick={() => setStartingLife(30)} className={`px-1.5 py-0.5 rounded ${(myData.startingLife ?? 20) === 30 ? 'bg-pink-500 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'}`} title="Brawl / Two-Headed Giant (30 Life)">30</button>
                  <button onClick={() => setStartingLife(40)} className={`px-1.5 py-0.5 rounded ${(myData.startingLife ?? 20) === 40 ? 'bg-pink-500 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'}`} title="Commander / EDH (40 Life)">40</button>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 border-t dark:border-gray-700 pt-2">
                <div className="flex flex-col items-center">
                  <div 
                    className={`flex items-center gap-1 font-bold text-xs ${myData.poison >= 10 ? 'text-red-500 animate-pulse bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded border border-red-500' : 'text-green-600 dark:text-green-400'}`} 
                    title={myData.poison >= 10 ? 'Lethal Poison (Rule 704.5c - Game Loss 💀)' : 'Poison'}
                  >
                    <Skull size={12} className={myData.poison >= 10 ? 'text-red-500' : ''} />
                    <span>{myData.poison ?? 0}{myData.poison >= 10 ? ' 💀' : ''}</span>
                  </div>
                  <div className="flex gap-1"><button onClick={() => updatePlayer({ poison: Math.max(0, (myData.poison ?? 0) - 1) })} className="text-[10px] hover:text-green-500 cursor-pointer">-</button><button onClick={() => updatePlayer({ poison: (myData.poison ?? 0) + 1 })} className="text-[10px] hover:text-green-500 cursor-pointer">+</button></div>
                </div>
                <div className="flex flex-col items-center">
                  <div 
                    onClick={() => setModal({ type: 'commander_damage' })} 
                    className={`flex items-center gap-1 cursor-pointer hover:underline ${Object.values(myData.commanderDamage || {}).some(d => d >= 21) ? 'text-red-500 animate-bounce' : 'text-red-600 dark:text-red-400'}`} 
                    title="Click for full Commander Damage breakdown per commander (Rule 903.10)"
                  >
                    <Shield size={12} />
                    <span className="font-bold text-xs">
                      {Math.max(...Object.values(myData.commanderDamage || {}), 0)}
                    </span>
                    {Object.values(myData.commanderDamage || {}).some(d => d >= 21) && <span className="text-[9px] font-black text-red-500">!</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setModal({ type: 'commander_damage' })} className="text-[10px] hover:text-red-500 font-semibold" title="Manage Commander Damage">Edit</button>
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-yellow-500 dark:text-yellow-400" title="Energy"><Zap size={12} /><span className="font-bold text-xs">{myData.energy ?? 0}</span></div>
                  <div className="flex gap-1"><button onClick={() => updatePlayer({ energy: Math.max(0, (myData.energy ?? 0) - 1) })} className="text-[10px] hover:text-yellow-500">-</button><button onClick={() => updatePlayer({ energy: (myData.energy ?? 0) + 1 })} className="text-[10px] hover:text-yellow-500">+</button></div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-purple-500 dark:text-purple-400" title="Experience"><Star size={12} /><span className="font-bold text-xs">{myData.experience ?? 0}</span></div>
                  <div className="flex gap-1"><button onClick={() => updatePlayer({ experience: Math.max(0, (myData.experience ?? 0) - 1) })} className="text-[10px] hover:text-purple-500">-</button><button onClick={() => updatePlayer({ experience: (myData.experience ?? 0) + 1 })} className="text-[10px] hover:text-purple-500">+</button></div>
                </div>
              </div>
              <div className="flex gap-1 justify-center border-t dark:border-gray-700 pt-2">
                {['W','U','B','R','G','C'].map(c => (
                  <ManaSymbol key={c} color={c} amount={myData.mana?.[c.toLowerCase()] ?? 0} onClick={() => updateMana(c.toLowerCase(), 1)} onContextMenu={() => updateMana(c.toLowerCase(), -1)} />
                ))}
              </div>
              <div className="flex gap-1 justify-center border-t dark:border-gray-700 pt-2 items-center">
                {isElectron ? (
                  <button onClick={handleNativeDeckOpen} className="bg-pink-400 text-white p-1.5 rounded shadow hover:bg-pink-500 cursor-pointer flex items-center justify-center" title="Load Deck (.o8d)">
                    <Upload size={16}/>
                  </button>
                ) : (
                  <button onClick={() => setModal({ type: 'settings' })} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-1.5 rounded shadow hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center" title="Game Options"><Settings size={16}/></button>
                )}
                <button onClick={() => setModal({ type: 'token_search' })} className="bg-teal-500 text-white p-1.5 rounded shadow hover:bg-teal-600 flex items-center justify-center" title="Add Token"><PlusCircle size={16}/></button>
                <button onClick={() => setModal({ type: 'dice_menu' })} className="bg-purple-400 text-white p-1.5 rounded shadow hover:bg-purple-500 flex items-center justify-center" title="Dice & Coins"><Coins size={16}/></button>
                <button onClick={() => setModal({ type: 'library_menu' })} className="bg-blue-400 text-white p-1.5 rounded shadow hover:bg-blue-500 flex items-center justify-center" title="Library Actions"><BookOpen size={16}/></button>
                
                {/* Special Trackers Toggle Button */}
                {advancedPlay && (
                  <button 
                    onClick={() => setShowTrackers(!showTrackers)} 
                    className={`p-1.5 rounded shadow flex items-center justify-center relative cursor-pointer transition-colors ${showTrackers || monarch !== null || dayNight !== 'none' || stormCount > 0 ? 'bg-amber-500 text-white hover:bg-amber-600 ring-1 ring-amber-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'}`} 
                    title="Special Rules & Trackers (Monarch, Day/Night, Storm Count)"
                  >
                    <Crown size={16}/>
                    {(monarch !== null || dayNight !== 'none' || stormCount > 0) && (
                      <span className="w-2 h-2 rounded-full bg-amber-200 absolute -top-0.5 -right-0.5 animate-ping" />
                    )}
                  </button>
                )}

                {/* Advanced Play Controls Toggle Button */}
                <button 
                  onClick={toggleAdvancedPlay} 
                  className={`p-1.5 rounded shadow flex items-center justify-center cursor-pointer transition-colors ${advancedPlay ? 'bg-indigo-600 text-white hover:bg-indigo-500 ring-1 ring-indigo-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`} 
                  title={`Advanced Play Controls (Targeting, Attach, P/T Buff): ${advancedPlay ? 'ON' : 'OFF'}`}
                >
                  <Zap size={16} className={advancedPlay ? 'fill-yellow-300 text-yellow-300' : ''}/>
                </button>

                {!isElectron && (
                  <>
                    <div className="w-[1px] h-4 bg-pink-200 dark:bg-gray-700 mx-0.5"></div>
                    <button onClick={() => setModal({ type: 'help' })} className="bg-blue-400 text-white p-1.5 rounded shadow hover:bg-blue-500 flex items-center justify-center" title="Keybinds & Help">
                      <HelpCircle size={16} />
                    </button>
                  </>
                )}
                {activePlayerId === null && (
                  isOpeningDeal ? (
                    <button onClick={dealOpeningHand} className="bg-emerald-500 text-white p-1.5 rounded shadow hover:bg-emerald-600 flex items-center justify-center animate-pulse cursor-pointer" title="Deal Opening Hand (7 Cards) (M)"><Sparkles size={16}/></button>
                  ) : (
                    <button onClick={startLondonMulligan} className="bg-cyan-500 text-white p-1.5 rounded shadow hover:bg-cyan-600 flex items-center justify-center cursor-pointer" title="Take London Mulligan (M)"><RefreshCw size={16}/></button>
                  )
                )}
              </div>

              {/* Special Trackers Dropdown Panel */}
              {advancedPlay && showTrackers && (
                <div className="flex flex-col gap-2 border-t dark:border-gray-700 pt-2 text-xs bg-amber-50/70 dark:bg-gray-700/60 p-2 rounded-lg mt-1 border border-amber-200 dark:border-gray-600">
                  <div className="flex items-center justify-between font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase">
                    <span>Special Trackers</span>
                    <button onClick={() => setShowTrackers(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs leading-none">✕</button>
                  </div>

                  {/* Monarch */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 text-[11px]" title="The Monarch draws 1 extra card at end step. Combat damage steals the crown.">
                      <Crown size={13} className="text-amber-500" /> Monarch:
                    </span>
                    {monarch === savedId ? (
                      <button onClick={() => claimMonarch(null)} className="px-2 py-0.5 bg-gradient-to-r from-amber-400 to-yellow-500 text-white font-bold text-[10px] rounded shadow ring-1 ring-amber-300 cursor-pointer" title="You are the Monarch! Click to relinquish.">
                        👑 You (Release)
                      </button>
                    ) : monarch && players[monarch] ? (
                      <button onClick={() => claimMonarch(savedId)} className="px-2 py-0.5 bg-amber-950/70 text-amber-300 border border-amber-600 font-bold text-[10px] rounded shadow hover:bg-amber-900 cursor-pointer" title="Combat damage dealt to Monarch! Click to steal crown.">
                        {players[monarch].name} (Claim)
                      </button>
                    ) : (
                      <button onClick={() => claimMonarch(savedId)} className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-amber-100 text-gray-700 dark:text-gray-200 font-bold text-[10px] rounded shadow border border-gray-300 dark:border-gray-500 cursor-pointer" title="Claim the Crown">
                        Claim Crown
                      </button>
                    )}
                  </div>

                  {/* Day / Night */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 text-[11px]" title="Used for Innistrad Werewolves & Daybound cards.">
                      <Sun size={13} className="text-amber-500" /> Day/Night:
                    </span>
                    <button onClick={cycleDayNight} className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 font-bold text-[10px] rounded shadow border border-gray-300 dark:border-gray-500 cursor-pointer" title="Click to cycle: Day -> Night -> None">
                      {dayNight === 'day' ? (
                        <span className="text-amber-500 font-black flex items-center gap-0.5"><Sun size={11} className="fill-amber-400"/> Day</span>
                      ) : dayNight === 'night' ? (
                        <span className="text-indigo-400 font-black flex items-center gap-0.5"><Moon size={11} className="fill-indigo-300"/> Night</span>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </button>
                  </div>

                  {/* Storm Count */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 text-[11px]" title="Spells cast this turn. Resets on turn pass.">
                      <Zap size={13} className="text-yellow-500 fill-yellow-400" /> Storm:
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => socket.emit('set-storm-count', Math.max(0, stormCount - 1))} className="w-4 h-4 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 text-gray-800 dark:text-white rounded flex items-center justify-center text-[10px] font-black cursor-pointer leading-none">-</button>
                      <span className="font-black text-xs min-w-[14px] text-center text-blue-600 dark:text-blue-400">{stormCount}</span>
                      <button onClick={() => socket.emit('set-storm-count', stormCount + 1)} className="w-4 h-4 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 text-gray-800 dark:text-white rounded flex items-center justify-center text-[10px] font-black cursor-pointer leading-none">+</button>
                      {stormCount > 0 && (
                        <button onClick={() => socket.emit('set-storm-count', 0)} className="text-[9px] text-gray-400 hover:text-red-500 ml-1 font-bold">Reset</button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Action Badges when Targets or Buffs are Active */}
              {(targetArrows.length > 0 || cards.some(c => (c.controllerId ? c.controllerId === savedId : c.ownerId === savedId) && c.zone === 'battlefield' && ((c.tempPower || 0) !== 0 || (c.tempToughness || 0) !== 0))) && (
                <div className="flex flex-col gap-1 border-t dark:border-gray-700 pt-1.5 w-full">
                  {targetArrows.length > 0 && (
                    <button onClick={clearTargetArrows} className="w-full flex items-center justify-center gap-1 py-1 bg-red-500 hover:bg-red-600 text-white font-bold text-[10px] rounded shadow animate-pulse cursor-pointer">
                      <Trash2 size={11}/> Clear Targets ({targetArrows.length})
                    </button>
                  )}
                  {cards.some(c => (c.controllerId ? c.controllerId === savedId : c.ownerId === savedId) && c.zone === 'battlefield' && ((c.tempPower || 0) !== 0 || (c.tempToughness || 0) !== 0)) && (
                    <button onClick={clearTempBuffs} className="w-full flex items-center justify-center gap-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded shadow cursor-pointer" title="Reset temporary P/T modifications for Cleanup step">
                      <RefreshCw size={11}/> Clear Buffs
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-col items-center gap-1 border-t dark:border-gray-700 pt-2">
                <label className="flex items-center gap-1 text-[10px] text-gray-500 font-bold cursor-pointer" title="Do not automatically draw 1 at start of your turn"><input type="checkbox" checked={myData.disableAutoDraw || false} onChange={e => updatePlayer({ disableAutoDraw: e.target.checked })} /> Disable Auto-Draw</label>
                <label className="flex items-center gap-1 text-[10px] text-gray-500 font-bold cursor-pointer" title="Do not automatically untap permanents at start of your turn"><input type="checkbox" checked={myData.disableAutoUntap || false} onChange={e => updatePlayer({ disableAutoUntap: e.target.checked })} /> Disable Auto-Untap</label>
                <label className={`flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors ${funnyMode ? 'text-pink-600 dark:text-pink-400' : 'text-gray-400'}`} title="Play audio themes for creatures on both machines (or type /funnymode)"><input type="checkbox" checked={funnyMode} onChange={() => socket.emit('toggle-funny-mode')} /> Funny Mode (/funnymode)</label>
              </div>
            </div>
          </div>

          {(() => {
            const myBattlefieldCards = cards.filter(c => (c.controllerId ? c.controllerId === savedId : c.ownerId === savedId) && c.zone === 'battlefield');
            return myBattlefieldCards.map(card => {
              const hostCard = card.attachedTo ? cards.find(c => c.id === card.attachedTo && c.zone === 'battlefield') : null;
              let cardX = card.x;
              let cardY = card.y;
              let isAttached = false;
              if (hostCard) {
                isAttached = true;
                const attachedSiblings = cards.filter(c => c.attachedTo === hostCard.id && c.zone === 'battlefield');
                const attachIdx = attachedSiblings.findIndex(c => c.id === card.id);
                cardX = hostCard.x + (attachIdx + 1) * 22;
                cardY = hostCard.y + (attachIdx + 1) * 28;
              }

              return (
                <div 
                  id={'card-' + card.id}
                  key={card.id} draggable 
                  onDragStart={(e) => onDragStart(e, card.id)}
                  onDragEnd={() => setSelectionBox(null)}
                  onDoubleClick={() => modifyCard(card.id, (c) => ({ isTapped: !c.isTapped }))}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); addCustomCounter(card.id); }}
                  onMouseDown={(e) => {
                    if (e.button === 2) { e.stopPropagation(); return; }
                    if (!selectedCards.includes(card.id) && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                      setSelectedCards([card.id]);
                    }
                  }}
                  onClick={(e) => {
                    if (targetingSource) {
                      e.stopPropagation();
                      completeTargeting(card.id, null);
                      return;
                    }
                    if (attachingCardId) {
                      e.stopPropagation();
                      attachCard(attachingCardId, card.id);
                      return;
                    }
                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                      e.stopPropagation();
                      setSelectedCards(prev => prev.includes(card.id) ? prev.filter(c => c !== card.id) : [...prev, card.id]);
                    } else {
                      e.stopPropagation();
                      setSelectedCards([card.id]);
                    }
                  }}
                  onMouseEnter={() => {
                    handleSetHoveredCard(card);
                    setPreviewFlipped(false);
                  }} 
                  onMouseLeave={() => handleSetHoveredCard(null)}
                  className={`absolute cursor-grab active:cursor-grabbing transition-transform group hover:z-50 ${card.isTapped ? 'rotate-90' : 'hover:scale-105'} ${selectedCards.includes(card.id) ? 'ring-4 ring-blue-500 rounded' : ''} ${targetingSource ? 'ring-4 ring-yellow-400 rounded cursor-crosshair' : ''} ${attachingCardId && attachingCardId !== card.id ? 'ring-4 ring-purple-400 rounded cursor-pointer animate-pulse' : ''}`} 
                  style={{ 
                    left: `max(0px, min(${cardX}px, calc(100% - 100px)))`, 
                    top: `max(${cardX < 320 ? 210 : 0}px, min(${cardY}px, calc(100% - 140px)))`,
                    zIndex: isAttached ? 5 : (card.isTapped ? 1 : 0)
                  }}
                >
                  <img src={card.faceDown ? myCardBack : card.imageUrl} className="w-[100px] rounded shadow-lg border border-pink-200 dark:border-gray-600 pointer-events-none" />

                  {/* DFC Transform Button (Centered on top edge) */}
                  {card.backImageUrl && (
                    <button 
                      onMouseDown={e => e.stopPropagation()} 
                      onClick={(e) => { e.stopPropagation(); transformCard(card.id); }} 
                      className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 hover:bg-indigo-500 text-white w-7 h-7 rounded-full shadow-lg flex items-center justify-center z-30 border border-indigo-200 transition-transform hover:scale-110 cursor-pointer" 
                      title={`Transform / Flip Face to ${card.isTransformed ? (card.frontName || 'Front') : (card.backName || 'Back')} (Q)`}
                    >
                      <RefreshCw size={12} className={card.isTransformed ? 'rotate-180 transition-transform' : ''}/>
                    </button>
                  )}

                  {/* Attached Badge */}
                  {isAttached && (
                    <div className="absolute -top-3 left-3 bg-purple-700/95 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow z-30 flex items-center gap-1 border border-purple-300 pointer-events-auto">
                      <Paperclip size={10} /> Attached
                      <button onMouseDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); detachCard(card.id); }} className="hover:text-red-300 font-bold ml-0.5 cursor-pointer" title="Detach">✕</button>
                    </div>
                  )}

                  {/* No-Untap Badge */}
                  {card.noUntap && (
                    <div 
                      onMouseDown={e => e.stopPropagation()} 
                      onClick={(e) => { e.stopPropagation(); modifyCard(card.id, c => ({ noUntap: false })); }} 
                      className="absolute -top-3 right-3 bg-amber-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow z-30 flex items-center gap-1 border border-amber-300 pointer-events-auto cursor-pointer" 
                      title="Marked as 'Does Not Untap'. Click to remove restriction."
                    >
                      🔒 No-Untap
                    </div>
                  )}

                  {/* Temp P/T Buff Badge */}
                  {((card.tempPower || 0) !== 0 || (card.tempToughness || 0) !== 0) && (
                    <div 
                      onMouseDown={e => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setModal({ type: 'pt_modifier', cardId: card.id }); }} 
                      className={`absolute bottom-1 right-1 font-black text-[10px] px-1.5 py-0.5 rounded shadow z-20 border cursor-pointer hover:scale-105 pointer-events-auto ${
                        (card.tempPower || 0) >= 0 ? 'bg-emerald-600 border-emerald-300 text-white' : 'bg-red-600 border-red-300 text-white'
                      }`}
                      title="Temporary P/T buff until end of turn. Click to adjust or reset."
                    >
                      {(card.tempPower || 0) >= 0 ? `+${card.tempPower || 0}` : card.tempPower}/{(card.tempToughness || 0) >= 0 ? `+${card.tempToughness || 0}` : card.tempToughness}
                    </div>
                  )}

                  {card.isCompanion ? (
                    <div className="absolute top-1 left-1 bg-purple-600/90 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-none flex items-center gap-0.5 z-10 border border-purple-300">
                      Companion
                    </div>
                  ) : (!card.isCompanion && (card.isCommander || card.originalZone === 'command_zone' || (card.commanderTax || 0) > 0)) ? (
                    <div className="absolute top-1 left-1 bg-amber-600/90 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-none flex items-center gap-0.5 z-10 border border-amber-300">
                      <Shield size={10} /> {(card.commanderTax || 0) > 0 ? `Tax +${card.commanderTax}` : 'Commander'}
                    </div>
                  ) : null}
                  {card.counters !== 0 && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white font-bold px-3 py-1 rounded-full text-xl pointer-events-none">{card.counters > 0 ? `+${card.counters}` : card.counters}</div>
                  )}
                  {card.customCounters && Object.entries(card.customCounters).map(([name, amount], i) => {
                    const type = COUNTER_TYPES.find(t => t.name === name);
                    const bgClass = type ? type.color : 'bg-blue-600/90';
                    const icon = type ? type.icon + ' ' : '';
                    return (
                      <div key={name} onClick={(e) => {
                         e.stopPropagation();
                        modifyCard(card.id, (c) => {
                           const newCustom = { ...c.customCounters };
                           newCustom[name] = (newCustom[name] || 0) + 1;
                           return { customCounters: newCustom };
                         });
                      }} onContextMenu={(e) => {
                         e.preventDefault(); e.stopPropagation();
                        modifyCard(card.id, (c) => {
                           const newCustom = { ...c.customCounters };
                           newCustom[name] -= 1;
                           if (newCustom[name] <= 0) delete newCustom[name];
                           return { customCounters: newCustom };
                         });
                      }} className={`absolute left-1/2 -translate-x-1/2 ${bgClass} text-white font-bold px-2 py-0.5 rounded text-xs pointer-events-auto whitespace-nowrap shadow cursor-pointer hover:brightness-125 z-30`} style={{ top: `calc(50% + ${20 + i*20}px)` }} title="Left-click: +1, Right-click: -1">
                        {icon}{amount > 1 ? `${amount} ` : ''}{name}
                      </div>
                    );
                  })}
                  
                  {/* Left Hover Action Controls (Advanced Actions when enabled) */}
                  {advancedPlay && (
                    <div className="absolute top-1/2 -translate-y-1/2 -left-3.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); startTargeting(card.id, 'Attacks'); }} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold shadow-lg hover:scale-110 flex items-center justify-center cursor-pointer" title="Attack Target / Player (A)"><Swords size={12}/></button>
                      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); startTargeting(card.id, 'Targets'); }} className="bg-blue-500 hover:bg-blue-600 text-white w-7 h-7 rounded-full font-bold shadow-lg hover:scale-110 flex items-center justify-center cursor-pointer" title="Target with Spell/Ability (X)"><Crosshair size={12}/></button>
                      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); startAttaching(card.id); }} className="bg-purple-600 hover:bg-purple-700 text-white w-7 h-7 rounded-full font-bold shadow-lg hover:scale-110 flex items-center justify-center cursor-pointer" title="Attach to Creature (E)"><Paperclip size={12}/></button>
                      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setModal({ type: 'pt_modifier', cardId: card.id }); }} className="bg-emerald-600 hover:bg-emerald-700 text-white w-7 h-7 rounded-full font-bold shadow-lg hover:scale-110 flex items-center justify-center text-[9px] cursor-pointer" title="Temp P/T Buff (+X/+Y)">P/T</button>
                    </div>
                  )}

                  {/* Right Hover Action Controls (Counters, Duplicate, Delete) */}
                  <div className="absolute top-1/2 -translate-y-1/2 -right-3.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); modifyCard(card.id, (c) => ({ counters: (c.counters || 0) + 1 })); }} className="bg-green-500 hover:bg-green-600 text-white w-7 h-7 rounded-full font-black shadow-lg hover:scale-110 flex items-center justify-center cursor-pointer text-sm" title="Add +1 Counter">+</button>
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); modifyCard(card.id, (c) => ({ counters: Math.max(0, (c.counters || 0) - 1) })); }} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-black shadow-lg hover:scale-110 flex items-center justify-center cursor-pointer text-sm" title="Remove +1 Counter">-</button>
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addCustomCounter(card.id); }} className="bg-amber-500 hover:bg-amber-600 text-white w-7 h-7 rounded-full font-bold shadow-lg hover:scale-110 flex items-center justify-center cursor-pointer text-xs" title="Add Custom Counter">★</button>
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); duplicateCard(card.id); }} className="bg-sky-500 hover:bg-sky-600 text-white w-7 h-7 rounded-full font-bold shadow-lg hover:scale-110 flex items-center justify-center cursor-pointer" title="Duplicate"><Copy size={12}/></button>
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }} className="bg-gray-500 hover:bg-gray-600 text-white w-7 h-7 rounded-full font-bold shadow-lg hover:scale-110 flex items-center justify-center cursor-pointer" title="Delete"><Trash2 size={12}/></button>
                  </div>
                </div>
              );
            });
          })()}

          <div className="absolute bottom-4 right-4 z-50 flex items-center gap-2">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                untapAll(); 
              }} 
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-3 px-4 rounded-full shadow-xl font-bold text-sm flex gap-1.5 items-center border-2 border-emerald-400 cursor-pointer"
              title="Untap all your permanents (U)"
            >
              <RefreshCw size={15}/> Untap All (U)
            </button>
            {activePlayerId === savedId ? (
              <button onClick={(e) => { 
                e.stopPropagation();
                logAction(`\n\n------------------------\nPASSES THE TURN\n------------------------\n\n`); 
                socket.emit('pass-turn', savedId);
              }} className="bg-blue-500 text-white p-3 px-6 rounded-full shadow-xl hover:bg-blue-600 font-bold text-lg flex gap-2 items-center animate-pulse border-4 border-blue-300 cursor-pointer"><ChevronRight size={24}/> End Turn</button>
            ) : activePlayerId === null ? (
              <button onClick={(e) => { 
                e.stopPropagation();
                logAction(`takes the first turn!`); 
                socket.emit('take-turn', savedId);
              }} className="bg-blue-500 text-white p-3 px-6 rounded-full shadow-xl hover:bg-blue-600 font-bold text-lg flex gap-2 items-center border-4 border-blue-300 cursor-pointer"><ChevronRight size={24}/> Take Turn</button>
            ) : null}
          </div>

        </div>

        {/* My UI Bottom Bar */}
        <div className="h-56 bg-pink-100/50 dark:bg-gray-800 border-t border-pink-300 dark:border-gray-700 flex p-3 gap-3 overflow-x-auto relative z-10 custom-scrollbar">
          


          <div className="w-24 min-w-[6rem] bg-pink-200 dark:bg-gray-700 rounded-xl shadow flex flex-col items-center justify-center cursor-pointer hover:bg-pink-300 dark:hover:bg-gray-600 transition-colors relative group" onContextMenu={(e) => { e.preventDefault(); setModal({ type: 'library_menu' }); }} onDragOver={e => e.preventDefault()} onDrop={onDropLibrary} draggable={cards.filter(c => c.ownerId === savedId && c.zone === 'library').length > 0} onDragStart={(e) => {
            const myLibrary = cards.filter(c => c.ownerId === savedId && c.zone === 'library').sort((a,b) => a.order - b.order);
            if (myLibrary.length > 0) {
              onDragStart(e, myLibrary[myLibrary.length - 1].id);
            }
          }}>
            <Layers className="text-pink-500 dark:text-gray-300 mb-1" size={28} />
            <span className="font-bold text-pink-700 dark:text-gray-200 text-sm">Library</span>
            <span className="text-xs dark:text-gray-400">{cards.filter(c => c.ownerId === savedId && c.zone === 'library').length}</span>
            <button onClick={(e) => { e.stopPropagation(); logAction(`is looking through their library.`); setModal({type: 'explore', zone: 'library', ownerId: savedId}); }} className="absolute top-1 right-1 bg-pink-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 z-20 shadow hover:bg-pink-500" title="Search Library"><Eye size={12}/></button>
            <button onClick={(e) => { e.stopPropagation(); startScry(1); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setModal({ type: 'prompt_scry' }); }} className="absolute bottom-8 left-1 right-1 bg-blue-500 text-white text-[10px] py-1 rounded shadow hover:bg-blue-600 z-20 uppercase font-bold" title="Left-click: Scry 1. Right-click: Scry X">Scry</button>
            <button onClick={(e) => { e.stopPropagation(); shuffleLibrary(); }} className="absolute bottom-1 left-1 right-1 bg-indigo-500 text-white text-[10px] py-1 rounded shadow hover:bg-indigo-600 z-20 flex items-center justify-center gap-1 uppercase font-bold"><Shuffle size={10}/> Shuffle</button>
            {cards.filter(c => c.ownerId === savedId && c.zone === 'library').length > 0 && <img src={myCardBack} className="absolute inset-0 w-full h-full object-cover rounded-xl shadow opacity-80 pointer-events-none z-10" />}
          </div>

          <div className="flex-1 bg-white/50 dark:bg-gray-900/50 rounded-xl shadow-inner p-2 flex flex-col min-w-[200px]" onDragOver={e => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const ids = getDragCardIds(e); moveCards(ids, 'hand'); }}>
            <div className="flex items-center justify-between px-2 pb-1 border-b border-pink-200/50 dark:border-gray-700 text-xs shrink-0">
              <span className="font-bold text-gray-500 dark:text-gray-400">
                Hand ({cards.filter(c => c.ownerId === savedId && c.zone === 'hand').length})
              </span>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={toggleRevealHand}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 shadow-sm transition-colors ${
                    myData.revealedHand 
                      ? 'bg-emerald-500 text-white animate-pulse' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                  title={myData.revealedHand ? "Hand is currently revealed to opponents. Click to hide (H)" : "Reveal entire hand to all players (H)"}
                >
                  {myData.revealedHand ? <><EyeOff size={12}/> Hand Revealed</> : <><Eye size={12}/> Reveal Hand</>}
                </button>
                <button 
                  onClick={discardRandomCard}
                  className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 flex items-center gap-1 shadow-sm"
                  title="Discard a random card from your hand"
                >
                  <Shuffle size={12}/> Discard Random
                </button>
                {isOpeningDeal ? (
                  <button 
                    onClick={dealOpeningHand}
                    className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1 shadow-sm animate-pulse cursor-pointer"
                    title="Shuffle library and deal opening hand of 7 cards (Rule 103.4) (M)"
                  >
                    <Sparkles size={12}/> Deal 7 (M)
                  </button>
                ) : (
                  <button 
                    onClick={startLondonMulligan}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-200 hover:bg-cyan-200 dark:hover:bg-cyan-800 flex items-center gap-1 shadow-sm cursor-pointer"
                    title="Take a London Mulligan (Rule 103.4) (M)"
                  >
                    <RefreshCw size={12}/> Mulligan
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 flex gap-2 overflow-x-auto overflow-y-hidden items-center pt-1 custom-scrollbar">
              {cards.filter(c => c.ownerId === savedId && c.zone === 'hand').map(c => renderZoneCard(c))}
              {cards.filter(c => c.ownerId === savedId && c.zone === 'hand').length === 0 && <span className="text-pink-300 dark:text-gray-500 font-bold mx-auto">Hand empty</span>}
            </div>
          </div>

          <div className="w-24 min-w-[6rem] bg-gray-200 dark:bg-gray-800 rounded-xl shadow flex flex-col items-center justify-center border-2 border-dashed border-gray-400 relative group shrink-0" onDragOver={e => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const ids = getDragCardIds(e); moveCards(ids, 'graveyard'); }}>
            <Skull className="text-gray-500 mb-1" size={24} />
            <span className="font-bold text-gray-600 dark:text-gray-400 text-xs">Grave</span>
            <span className="text-xs dark:text-gray-500">{myGraveCards.length}</span>
            <button onClick={() => { logAction(`is looking through their graveyard.`); setModal({type: 'explore', zone: 'graveyard', ownerId: savedId}); }} className="absolute top-1 right-1 bg-gray-700 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 z-20 shadow hover:bg-gray-600"><Eye size={12}/></button>
            {myGraveCards.length > 0 && (() => {
              const topGrave = myGraveCards[myGraveCards.length - 1];
              return (
                <img draggable onDragStart={(e) => onDragStart(e, topGrave.id)} onMouseEnter={() => handleSetHoveredCard(topGrave)} onMouseLeave={() => handleSetHoveredCard(null)} src={topGrave.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-80 cursor-grab z-10" />
              );
            })()}
          </div>

          <div className="w-24 min-w-[6rem] bg-slate-200 dark:bg-slate-800 rounded-xl shadow flex flex-col items-center justify-center border-2 border-slate-400 relative group shrink-0" onDragOver={e => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const ids = getDragCardIds(e); moveCards(ids, 'exile'); }}>
            <SunIcon className="text-slate-500 mb-1" size={24} />
            <span className="font-bold text-slate-600 dark:text-slate-400 text-xs">Exile</span>
            <span className="text-xs dark:text-slate-500">{myExileCards.length}</span>
            <button onClick={() => setModal({type: 'explore', zone: 'exile', ownerId: savedId})} className="absolute top-1 right-1 bg-slate-700 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 z-20 shadow hover:bg-slate-600"><Eye size={12}/></button>
            {myExileCards.length > 0 && (() => {
              const topExile = myExileCards[myExileCards.length - 1];
              return (
                <img draggable onDragStart={(e) => onDragStart(e, topExile.id)} onMouseEnter={() => handleSetHoveredCard(topExile)} onMouseLeave={() => handleSetHoveredCard(null)} src={topExile.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-80 grayscale cursor-grab z-10" />
              );
            })()}
          </div>

          <div className="w-24 min-w-[6rem] bg-indigo-100 dark:bg-indigo-900/40 rounded-xl shadow flex flex-col items-center justify-center border-2 border-dashed border-indigo-400 relative group shrink-0" onDragOver={e => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const ids = getDragCardIds(e); moveCards(ids, 'sideboard'); }}>
            <Layers className="text-indigo-500 mb-1" size={24} />
            <span className="font-bold text-indigo-600 dark:text-indigo-400 text-xs">Sideboard</span>
            <span className="text-xs dark:text-indigo-500">{cards.filter(c => c.ownerId === savedId && c.zone === 'sideboard').length}</span>
            <button onClick={() => setModal({type: 'explore', zone: 'sideboard', ownerId: savedId})} className="absolute top-1 right-1 bg-indigo-700 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 z-20 shadow hover:bg-indigo-600"><Eye size={12}/></button>
            {cards.filter(c => c.ownerId === savedId && c.zone === 'sideboard').length > 0 && (
              <img draggable onDragStart={(e) => onDragStart(e, cards.filter(c => c.ownerId === savedId && c.zone === 'sideboard').pop().id)} onMouseEnter={() => handleSetHoveredCard(cards.filter(c => c.ownerId === savedId && c.zone === 'sideboard').slice(-1)[0])} onMouseLeave={() => handleSetHoveredCard(null)} src={cards.filter(c => c.ownerId === savedId && c.zone === 'sideboard').pop().imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-80 cursor-grab z-10" />
            )}
          </div>

          <div className="min-w-[130px] bg-amber-100 dark:bg-amber-900/40 rounded-xl shadow flex flex-col items-center p-2 border border-amber-200 shrink-0" onDragOver={e => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const ids = getDragCardIds(e); moveCards(ids, 'command_zone'); }}>
            <span className="font-bold text-amber-700 dark:text-amber-500 text-[11px] text-center mb-1 flex items-center justify-center gap-1 shrink-0"><Shield size={13}/> Command ({cards.filter(c => c.ownerId === savedId && c.zone === 'command_zone').length})</span>
            <div className="flex-1 flex flex-row gap-2 overflow-x-auto overflow-y-hidden w-full items-center justify-center px-1 custom-scrollbar">
              {cards.filter(c => c.ownerId === savedId && c.zone === 'command_zone').map(c => renderZoneCard(c))}
              {cards.filter(c => c.ownerId === savedId && c.zone === 'command_zone').length === 0 && (
                <span className="text-amber-700/60 dark:text-amber-400/60 text-[10px] font-bold text-center my-auto">Drop Here</span>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Game Log Sidebar */}
      <div className="w-64 border-l-4 border-pink-300 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 flex flex-col z-50 shadow-2xl">
        <div className="p-3 border-b border-pink-200 dark:border-gray-600 flex justify-between items-center font-bold text-pink-600 dark:text-pink-400">
          <div className="flex items-center gap-2"><MessageSquare size={20} /> Game Log</div>
          <button onClick={() => { setLogs([]); socket.emit('clear-logs'); }} className="text-[10px] bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded shadow cursor-pointer">Clear</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 text-sm">
          {logs.map((log) => (
            <div key={log.id} className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
              <span className="opacity-50 text-xs">»</span> {log.text}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
        <form onSubmit={handleChat} className="p-2 border-t border-pink-200 dark:border-gray-600 flex gap-2 bg-white dark:bg-gray-800">
          <input 
            type="text" 
            value={chatInput} 
            onChange={e => setChatInput(e.target.value)} 
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); e.currentTarget.focus(); }}
            onFocus={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(true);
                }}
                onBlur={() => {
                  window.electronAPI?.setIgnoreMenuShortcuts(false);
                }}
            className="flex-1 p-1 px-2 border border-pink-200 rounded-full text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:border-pink-400" 
            placeholder="Chat or /command..." 
          />
        </form>
      </div>

      {isSolitaire && <SolitaireAnimation cards={cards} onComplete={() => setIsSolitaire(false)} />}
      
            {isHeadpatted && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-tr from-pink-400 via-purple-400 to-cyan-400 opacity-40 mix-blend-screen animate-pulse"></div>
          <div className="text-6xl md:text-8xl flex gap-10 mb-8 animate-bounce">
            <span>💖</span><span>🐶</span><span>🐾</span><span>🌈</span><span>💖</span>
          </div>
          <div className="text-pink-500 font-extrabold text-7xl md:text-9xl drop-shadow-[0_10px_10px_rgba(0,0,0,0.8)] animate-bounce" style={{ textShadow: "0px 0px 20px #fff, 0px 0px 30px #ff69b4" }}>
            GOOD GIRL!
          </div>
          <div className="text-6xl md:text-8xl flex gap-10 mt-8 animate-bounce" style={{ animationDelay: '0.2s' }}>
            <span>🌈</span><span>🐾</span><span>🐶</span><span>💖</span><span>🌈</span>
          </div>
        </div>
      )}
      {isGay && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none transition-opacity duration-1000">
          <div className="absolute inset-0 opacity-80" style={{ background: 'linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet, red)', backgroundSize: '200% 200%', animation: 'pulse 1s infinite' }}></div>
          <h1 className="text-8xl font-black drop-shadow-2xl animate-bounce z-10" style={{ 
            backgroundImage: 'linear-gradient(to right, violet, indigo, blue, green, yellow, orange, red)',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            WebkitTextStroke: '2px white'
          }}>UR GAY! 🏳️‍🌈</h1>
        </div>
      )}
      {/* In-app Confirmation & Alert Dialog (Eliminates native dialogs & Electron focus drops) */}
      {confirmDialog && (
        <div 
          className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 backdrop-blur-[1px]"
          onClick={(e) => {
            if (e.target === e.currentTarget && !confirmDialog.isAlert) {
              confirmDialog.onCancel();
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl flex flex-col gap-4 border-2 border-pink-400 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              {confirmDialog.title || "Confirm Action"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex justify-end gap-3 mt-2">
              {!confirmDialog.isAlert && (
                <button
                  type="button"
                  onClick={confirmDialog.onCancel}
                  className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold text-sm text-gray-800 dark:text-gray-200 cursor-pointer"
                >
                  {confirmDialog.cancelText || "Cancel"}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={confirmDialog.onConfirm}
                className="px-5 py-2 rounded-lg bg-pink-500 hover:bg-pink-600 font-bold text-sm text-white shadow cursor-pointer focus:ring-2 focus:ring-pink-400"
              >
                {confirmDialog.confirmText || "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
