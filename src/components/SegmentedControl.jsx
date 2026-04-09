// src/components/SegmentedControl.jsx
import React, { useRef, useState, useLayoutEffect } from 'react';

const SegmentedControl = ({ options, value, onChange, disabledValue }) => {
  const containerRef = useRef(null);
  const [pillStyle, setPillStyle] = useState({});

  // Compute the liquid sliding pill position
  useLayoutEffect(() => {
    if (!containerRef.current || !value) {
      setPillStyle({ opacity: 0 });
      return;
    }
    const container = containerRef.current;
    const idx = options.findIndex(o => o.value === value);
    if (idx < 0) {
      setPillStyle({ opacity: 0 });
      return;
    }
    const child = container.children[idx + 1]; // +1 because first child is the pill itself
    if (!child) return;

    setPillStyle({
      opacity: 1,
      width: child.offsetWidth,
      height: child.offsetHeight,
      transform: `translateX(${child.offsetLeft}px)`,
    });
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        background: 'rgba(255, 255, 255, 0.06)',
        borderRadius: '14px',
        padding: '3px',
        gap: '3px',
        flexWrap: 'wrap',
        position: 'relative',
        isolation: 'isolate',
      }}
    >
      {/* Liquid sliding pill */}
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: 0,
          borderRadius: '11px',
          background: 'rgba(255, 255, 255, 0.14)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow:
            '0 1px 4px rgba(0,0,0,0.18), 0 0.5px 1px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.12)',
          zIndex: 0,
          pointerEvents: 'none',
          transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          ...pillStyle,
        }}
      />
      {options.map(opt => {
        const isSelected = value === opt.value;
        const isDisabled = disabledValue && disabledValue === opt.value;
        return (
          <div
            key={opt.value}
            onClick={() => !isDisabled && onChange(opt.value)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '9px 6px',
              borderRadius: '11px',
              fontSize: '0.84rem',
              fontWeight: isSelected ? '600' : '500',
              fontFamily: 'var(--font-family)',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              minWidth: '56px',
              position: 'relative',
              zIndex: 1,

              /* No background here — the liquid pill handles it */
              background: 'transparent',
              color: isSelected
                ? 'var(--text-primary)'
                : isDisabled
                  ? 'var(--text-tertiary)'
                  : 'var(--text-secondary)',

              transition: 'color 0.3s cubic-bezier(0.16, 1, 0.3, 1), font-weight 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              letterSpacing: '-0.01em',
            }}
          >
            {opt.label}
          </div>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
