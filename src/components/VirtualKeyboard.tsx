import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Delete, ArrowBigUp, Smile, Send } from 'lucide-react';

interface VirtualKeyboardProps {
  onInput: (char: string) => void;
  onBackspace: () => void;
  onSend: () => void;
  onClose: () => void;
  isOpen: boolean;
}

type KeyboardMode = 'letters' | 'symbols' | 'altSymbols' | 'emojis';

const EMOJIS = [
  // Faces & Emotions
  '😊', '🥰', '😘', '🥺', '🤩', '🥳', '😇', '😜', '🤭', '😴',
  '😂', '🤣', '😅', '🫠', '😋', '😎', '🤤', '🥵', '🥶', '🧐',
  '🤫', '🫡', '🤔', '🫣', '😭', '🤯', '😡', '🤬', '😵‍💫', '😮‍💨',
  '🤢', '🤮', '🤡', '💩', '👻', '💀', '👽', '👾', '🤖', '🫂',
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '🥲', '☺️', '😊',
  '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙',
  '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎',
  '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁',
  '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮‍💨', '😤',
  '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰',
  '😥', '😓', '🫣', '🤗', '🫡', '🤔', '🫢', '🤭', '🤫', '🤥',
  '😶', '😶‍🌫️', '😐', '😑', '😬', '🫠', '🙄', '😯', '😦', '😧',
  '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '😵‍💫', '🫥', '🤐',
  '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
  '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾',
  '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
  '😾', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️',
  '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇',
  '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐',
  '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿',
  '🦶', '👣', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴',
  '👀', '👁️', '👅', '👄', '🫦', '💋', '🩸',
  // Hearts & Love
  '❤️', '💖', '💗', '💓', '💕', '✨', '🌸', '🎀', '🧸', '🍭',
  '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '❣️', '💔',
  '💘', '💝', '💢', '💥', '💫', '💨', '💌', '💍', '💄', '💤',
  // Animals & Nature
  '🐱', '🐰', '🐼', '🐹', '🐧', '🐶', '🦁', '🦊', '🦄', '🐝',
  '🦋', '🐳', '🐬', '🐾', '🍀', '🌞', '🌈', '⭐', '🌙', '☁️',
  '🐥', '🐦', '🦅', '🦉', '🦖', '🐢', '🐈', '🐕', '🐎', '🦓',
  '🐘', '🦒', '🐪', '🐒', '🦦', '🦭', '🌹', '🌻', '🌼', '🌷',
  '🌱', '🌿', '🍂', '🍃', '🌵', '🌴', '🌊', '❄️', '🔥', '🌍',
  // Food & Drink
  '🍦', '🍰', '🧁', '🍓', '🍑', '🍇', '🍉', '🍋', '🍌', '🍍',
  '🥭', '🍎', '🍐', '🍒', '🥑', '🥦', '🌽', '🍕', '🍔', '🍟',
  '🌭', '🌮', '🍱', '🍣', '🍙', '🍛', '🍜', '🍝', '🍲', '🍢',
  '🥟', '🍧', '🍩', '🍪', '🍫', '🍮', '🍯', '🍼', '☕', '🍵',
  '🥤', '🍻', '🍷', '🍹', '🍺', '🥨', '🥐', '🍞', '🥞', '🍳',
  // Activities & Objects
  '🎨', '🎮', '📸', '🎵', '💌', '💎', '⚽', '🏀', '🏈', '⚾',
  '🎾', '🏐', '🏸', '🏒', '🥊', '🛹', '🚲', '🏎️', '⛳', '🎯',
  '🎻', '🎸', '🎹', '🎷', '🎺', '🎤', '🎧', '🎬', '🎭', '🎫',
  '🧸', '📚', '🖍️', '📍', '💡', '🔋', '📱', '💻', '⏰', '⌛',
  // Travel & Places
  '✈️', '⛵', '🚀', '🛸', '🛰️', '🏠', '🌆', '🎡', '🎢', '🏖️',
  '🌋', '🕋', '⛩️', '🏰', '🗼', '🏔️', '🚂', '🚁', '🚜', '🛣️',
  '🗽', '🗾', '🏢', '🏦', '🏨', '🏪', '🏫', '🏥', '⛪', '🕌',
  // Objects & Tech
  '🧸', '📚', '🖍️', '📍', '💡', '🔋', '📱', '💻', '⏰', '⌛',
  '⌚', '📷', '📹', '📻', '🎙️', '🔦', '🔑', '🔨', '⚒️', '🔩',
  '🔫', '💣', '🛡️', '⚔️', '⚖️', '⛓️', '🧰', '🧱', '🧪', '🔭',
  // Flags & more
  '🇮🇩', '🇺🇸', '🇯🇵', '🇰🇷', '🇬🇧', '🇫🇷', '🇩🇪', '🏴‍☠️', '🚩', '🏁',
  '🏳️‍🌈', '🏳️‍⚧️', '⚧️', '🔞', '🆘', '🛑', '⛔', '🚫', '⚠️', '♨️'
];

export const VirtualKeyboard = memo(function VirtualKeyboard({ onInput, onBackspace, onSend, onClose, isOpen }: VirtualKeyboardProps) {
  const [mode, setMode] = useState<KeyboardMode>('letters');

  useEffect(() => {
    if (isOpen) {
      setMode('letters');
    }
  }, [isOpen]);

  const [isCaps, setIsCaps] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const lastShiftTapRef = useRef<number>(0);
  const lastSpaceTapRef = useRef<number>(0);
  const backspaceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const backspaceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const rows = {
    letters: [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACKSPACE']
    ],
    symbols: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
      ['#+=', '.', ',', '?', '!', "'", 'BACKSPACE']
    ],
    altSymbols: [
      ['[', ']', '{', '}', '#', '%', '^', '*', '+', '='],
      ['_', '\\', '|', '~', '<', '>', '€', '£', '¥', '•'],
      ['123', '.', ',', '?', '!', "'", 'BACKSPACE']
    ]
  };

  const startBackspace = () => {
    stopBackspace();
    onBackspace();
    backspaceTimeoutRef.current = setTimeout(() => {
      backspaceIntervalRef.current = setInterval(() => {
        onBackspace();
      }, 50); // Faster repeat
    }, 250); // Shorter initial delay
  };

  const stopBackspace = () => {
    if (backspaceTimeoutRef.current) {
      clearTimeout(backspaceTimeoutRef.current);
      backspaceTimeoutRef.current = null;
    }
    if (backspaceIntervalRef.current) {
      clearInterval(backspaceIntervalRef.current);
      backspaceIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopBackspace();
  }, []);

  const handleKeyInteraction = (key: string, isStart: boolean, e?: ReactMouseEvent | ReactTouchEvent) => {
    if (e && e.cancelable) e.preventDefault();

    if (isStart) {
      activeKeyRef.current = key;

      if (key === 'BACKSPACE') {
        startBackspace();
      } else if (key === 'SHIFT') {
        const now = Date.now();
        if (now - lastShiftTapRef.current < 300) {
          const newLocked = !isLocked;
          setIsLocked(newLocked);
          setIsCaps(newLocked);
        } else {
          if (isLocked) {
            setIsLocked(false);
            setIsCaps(false);
          } else {
            setIsCaps(prev => !prev);
          }
        }
        lastShiftTapRef.current = now;
      } else if (key === '#+=') {
        setMode('altSymbols');
      } else if (key === '123') {
        setMode('symbols');
      } else if (key === ' ') {
        const now = Date.now();
        if (now - lastSpaceTapRef.current < 300) {
          onBackspace();
          onInput('. ');
          lastSpaceTapRef.current = 0;
        } else {
          onInput(' ');
          lastSpaceTapRef.current = now;
        }
        if (isCaps && !isLocked) setIsCaps(false);
      } else {
        const displayChar = (isCaps || isLocked) ? key.toUpperCase() : key;
        setPressedKey(displayChar);
        onInput(displayChar);
        if (isCaps && !isLocked) setIsCaps(false);
      }
    } else {
      if (key === 'BACKSPACE') {
        stopBackspace();
      }
      if (activeKeyRef.current === key) {
        activeKeyRef.current = null;
      }
      setPressedKey(prev => prev === (isCaps || isLocked ? key.toUpperCase() : key) ? null : prev);
    }
  };

  const renderKey = (key: string) => {
    if (key === 'SHIFT') {
      return (
        <button
          key="shift"
          onMouseDown={(e) => handleKeyInteraction(key, true, e)}
          onMouseUp={(e) => handleKeyInteraction(key, false, e)}
          onTouchStart={(e) => handleKeyInteraction(key, true, e)}
          onTouchEnd={(e) => handleKeyInteraction(key, false, e)}
          className={`flex-1 h-13 flex items-center justify-center rounded-lg shadow-sm active:opacity-50 touch-action-none select-none ${
            (isCaps || isLocked) ? 'bg-pink-deep text-white' : 'bg-pink-soft text-pink-deep'
          }`}
        >
          <div className="relative">
            <ArrowBigUp className={`w-5 h-5 ${(isCaps || isLocked) ? 'fill-white' : ''}`} />
            {isLocked && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />}
          </div>
        </button>
      );
    }

    if (key === 'BACKSPACE') {
      return (
        <button
          key="backspace"
          onMouseDown={(e) => handleKeyInteraction(key, true, e)}
          onMouseUp={(e) => handleKeyInteraction(key, false, e)}
          onMouseLeave={(e) => handleKeyInteraction(key, false, e)}
          onTouchStart={(e) => handleKeyInteraction(key, true, e)}
          onTouchEnd={(e) => handleKeyInteraction(key, false, e)}
          className="flex-1 h-13 flex items-center justify-center rounded-lg bg-pink-soft text-pink-deep shadow-sm active:opacity-50 font-medium touch-action-none select-none"
        >
          <Delete className="w-5 h-5" />
        </button>
      );
    }

    if (key === '#+=' || key === '123') {
      return (
        <button
          key={key}
          onMouseDown={(e) => handleKeyInteraction(key, true, e)}
          onMouseUp={(e) => handleKeyInteraction(key, false, e)}
          onTouchStart={(e) => handleKeyInteraction(key, true, e)}
          onTouchEnd={(e) => handleKeyInteraction(key, false, e)}
          className="flex-1 h-13 flex items-center justify-center rounded-lg bg-pink-soft text-pink-deep shadow-sm active:opacity-50 transition-all font-bold text-sm touch-action-none select-none"
        >
          {key}
        </button>
      );
    }

    const displayChar = (isCaps || isLocked) ? key.toUpperCase() : key;

    return (
      <div key={key} className="flex-1 relative select-none">
        {pressedKey === displayChar && (
          <div className="absolute left-1/2 -translate-x-1/2 w-12 h-16 bg-white border-2 border-pink-soft rounded-t-2xl shadow-xl flex items-center justify-center pointer-events-none z-50 overflow-visible -top-[55px] scale-125">
            <div className="relative mb-4">
              <span className="text-2xl font-bold text-pink-deep">{displayChar}</span>
            </div>
            <div className="absolute bottom-[-2px] left-0 right-0 h-4 bg-white" />
          </div>
        )}
        <button
          onMouseDown={(e) => handleKeyInteraction(key, true, e)}
          onMouseUp={(e) => handleKeyInteraction(key, false, e)}
          onTouchStart={(e) => handleKeyInteraction(key, true, e)}
          onTouchEnd={(e) => handleKeyInteraction(key, false, e)}
          className="w-full h-13 flex items-center justify-center rounded-lg bg-white text-pink-deep font-semibold text-lg shadow-sm active:bg-pink-soft touch-action-none select-none font-sans"
        >
          {displayChar}
        </button>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ 
            duration: 0.3,
            ease: [0.4, 0, 0.2, 1]
          }}
          className="bg-[#FFE4E9] border-t border-pink-medium select-none overflow-hidden shadow-[0_-10px_30px_rgba(0,0,0,0.08)]"
        >
          <div className="p-1 pb-20 sm:pb-12 space-y-2 overflow-visible" onContextMenu={(e) => e.preventDefault()}>
            <div className="space-y-2">
              {mode === 'letters' && (
                <>
                  <div className="flex gap-1 h-13">
                    {rows.letters[0].map(char => renderKey(char))}
                  </div>
                  <div className="flex gap-1 px-3 h-13">
                    {rows.letters[1].map(char => renderKey(char))}
                  </div>
                  <div className="flex gap-1 h-13">
                    {rows.letters[2].map(char => renderKey(char))}
                  </div>
                </>
              )}

              {mode === 'symbols' && (
                <>
                  <div className="flex gap-1 h-13">
                    {rows.symbols[0].map(char => renderKey(char))}
                  </div>
                  <div className="flex gap-1 h-13">
                    {rows.symbols[1].map(char => renderKey(char))}
                  </div>
                  <div className="flex gap-1 h-13">
                    {rows.symbols[2].map(char => renderKey(char))}
                  </div>
                </>
              )}

              {mode === 'altSymbols' && (
                <>
                  <div className="flex gap-1 h-13">
                    {rows.altSymbols[0].map(char => renderKey(char))}
                  </div>
                  <div className="flex gap-1 h-13">
                    {rows.altSymbols[1].map(char => renderKey(char))}
                  </div>
                  <div className="flex gap-1 h-13">
                    {rows.altSymbols[2].map(char => renderKey(char))}
                  </div>
                </>
              )}

              {mode === 'emojis' && (
                <div className="h-[210px] overflow-y-auto px-1 custom-scrollbar">
                  <div className="grid grid-cols-8 gap-x-1 gap-y-3 py-2">
                    {EMOJIS.map((emoji, index) => (
                      <button
                        key={`${emoji}-${index}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onInput(emoji);
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          onInput(emoji);
                        }}
                        className="aspect-square flex items-center justify-center text-2xl active:scale-125 transition-transform touch-action-none"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-1 h-13">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setMode(mode === 'letters' ? 'symbols' : 'letters');
                }}
                className="flex-[1.5] bg-pink-soft rounded-lg text-pink-deep text-xs font-bold shadow-sm active:opacity-50"
              >
                {mode === 'letters' ? '123' : 'ABC'}
              </button>
              
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setMode(mode === 'emojis' ? 'letters' : 'emojis');
                }}
                className="flex-[1.2] bg-pink-soft rounded-lg flex items-center justify-center shadow-sm active:opacity-50"
              >
                <Smile className="w-6 h-6 text-pink-deep" />
              </button>

              <button
                type="button"
                onMouseDown={(e) => handleKeyInteraction(' ', true, e)}
                onMouseUp={(e) => handleKeyInteraction(' ', false, e)}
                onTouchStart={(e) => handleKeyInteraction(' ', true, e)}
                onTouchEnd={(e) => handleKeyInteraction(' ', false, e)}
                className="flex-[5.2] bg-white rounded-lg text-pink-deep text-sm font-medium shadow-sm active:bg-pink-soft touch-action-none select-none"
              >
                space
              </button>

              <div className="flex-[1.8] flex gap-1">
                {mode === 'emojis' && renderKey('BACKSPACE')}
                <button
                  type="button"
                  onClick={() => {
                    onSend();
                  }}
                  className="flex-1 bg-pink-deep text-white rounded-lg flex items-center justify-center shadow-sm active:opacity-80"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
