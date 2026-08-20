import React from 'react';
import L from 'leaflet';

interface ColorLegendItem {
  color: string;
  label: string;
  description: string;
}

export const COLOR_MAP = {
  BUS_ONLINE: '#1a56db',        // Blue - Bus Online
  BUS_OFFLINE: '#ef4444',       // Red - Bus Offline
  STUDENT: '#10b981',           // Green - Student
  ROUTE_ACTIVE: '#3b82f6',      // Light Blue - Active Route
  ROUTE_INACTIVE: '#d1d5db',    // Gray - Inactive Route
  STATUS_ARRIVING: '#f59e0b',   // Amber - Arriving
  STATUS_ON_WAY: '#8b5cf6',     // Purple - On Way
  STATUS_OFFLINE: '#ef4444',    // Red - Offline
  GEOFENCE_SCHOOL: '#10b981',   // Green - School Zone
  GEOFENCE_HOME: '#3b82f6',     // Blue - Home Zone
} as const;

const colorLegendItems: ColorLegendItem[] = [
  {
    color: COLOR_MAP.BUS_ONLINE,
    label: 'Bus Online',
    description: 'Bus is actively tracking'
  },
  {
    color: COLOR_MAP.BUS_OFFLINE,
    label: 'Bus Offline',
    description: 'Bus not currently tracking'
  },
  {
    color: COLOR_MAP.STUDENT,
    label: 'Student Location',
    description: 'Current student position'
  },
  {
    color: COLOR_MAP.STATUS_ARRIVING,
    label: 'Arriving',
    description: 'Bus arriving soon (2-5 min)'
  },
  {
    color: COLOR_MAP.STATUS_ON_WAY,
    label: 'On Way',
    description: 'Bus heading to student'
  },
  {
    color: COLOR_MAP.GEOFENCE_SCHOOL,
    label: 'School Zone',
    description: 'School location area'
  },
];

interface ColorLegendProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  collapsed?: boolean;
}

export const ColorMapLegend: React.FC<ColorLegendProps> = ({ 
  position = 'top-left', 
  collapsed = false 
}) => {
  const [isExpanded, setIsExpanded] = React.useState(!collapsed);

  const positionClasses = {
    'top-left': { top: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' },
  };

  return (
    <div
      style={{
        position: 'absolute',
        ...positionClasses[position],
        zIndex: 1000,
        maxWidth: '280px',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: '#f3f4f6',
            borderBottom: '1px solid #e5e7eb',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
            📍 Color Map
          </h3>
          <span
            style={{
              fontSize: '18px',
              transition: 'transform 0.3s ease',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            ▼
          </span>
        </div>

        {/* Legend Items */}
        {isExpanded && (
          <div style={{ padding: '12px 16px', maxHeight: '400px', overflowY: 'auto' }}>
            {colorLegendItems.map((item, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: index < colorLegendItems.length - 1 ? '12px' : '0',
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(243, 244, 246, 0.5)',
                }}
              >
                {/* Color Box */}
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    backgroundColor: item.color,
                    borderRadius: '4px',
                    flexShrink: 0,
                    boxShadow: `0 2px 4px ${item.color}40`,
                    border: '2px solid white',
                  }}
                />

                {/* Label and Description */}
                <div style={{ flex: 1 }}>
                  <p style={{
                    margin: '0 0 2px 0',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#1f2937',
                  }}>
                    {item.label}
                  </p>
                  <p style={{
                    margin: 0,
                    fontSize: '12px',
                    color: '#6b7280',
                    lineHeight: '1.3',
                  }}>
                    {item.description}
                  </p>
                </div>
              </div>
            ))}

            {/* Legend Footer */}
            <div
              style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #e5e7eb',
                fontSize: '11px',
                color: '#9ca3af',
                textAlign: 'center',
                fontStyle: 'italic',
              }}
            >
              Real-time location tracking
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Get marker color based on bus status
 */
export const getMarkerColorByStatus = (status: string): string => {
  switch (status?.toLowerCase()) {
    case 'online':
    case 'active':
      return COLOR_MAP.BUS_ONLINE;
    case 'arriving':
      return COLOR_MAP.STATUS_ARRIVING;
    case 'on_way':
    case 'on way':
      return COLOR_MAP.STATUS_ON_WAY;
    case 'offline':
    case 'inactive':
    default:
      return COLOR_MAP.BUS_OFFLINE;
  }
};

/**
 * Get route line color based on bus status
 */
export const getRouteColorByStatus = (isActive: boolean): string => {
  return isActive ? COLOR_MAP.ROUTE_ACTIVE : COLOR_MAP.ROUTE_INACTIVE;
};

/**
 * Create a dynamic bus icon with status color
 */
export const createBusIconWithColor = (color: string = COLOR_MAP.BUS_ONLINE) => {
  return L.divIcon({
    className: 'custom-bus-icon',
    html: `<div style="
      position: relative;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        position: absolute;
        width: 50px;
        height: 50px;
        background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%);
        border-radius: 50% 50% 50% 0%;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 4px 12px ${color}66, 0 0 20px ${color}33;
      "></div>
      <span style="
        position: relative;
        transform: rotate(45deg);
        font-size: 24px;
        z-index: 2;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
      ">🚌</span>
    </div>`,
    iconSize: [50, 50],
    iconAnchor: [25, 50],
    popupAnchor: [0, -50]
  });
};

/**
 * Create a dynamic student icon with highlight
 */
export const createStudentIcon = (color: string = COLOR_MAP.STUDENT) => {
  return L.divIcon({
    className: 'custom-student-icon',
    html: `<div class="pulse-ring"></div>
           <div style="background: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px ${color}80;"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

export default ColorMapLegend;
