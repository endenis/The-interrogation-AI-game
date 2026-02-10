import React, { useState, useEffect } from 'react';

interface TypewriterProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
}

const Typewriter: React.FC<TypewriterProps> = ({ text, speed = 30, onComplete, className }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    // Reset immediately when text changes
    setDisplayedText('');
    
    if (!text) return;

    let currentIndex = 0;
    
    const intervalId = setInterval(() => {
      currentIndex++;
      // Using slice ensures the displayed text is always a valid substring 
      // from the start, preventing state accumulator race conditions.
      setDisplayedText(text.slice(0, currentIndex));

      if (currentIndex >= text.length) {
        clearInterval(intervalId);
        if (onComplete) onComplete();
      }
    }, speed);

    return () => clearInterval(intervalId);
  }, [text, speed, onComplete]);

  return <p className={className}>{displayedText}</p>;
};

export default Typewriter;