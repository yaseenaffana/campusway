import React from 'react';
import './RouteCard.css';

interface RouteCardProps {
  route: string;
  busLabel: string;
  status: 'live' | 'ready' | 'spare';
  meta?: string | null;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const STATUS_LABELS: Record<RouteCardProps['status'], string> = {
  live: 'Live',
  ready: 'Ready',
  spare: 'Spare'
};

const RouteCard: React.FC<RouteCardProps> = ({
  route,
  busLabel,
  status,
  meta,
  selected = false,
  disabled = false,
  onClick
}) => {
  const interactive = Boolean(onClick) && !disabled;
  const className = [
    'route-card',
    interactive ? 'route-card--interactive' : '',
    selected ? 'route-card--selected' : '',
    status === 'live' ? 'route-card--live' : '',
    status === 'spare' ? 'route-card--spare' : ''
  ].filter(Boolean).join(' ');

  const content = (
    <>
      <div className="route-card__header">
        <span className="route-card__eyebrow">Bus Route</span>
        <span className={`route-card__badge route-card__badge--${status}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>
      <div className="route-card__bus-top">{busLabel}</div>
      <div className="route-card__route">{route || 'Route not assigned'}</div>
      <div className="route-card__bus"></div>
      <div className={`route-card__meta ${meta ? '' : 'route-card__meta--muted'}`}>
        {meta || ''}
      </div>
    </>
  );

  if (!interactive) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  );
};

export default RouteCard;
