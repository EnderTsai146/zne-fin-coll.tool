// src/components/SegmentedControl.jsx
import React from 'react';

const SegmentedControl = ({ options, value, onChange, disabledValue }) => (
  <div style={{
    display: 'flex',
    background: 'rgba(120, 120, 128, 0.08)',
    borderRadius: '14px',
    padding: '3px',
    gap: '3px',
    flexWrap: 'wrap',
    position: 'relative'
  }}>
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

            /* Glass Raised Effect for selected */
            background: isSelected
              ? 'rgba(255, 255, 255, 0.75)'
              : 'transparent',
            backdropFilter: isSelected ? 'blur(8px)' : 'none',
            WebkitBackdropFilter: isSelected ? 'blur(8px)' : 'none',
            color: isSelected
              ? 'var(--text-primary)'
              : isDisabled
                ? 'var(--text-tertiary)'
                : 'var(--text-secondary)',
            boxShadow: isSelected
              ? '0 1px 4px rgba(0,0,0,0.08), 0 0.5px 1px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)'
              : 'none',

            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            letterSpacing: '-0.01em'
          }}
        >
          {opt.label}
        </div>
      );
    })}
  </div>
);

export default SegmentedControl;
